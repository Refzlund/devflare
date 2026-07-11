// =============================================================================
// R2 Presigned URL Integration Tests
// =============================================================================
// Proves the full local presign flow against a real Miniflare gateway over
// real HTTP: mint with `presignR2Put`/`presignR2Get` (devflare/runtime), then
// upload/download browser-style with plain `fetch()`. Covers the enforcement
// guarantees (signature, expiry, method, content type, exact/max size) that
// make local behavior match a real R2 presigned URL.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { type MiniflareInstance, startMiniflare } from '../../../src/bridge/miniflare'
import { presignR2Get, presignR2Put } from '../../../src/runtime/r2-presign'
import { PORTS } from './_fixtures'

/** Recompute the local HMAC signature the same way the presigner/gateway do. */
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

describe('R2 Presigned URLs (local gateway)', () => {
	let mf: MiniflareInstance
	let env: Record<string, string>

	beforeAll(async () => {
		mf = await startMiniflare({
			port: PORTS.r2Presign,
			r2Buckets: ['TEST_BUCKET'],
			persist: false,
			verbose: false
		})

		// The env a consuming app would see in devflare dev/test: the local
		// presign context rides on DEVFLARE_R2_PRESIGN_* values.
		expect(mf.r2Presign).not.toBeNull()
		env = {
			DEVFLARE_R2_PRESIGN_SECRET: mf.r2Presign!.secret,
			DEVFLARE_R2_PRESIGN_ORIGIN: mf.r2Presign!.origin
		}
	})

	afterAll(async () => {
		await mf.dispose()
	})

	test('browser-style presigned PUT writes to the bucket; GET/HEAD read it back', async () => {
		const body = new Uint8Array(2048)
		for (let i = 0; i < body.length; i++) body[i] = i % 256

		const put = await presignR2Put(env, 'TEST_BUCKET', 'uploads/photo.png', {
			expiresIn: 120,
			contentType: 'image/png',
			contentLength: body.byteLength
		})

		// Browser-style upload: plain fetch, no bindings, real HTTP.
		const putResponse = await fetch(put.url, {
			method: 'PUT',
			headers: put.headers,
			body
		})
		expect(putResponse.status).toBe(200)
		expect(putResponse.headers.get('ETag')).toBeTruthy()
		expect(putResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')

		// The object landed in the real local bucket with metadata intact.
		const object = await (await mf.getR2Bucket('TEST_BUCKET')).head('uploads/photo.png')
		expect(object).not.toBeNull()
		expect(object!.size).toBe(body.byteLength)
		expect(object!.httpMetadata?.contentType).toBe('image/png')

		// Presigned GET reads it back with size + content type.
		const get = await presignR2Get(env, 'TEST_BUCKET', 'uploads/photo.png')
		const getResponse = await fetch(get.url)
		expect(getResponse.status).toBe(200)
		expect(getResponse.headers.get('Content-Type')).toBe('image/png')
		expect(getResponse.headers.get('Content-Length')).toBe(String(body.byteLength))
		expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(body)

		// The finalize pattern: HEAD on the same presigned GET URL.
		const headResponse = await fetch(get.url, { method: 'HEAD' })
		expect(headResponse.status).toBe(200)
		expect(headResponse.headers.get('Content-Length')).toBe(String(body.byteLength))
	})

	test('keys with spaces, unicode and nested folders round-trip', async () => {
		const key = 'nested folder/übör (1)/file name.txt'
		const put = await presignR2Put(env, 'TEST_BUCKET', key, { contentType: 'text/plain' })

		const putResponse = await fetch(put.url, {
			method: 'PUT',
			headers: put.headers,
			body: 'hello special keys'
		})
		expect(putResponse.status).toBe(200)

		const object = await (await mf.getR2Bucket('TEST_BUCKET')).get(key)
		expect(object).not.toBeNull()
		expect(await object!.text()).toBe('hello special keys')
	})

	test('OPTIONS preflight succeeds without a signature (browser CORS)', async () => {
		const put = await presignR2Put(env, 'TEST_BUCKET', 'cors-check.bin')
		const response = await fetch(put.url, { method: 'OPTIONS' })
		expect(response.status).toBe(204)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT')
	})

	test('rejects a tampered signature', async () => {
		const put = await presignR2Put(env, 'TEST_BUCKET', 'tampered.bin')
		const url = new URL(put.url)
		url.searchParams.set('X-Devflare-Signature', '0'.repeat(64))

		const response = await fetch(url, { method: 'PUT', body: 'nope' })
		expect(response.status).toBe(403)
		const payload = (await response.json()) as { error: { code: string } }
		expect(payload.error.code).toBe('invalid_signature')
	})

	test('rejects a tampered key (signature covers the path)', async () => {
		const put = await presignR2Put(env, 'TEST_BUCKET', 'intended-key.bin')
		const tamperedUrl = put.url.replace('intended-key.bin', 'other-key.bin')

		const response = await fetch(tamperedUrl, { method: 'PUT', body: 'nope' })
		expect(response.status).toBe(403)

		const object = await (await mf.getR2Bucket('TEST_BUCKET')).head('other-key.bin')
		expect(object).toBeNull()
	})

	test('rejects an expired URL', async () => {
		// Deterministic: hand-sign a URL whose expiry lies in the past (a valid
		// signature over stale parameters), instead of sleeping past a fresh one.
		// Also pins the canonical-string format shared by presigner and gateway.
		const expires = Math.floor(Date.now() / 1000) - 10
		const canonical = [
			'devflare:r2-presign:v1',
			'PUT',
			'TEST_BUCKET',
			'expired.bin',
			String(expires),
			'',
			'',
			''
		].join('\n')
		const signature = await hmacHex(env.DEVFLARE_R2_PRESIGN_SECRET, canonical)
		const url =
			`${env.DEVFLARE_R2_PRESIGN_ORIGIN}/_devflare/r2/presigned/TEST_BUCKET/expired.bin` +
			`?X-Devflare-Method=PUT&X-Devflare-Expires=${expires}&X-Devflare-Signature=${signature}`

		const response = await fetch(url, { method: 'PUT', body: 'late' })
		expect(response.status).toBe(403)
		const payload = (await response.json()) as { error: { code: string } }
		expect(payload.error.code).toBe('expired')
	})

	test('rejects the wrong method', async () => {
		const put = await presignR2Put(env, 'TEST_BUCKET', 'method-check.bin')
		const response = await fetch(put.url, { method: 'GET' })
		expect(response.status).toBe(403)
		const payload = (await response.json()) as { error: { code: string } }
		expect(payload.error.code).toBe('method_mismatch')
	})

	test('rejects a mismatching content type', async () => {
		const put = await presignR2Put(env, 'TEST_BUCKET', 'type-check.bin', {
			contentType: 'image/png'
		})

		const response = await fetch(put.url, {
			method: 'PUT',
			headers: { 'content-type': 'application/zip' },
			body: 'zip-pretender'
		})
		expect(response.status).toBe(403)
		const payload = (await response.json()) as { error: { code: string } }
		expect(payload.error.code).toBe('content_type_mismatch')
	})

	test('rejects a body that differs from the signed exact size', async () => {
		const put = await presignR2Put(env, 'TEST_BUCKET', 'exact-size.bin', {
			contentLength: 10
		})

		const response = await fetch(put.url, {
			method: 'PUT',
			body: new Uint8Array(11)
		})
		expect(response.status).toBe(403)
		const payload = (await response.json()) as { error: { code: string } }
		expect(payload.error.code).toBe('content_length_mismatch')
	})

	test('rejects an oversized body (quota guard)', async () => {
		const put = await presignR2Put(env, 'TEST_BUCKET', 'oversize.bin', {
			maxSizeBytes: 1024
		})

		const response = await fetch(put.url, {
			method: 'PUT',
			body: new Uint8Array(4096)
		})
		expect(response.status).toBe(413)
		const payload = (await response.json()) as { error: { code: string } }
		expect(payload.error.code).toBe('too_large')

		const object = await (await mf.getR2Bucket('TEST_BUCKET')).head('oversize.bin')
		expect(object).toBeNull()
	})

	test('presigned GET of a missing object returns 404', async () => {
		const get = await presignR2Get(env, 'TEST_BUCKET', 'never-uploaded.bin')
		const response = await fetch(get.url)
		expect(response.status).toBe(404)
	})

	test('unknown binding returns 404 without leaking bucket contents', async () => {
		// Sign for a binding this instance does not have — signature is valid,
		// the binding lookup is what fails.
		const put = await presignR2Put(env, 'NOT_A_BINDING', 'x.bin')
		const response = await fetch(put.url, { method: 'PUT', body: 'x' })
		expect(response.status).toBe(404)
		const payload = (await response.json()) as { error: { code: string } }
		expect(payload.error.code).toBe('unknown_binding')
	})
})
