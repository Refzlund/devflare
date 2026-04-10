// =============================================================================
// Durable Object RPC Integration Tests
// =============================================================================
// Tests DO RPC pattern: env.MY_DO.getByName('name').methodName()
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import type { MiniflareInstance } from '../../../src/bridge/miniflare'
import { counterDoWorkerScript, wrapMiniflare, callDoRpc, PORTS } from './_fixtures'

// =============================================================================
// Tests
// =============================================================================

describe('Durable Object Integration', () => {
	let mf: MiniflareInstance

	beforeAll(async () => {
		const { Miniflare } = await import('miniflare')

		const miniflare = new Miniflare({
			modules: true,
			script: counterDoWorkerScript,
			durableObjects: {
				COUNTER: 'CounterDO'
			},
			port: PORTS.durableObject
		})

		await miniflare.ready
		mf = wrapMiniflare(miniflare)
	})

	afterAll(async () => {
		await mf.dispose()
	})

	describe('DO Namespace Operations', () => {
		test('can get DO namespace from Miniflare', async () => {
			const ns = await mf.getDurableObjectNamespace('COUNTER')
			expect(ns).toBeDefined()
			expect(typeof ns.idFromName).toBe('function')
		})

		test('can create ID from name', async () => {
			const ns = await mf.getDurableObjectNamespace('COUNTER')
			const id = ns.idFromName('test-counter')
			expect(id).toBeDefined()
			expect(typeof id.toString).toBe('function')
		})

		test('can get stub from ID', async () => {
			const ns = await mf.getDurableObjectNamespace('COUNTER')
			const id = ns.idFromName('test-counter-2')
			const stub = ns.get(id)
			expect(stub).toBeDefined()
			expect(typeof stub.fetch).toBe('function')
		})
	})

	describe('DO Fetch Operations', () => {
		test('can fetch from DO stub', async () => {
			const ns = await mf.getDurableObjectNamespace('COUNTER')
			const id = ns.idFromName('fetch-test')
			const stub = ns.get(id)

			const response = await stub.fetch('http://do/')
			expect(response.status).toBe(200)
			const text = await response.text()
			expect(text).toContain('Counter:')
		})
	})

	describe('DO RPC Pattern', () => {
		test('can call RPC method via fetch to /_rpc', async () => {
			const ns = await mf.getDurableObjectNamespace('COUNTER')
			const id = ns.idFromName('rpc-test')
			const stub = ns.get(id)

			// Reset first
			const resetRes = await stub.fetch('http://do/_rpc', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ method: 'reset', params: [] })
			})
			const resetData = await resetRes.json() as { ok: boolean; result: number }
			expect(resetData.ok).toBe(true)
			expect(resetData.result).toBe(0)

			// Increment
			const incRes = await stub.fetch('http://do/_rpc', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ method: 'increment', params: [] })
			})
			const incData = await incRes.json() as { ok: boolean; result: number }
			expect(incData.ok).toBe(true)
			expect(incData.result).toBe(1)

			// Get count
			const getRes = await stub.fetch('http://do/_rpc', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ method: 'getCount', params: [] })
			})
			const getData = await getRes.json() as { ok: boolean; result: number }
			expect(getData.ok).toBe(true)
			expect(getData.result).toBe(1)
		})

		test('RPC preserves state across calls', async () => {
			const ns = await mf.getDurableObjectNamespace('COUNTER')
			const id = ns.idFromName('state-test')
			const stub = ns.get(id)

			// Helper to call RPC
			const callRpc = async (method: string, params: unknown[] = []) => {
				const res = await stub.fetch('http://do/_rpc', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ method, params })
				})
				return (await res.json()) as { ok: boolean; result: number }
			}

			// Reset
			await callRpc('reset')

			// Multiple increments
			const r1 = await callRpc('increment')
			const r2 = await callRpc('increment')
			const r3 = await callRpc('increment')

			expect(r1.result).toBe(1)
			expect(r2.result).toBe(2)
			expect(r3.result).toBe(3)

			// Decrement
			const r4 = await callRpc('decrement')
			expect(r4.result).toBe(2)

			// Final count
			const r5 = await callRpc('getCount')
			expect(r5.result).toBe(2)
		})

		test('different DO instances have separate state', async () => {
			const ns = await mf.getDurableObjectNamespace('COUNTER')

			// Helper to call RPC on a specific instance
			const callRpc = async (name: string, method: string, params: unknown[] = []) => {
				const id = ns.idFromName(name)
				const stub = ns.get(id)
				const res = await stub.fetch('http://do/_rpc', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ method, params })
				})
				return (await res.json()) as { ok: boolean; result: number }
			}

			// Reset both
			await callRpc('instance-a', 'reset')
			await callRpc('instance-b', 'reset')

			// Increment A three times
			await callRpc('instance-a', 'increment')
			await callRpc('instance-a', 'increment')
			await callRpc('instance-a', 'increment')

			// Increment B once
			await callRpc('instance-b', 'increment')

			// Verify separate state
			const countA = await callRpc('instance-a', 'getCount')
			const countB = await callRpc('instance-b', 'getCount')

			expect(countA.result).toBe(3)
			expect(countB.result).toBe(1)
		})
	})
})
