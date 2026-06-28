// =============================================================================
// R2 HTTP Transfer Integration Tests
// =============================================================================
// Tests large file upload/download via HTTP transfer path
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { type MiniflareInstance, startMiniflare } from '../../../src/bridge/miniflare'
import { PORTS } from './_fixtures'

describe('R2 HTTP Transfer', () => {
	let mf: MiniflareInstance

	beforeAll(async () => {
		mf = await startMiniflare({
			port: PORTS.r2Transfer,
			r2Buckets: ['TEST_BUCKET'],
			persist: false,
			verbose: false
		})
	})

	afterAll(async () => {
		await mf.dispose()
	})

	describe('Direct R2 Operations via Miniflare', () => {
		test('can put and get small files', async () => {
			const r2 = await mf.getR2Bucket('TEST_BUCKET')
			const content = 'Hello, R2!'

			await r2.put('small-file.txt', content)

			const obj = await r2.get('small-file.txt')
			expect(obj).not.toBeNull()
			const text = await obj!.text()
			expect(text).toBe(content)
		})

		test('can put and get binary data', async () => {
			const r2 = await mf.getR2Bucket('TEST_BUCKET')
			const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

			await r2.put('binary-file.bin', data)

			const obj = await r2.get('binary-file.bin')
			expect(obj).not.toBeNull()
			const buffer = await obj!.arrayBuffer()
			expect(new Uint8Array(buffer)).toEqual(data)
		})

		test('can put large files (1MB+)', async () => {
			const r2 = await mf.getR2Bucket('TEST_BUCKET')

			// Create 1MB of data
			const size = 1024 * 1024
			const data = new Uint8Array(size)
			for (let i = 0; i < size; i++) {
				data[i] = i % 256
			}

			await r2.put('large-file.bin', data)

			const obj = await r2.get('large-file.bin')
			expect(obj).not.toBeNull()
			expect(obj!.size).toBe(size)

			// Verify first and last bytes
			const buffer = await obj!.arrayBuffer()
			const result = new Uint8Array(buffer)
			expect(result[0]).toBe(0)
			expect(result[255]).toBe(255)
			expect(result[256]).toBe(0)
			expect(result[size - 1]).toBe((size - 1) % 256)
		})

		test('can head files without downloading', async () => {
			const r2 = await mf.getR2Bucket('TEST_BUCKET')
			await r2.put('head-test.txt', 'Some content for head test')

			const obj = await r2.head('head-test.txt')
			expect(obj).not.toBeNull()
			expect(obj!.key).toBe('head-test.txt')
			expect(obj!.size).toBe(26)
		})

		test('can delete files', async () => {
			const r2 = await mf.getR2Bucket('TEST_BUCKET')
			await r2.put('delete-me.txt', 'To be deleted')

			// Verify it exists
			let obj = await r2.get('delete-me.txt')
			expect(obj).not.toBeNull()

			// Delete it
			await r2.delete('delete-me.txt')

			// Verify it's gone
			obj = await r2.get('delete-me.txt')
			expect(obj).toBeNull()
		})

		test('can list files', async () => {
			const r2 = await mf.getR2Bucket('TEST_BUCKET')

			// Put some files with prefix
			await r2.put('list-test/a.txt', 'a')
			await r2.put('list-test/b.txt', 'b')
			await r2.put('list-test/c.txt', 'c')

			const result = await r2.list({ prefix: 'list-test/' })
			expect(result.objects.length).toBeGreaterThanOrEqual(3)

			const keys = result.objects.map((o) => o.key)
			expect(keys).toContain('list-test/a.txt')
			expect(keys).toContain('list-test/b.txt')
			expect(keys).toContain('list-test/c.txt')
		})

		test('can store and retrieve with metadata', async () => {
			const r2 = await mf.getR2Bucket('TEST_BUCKET')

			await r2.put('with-metadata.txt', 'Content with metadata', {
				httpMetadata: {
					contentType: 'text/plain',
					contentLanguage: 'en-US'
				},
				customMetadata: {
					author: 'Test',
					version: '1.0'
				}
			})

			const obj = await r2.get('with-metadata.txt')
			expect(obj).not.toBeNull()
			expect(obj!.httpMetadata?.contentType).toBe('text/plain')
			expect(obj!.customMetadata?.author).toBe('Test')
			expect(obj!.customMetadata?.version).toBe('1.0')
		})
	})

	describe('Gateway HTTP Transfer Endpoint', () => {
		test('health endpoint lists R2 bucket', async () => {
			const response = await mf.dispatchFetch('http://localhost/_devflare/health')
			expect(response.status).toBe(200)

			const data = (await response.json()) as { status?: string; ok?: boolean; bindings: string[] }
			expect(data.bindings).toContain('TEST_BUCKET')
		})
	})
})

describe('R2 Large File Simulation', () => {
	let mf: MiniflareInstance

	beforeAll(async () => {
		mf = await startMiniflare({
			port: PORTS.r2Large,
			r2Buckets: ['LARGE_BUCKET'],
			persist: false
		})
	})

	afterAll(async () => {
		await mf.dispose()
	})

	test('can handle 5MB file', async () => {
		const r2 = await mf.getR2Bucket('LARGE_BUCKET')

		// Create 5MB of data
		const size = 5 * 1024 * 1024
		const data = new Uint8Array(size)
		// Fill with pattern
		for (let i = 0; i < size; i++) {
			data[i] = (i * 7) % 256
		}

		const startPut = Date.now()
		await r2.put('5mb-file.bin', data)
		const putTime = Date.now() - startPut

		const startGet = Date.now()
		const obj = await r2.get('5mb-file.bin')
		const getTime = Date.now() - startGet

		expect(obj).not.toBeNull()
		expect(obj!.size).toBe(size)

		// Verify integrity by checking some bytes
		const buffer = await obj!.arrayBuffer()
		const result = new Uint8Array(buffer)
		expect(result[0]).toBe(0)
		expect(result[1000]).toBe((1000 * 7) % 256)
		expect(result[1000000]).toBe((1000000 * 7) % 256)
	})

	test('can handle Blob upload (simulating stream)', async () => {
		const r2 = await mf.getR2Bucket('LARGE_BUCKET')

		// Create 1MB of data as Blob (has known length, unlike streams)
		const size = 1024 * 1024
		const data = new Uint8Array(size)
		for (let i = 0; i < size; i++) {
			data[i] = (i * 7) % 256
		}

		const blob = new Blob([data], { type: 'application/octet-stream' })

		// Miniflare R2 accepts Blob directly
		await r2.put('blob-file.bin', blob as Parameters<typeof r2.put>[1])

		const obj = await r2.get('blob-file.bin')
		expect(obj).not.toBeNull()
		expect(obj!.size).toBe(size)

		// Verify integrity
		const buffer = await obj!.arrayBuffer()
		const result = new Uint8Array(buffer)
		expect(result[0]).toBe(0)
		expect(result[1000]).toBe((1000 * 7) % 256)
	})
})
