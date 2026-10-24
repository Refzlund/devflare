// =============================================================================
// R2 Presign Unit Tests — URL minting for local + remote modes
// =============================================================================
// Local-mode signature correctness is proven end-to-end against the real
// gateway in tests/integration/bridge/r2-presign.test.ts; this file covers
// URL shape, mode detection, option validation and env/credential resolution.
// =============================================================================

import { afterEach, describe, expect, test } from 'bun:test'
import { presignR2Get, presignR2Put } from '../../../src/runtime/r2-presign'

const LOCAL_ENV = {
	DEVFLARE_R2_PRESIGN_SECRET: 'unit-test-secret',
	DEVFLARE_R2_PRESIGN_ORIGIN: 'http://127.0.0.1:8787'
}

const REMOTE_ENV = {
	R2_ACCOUNT_ID: 'acc0unt1d',
	R2_ACCESS_KEY_ID: 'AKIDEXAMPLE',
	R2_SECRET_ACCESS_KEY: 'secret-key-material',
	DEVFLARE_R2_BUCKETS: JSON.stringify({
		BUCKET: { bucketName: 'uploads' },
		EU_BUCKET: { bucketName: 'uploads-eu', jurisdiction: 'eu' }
	})
}

/** Recompute the local HMAC signature the same way the gateway does. */
async function hmacHex(secret: string, message: string): Promise<string> {
	const encoder = new TextEncoder()
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	)
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
	return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

afterEach(() => {
	delete process.env.DEVFLARE_R2_PRESIGN_SECRET
	delete process.env.DEVFLARE_R2_PRESIGN_ORIGIN
})

describe('presignR2Put — local mode', () => {
	test('mints a gateway URL with signed parameters', async () => {
		const result = await presignR2Put(LOCAL_ENV, 'BUCKET', 'media/photo.png', {
			expiresIn: 600,
			contentType: 'image/png',
			contentLength: 1234,
			maxSizeBytes: 5000
		})

		expect(result.mode).toBe('local')
		expect(result.method).toBe('PUT')
		expect(result.headers).toEqual({ 'content-type': 'image/png' })
		expect(result.key).toBe('media/photo.png')

		const url = new URL(result.url)
		expect(url.origin).toBe('http://127.0.0.1:8787')
		expect(url.pathname).toBe('/_devflare/r2/presigned/BUCKET/media/photo.png')
		expect(url.searchParams.get('X-Devflare-Method')).toBe('PUT')
		expect(url.searchParams.get('X-Devflare-Content-Type')).toBe('image/png')
		expect(url.searchParams.get('X-Devflare-Content-Length')).toBe('1234')
		expect(url.searchParams.get('X-Devflare-Max-Size')).toBe('5000')

		const expires = Number(url.searchParams.get('X-Devflare-Expires'))
		const nowSeconds = Math.floor(Date.now() / 1000)
		expect(expires).toBeGreaterThanOrEqual(nowSeconds + 595)
		expect(expires).toBeLessThanOrEqual(nowSeconds + 605)
		expect(result.expiresAt.getTime()).toBe(expires * 1000)

		// The signature must match the documented canonical string format.
		const canonical = [
			'devflare:r2-presign:v1',
			'PUT',
			'BUCKET',
			'media/photo.png',
			String(expires),
			'image/png',
			'1234',
			'5000'
		].join('\n')
		expect(url.searchParams.get('X-Devflare-Signature')).toBe(
			await hmacHex(LOCAL_ENV.DEVFLARE_R2_PRESIGN_SECRET, canonical)
		)
	})

	test('percent-encodes key segments while preserving slashes', async () => {
		const result = await presignR2Put(LOCAL_ENV, 'BUCKET', 'a folder/übör (1).png')
		const url = new URL(result.url)
		expect(url.pathname).toBe(
			'/_devflare/r2/presigned/BUCKET/a%20folder/%C3%BCb%C3%B6r%20%281%29.png'
		)
	})

	test('falls back to process.env for the local context', async () => {
		process.env.DEVFLARE_R2_PRESIGN_SECRET = 'proc-secret'
		process.env.DEVFLARE_R2_PRESIGN_ORIGIN = 'http://localhost:9999'

		const result = await presignR2Put({}, 'BUCKET', 'x.txt')
		expect(result.mode).toBe('local')
		expect(new URL(result.url).origin).toBe('http://localhost:9999')
	})

	test('presignR2Get mints a GET URL without required headers', async () => {
		const result = await presignR2Get(LOCAL_ENV, 'BUCKET', 'media/photo.png')
		expect(result.mode).toBe('local')
		expect(result.method).toBe('GET')
		expect(result.headers).toEqual({})
		expect(new URL(result.url).searchParams.get('X-Devflare-Method')).toBe('GET')
	})
})

describe('presignR2Put — remote mode (S3 SigV4)', () => {
	test('mints a SigV4 URL against the R2 endpoint with signed enforcement headers', async () => {
		const result = await presignR2Put(REMOTE_ENV, 'BUCKET', 'media/photo.png', {
			expiresIn: 3600,
			contentType: 'image/png',
			contentLength: 1234
		})

		expect(result.mode).toBe('remote')
		expect(result.headers).toEqual({ 'content-type': 'image/png' })

		const url = new URL(result.url)
		expect(url.origin).toBe('https://acc0unt1d.r2.cloudflarestorage.com')
		expect(url.pathname).toBe('/uploads/media/photo.png')
		expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
		expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIDEXAMPLE/')
		expect(url.searchParams.get('X-Amz-Credential')).toContain('/auto/s3/aws4_request')
		expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')
		expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)

		// content-type + content-length signed ⇒ R2 enforces them on the PUT.
		const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders') ?? ''
		expect(signedHeaders).toContain('content-length')
		expect(signedHeaders).toContain('content-type')
		expect(signedHeaders).toContain('host')
	})

	test('uses the jurisdiction-specific endpoint host', async () => {
		const result = await presignR2Get(REMOTE_ENV, 'EU_BUCKET', 'x.txt')
		expect(new URL(result.url).origin).toBe('https://acc0unt1d.eu.r2.cloudflarestorage.com')
	})

	test('honors bucketName/jurisdiction/credentials overrides', async () => {
		const result = await presignR2Put({}, 'ANY', 'x.txt', {
			bucketName: 'override-bucket',
			jurisdiction: 'fedramp',
			credentials: {
				accountId: 'other',
				accessKeyId: 'AK',
				secretAccessKey: 'SK'
			}
		})
		const url = new URL(result.url)
		expect(url.origin).toBe('https://other.fedramp.r2.cloudflarestorage.com')
		expect(url.pathname).toBe('/override-bucket/x.txt')
	})

	test('accepts an object-valued DEVFLARE_R2_BUCKETS (wrangler JSON var)', async () => {
		const env = {
			...REMOTE_ENV,
			DEVFLARE_R2_BUCKETS: { BUCKET: { bucketName: 'from-object' } }
		}
		const result = await presignR2Get(env, 'BUCKET', 'x.txt')
		expect(new URL(result.url).pathname).toBe('/from-object/x.txt')
	})

	test('throws naming the missing credentials', async () => {
		const env = { R2_ACCOUNT_ID: 'acc' }
		expect(presignR2Put(env, 'BUCKET', 'x.txt')).rejects.toThrow(
			/R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY/
		)
	})

	test('throws when the bucket mapping cannot be resolved', async () => {
		const env = {
			R2_ACCOUNT_ID: 'a',
			R2_ACCESS_KEY_ID: 'b',
			R2_SECRET_ACCESS_KEY: 'c'
		}
		expect(presignR2Put(env, 'UNKNOWN', 'x.txt')).rejects.toThrow(/DEVFLARE_R2_BUCKETS/)
	})
})

describe('presignR2Put — input validation', () => {
	test.each([
		['empty key', () => presignR2Put(LOCAL_ENV, 'BUCKET', '')],
		['leading-slash key', () => presignR2Put(LOCAL_ENV, 'BUCKET', '/x.txt')],
		['newline in key', () => presignR2Put(LOCAL_ENV, 'BUCKET', 'a\nb.txt')],
		['control char in binding', () => presignR2Put(LOCAL_ENV, 'BUC\tKET', 'x.txt')],
		['empty binding', () => presignR2Put(LOCAL_ENV, '', 'x.txt')],
		['zero expiry', () => presignR2Put(LOCAL_ENV, 'BUCKET', 'x', { expiresIn: 0 })],
		['expiry above 7 days', () => presignR2Put(LOCAL_ENV, 'BUCKET', 'x', { expiresIn: 604801 })],
		['negative contentLength', () => presignR2Put(LOCAL_ENV, 'BUCKET', 'x', { contentLength: -1 })],
		['zero maxSizeBytes', () => presignR2Put(LOCAL_ENV, 'BUCKET', 'x', { maxSizeBytes: 0 })],
		[
			'contentLength above maxSizeBytes',
			() => presignR2Put(LOCAL_ENV, 'BUCKET', 'x', { contentLength: 10, maxSizeBytes: 5 })
		]
	])('rejects %s', async (_label, run) => {
		expect(run()).rejects.toThrow()
	})
})
