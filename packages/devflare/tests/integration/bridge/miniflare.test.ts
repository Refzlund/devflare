// =============================================================================
// Bridge Integration Tests — Miniflare Orchestration & DO RPC
// =============================================================================
// Tests the full bridge stack: Miniflare → Gateway Worker → RPC → Proxy
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	type MiniflareInstance,
	startMiniflare,
	stopMiniflare
} from '../../../src/bridge/miniflare'
import { PORTS } from './_fixtures'

describe('Miniflare Orchestration', () => {
	let mf: MiniflareInstance

	beforeAll(async () => {
		mf = await startMiniflare({
			port: PORTS.miniflare,
			kvNamespaces: ['TEST_KV'],
			persist: false,
			verbose: false
		})
	})

	afterAll(async () => {
		await mf.dispose()
	})

	describe('KV Namespace', () => {
		test('can get and put values', async () => {
			const kv = await mf.getKVNamespace('TEST_KV')
			await kv.put('test-key', 'test-value')
			const value = await kv.get('test-key', 'text')
			expect(value).toBe('test-value')
		})

		test('can delete values', async () => {
			const kv = await mf.getKVNamespace('TEST_KV')
			await kv.put('delete-me', 'value')
			await kv.delete('delete-me')
			const value = await kv.get('delete-me')
			expect(value).toBeNull()
		})

		test('can list keys', async () => {
			const kv = await mf.getKVNamespace('TEST_KV')
			await kv.put('list-a', 'a')
			await kv.put('list-b', 'b')
			const result = await kv.list({ prefix: 'list-' })
			expect(result.keys.length).toBeGreaterThanOrEqual(2)
			expect(result.keys.some((k) => k.name === 'list-a')).toBe(true)
			expect(result.keys.some((k) => k.name === 'list-b')).toBe(true)
		})

		test('returns null for non-existent keys', async () => {
			const kv = await mf.getKVNamespace('TEST_KV')
			const value = await kv.get('non-existent-key')
			expect(value).toBeNull()
		})
	})

	describe('dispatchFetch', () => {
		test('can dispatch requests to gateway', async () => {
			const response = await mf.dispatchFetch('http://localhost/')
			expect(response.status).toBe(200)
			const text = await response.text()
			expect(text).toContain('Devflare')
		})

		test('health check returns binding info', async () => {
			const response = await mf.dispatchFetch('http://localhost/_devflare/health')
			expect(response.status).toBe(200)
			const data = (await response.json()) as { status?: string; ok?: boolean; bindings: string[] }
			expect(data.bindings).toContain('TEST_KV')
		})
	})
})

describe('Multiple Miniflare Instances', () => {
	test('can run separate instances on different ports', async () => {
		const mf1 = await startMiniflare({
			port: PORTS.multiInstance1,
			kvNamespaces: ['KV1'],
			persist: false
		})

		const mf2 = await startMiniflare({
			port: PORTS.multiInstance2,
			kvNamespaces: ['KV2'],
			persist: false
		})

		try {
			// Each instance has its own bindings
			const kv1 = await mf1.getKVNamespace('KV1')
			const kv2 = await mf2.getKVNamespace('KV2')

			await kv1.put('instance', '1')
			await kv2.put('instance', '2')

			expect(await kv1.get('instance', 'text')).toBe('1')
			expect(await kv2.get('instance', 'text')).toBe('2')
		} finally {
			await mf1.dispose()
			await mf2.dispose()
		}
	})

	test('uses a string persist value as the persistence directory', async () => {
		const persistDir = await mkdtemp(join(tmpdir(), 'devflare-miniflare-persist-'))
		const persistPort = PORTS.case18Do + 1

		try {
			const firstInstance = await startMiniflare({
				port: persistPort,
				kvNamespaces: ['PERSIST_KV'],
				persist: persistDir
			})

			try {
				const kv = await firstInstance.getKVNamespace('PERSIST_KV')
				await kv.put('persisted-key', 'persisted-value')
			} finally {
				await firstInstance.dispose()
			}

			expect((await readdir(persistDir)).length).toBeGreaterThan(0)

			const secondInstance = await startMiniflare({
				port: persistPort,
				kvNamespaces: ['PERSIST_KV'],
				persist: persistDir
			})

			try {
				const kv = await secondInstance.getKVNamespace('PERSIST_KV')
				expect(await kv.get('persisted-key', 'text')).toBe('persisted-value')
			} finally {
				await secondInstance.dispose()
			}
		} finally {
			await rm(persistDir, { recursive: true, force: true })
		}
	})
})
