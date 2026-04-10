// =============================================================================
// Bridge Proxy Integration Tests
// =============================================================================
// Tests the full bridge pattern: BridgeClient + Proxy → Miniflare Gateway
// This demonstrates the user-facing API: env.MY_DO.getByName('name').method()
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import type { Miniflare } from 'miniflare'
import { BridgeClient } from '../../../src/bridge/client'
import { createEnvProxy, setBindingHints } from '../../../src/bridge/proxy'
import { gatewayWorkerScript, PORTS } from './_fixtures'

// =============================================================================
// Helper Types - RPC stubs return `any` for dynamic method access
// =============================================================================

/**
 * RPC-enabled DurableObjectStub that allows calling any method.
 * Used when testing RPC patterns where methods are dynamically invoked.
 */
type RpcStub = DurableObjectStub & Record<string, (...args: unknown[]) => Promise<unknown>>

/**
 * DurableObjectNamespace with RPC-enabled getByName
 */
type RpcNamespace = Omit<DurableObjectNamespace, 'getByName'> & {
	getByName(name: string): RpcStub
}

// =============================================================================
// Tests
// =============================================================================

describe('Bridge Proxy Integration', () => {
	let miniflare: Miniflare
	let client: BridgeClient
	let env: Record<string, unknown>

	const BRIDGE_PORT = PORTS.bridgeProxy

	beforeAll(async () => {
		// Start Miniflare with gateway worker
		const { Miniflare } = await import('miniflare')

		miniflare = new Miniflare({
			modules: true,
			script: gatewayWorkerScript,
			durableObjects: {
				COUNTER: 'CounterDO'
			},
			kvNamespaces: ['TEST_KV'],
			port: BRIDGE_PORT
		})

		await miniflare.ready

		// Create bridge client
		client = new BridgeClient({
			url: `ws://localhost:${BRIDGE_PORT}`
		})
		await client.connect()

		// Set up binding hints
		setBindingHints({
			TEST_KV: 'kv',
			COUNTER: 'do'
		})

		// Create env proxy
		env = createEnvProxy({ client })
	})

	afterAll(async () => {
		await client.disconnect()
		await miniflare.dispose()
	})

	describe('KV via Proxy', () => {
		test('can put and get values through proxy', async () => {
			const kv = env.TEST_KV as KVNamespace
			await kv.put('proxy-key', 'proxy-value')
			const value = await kv.get('proxy-key')
			expect(value).toBe('proxy-value')
		})

		test('can delete values through proxy', async () => {
			const kv = env.TEST_KV as KVNamespace
			await kv.put('delete-proxy', 'value')
			await kv.delete('delete-proxy')
			const value = await kv.get('delete-proxy')
			expect(value).toBeNull()
		})
	})

	describe('DO RPC via Proxy', () => {
		test('can get DO namespace from env', () => {
			const doNs = env.COUNTER as RpcNamespace
			expect(doNs).toBeDefined()
			expect(typeof doNs.idFromName).toBe('function')
			expect(typeof doNs.getByName).toBe('function')
		})

		test('getByName returns stub with RPC methods', () => {
			const doNs = env.COUNTER as RpcNamespace
			const stub = doNs.getByName('test-counter')
			expect(stub).toBeDefined()
			expect(typeof stub.fetch).toBe('function')
		})

		test('can call DO methods via RPC proxy', async () => {
			const doNs = env.COUNTER as RpcNamespace
			const counter = doNs.getByName('rpc-proxy-test')

			// Reset
			const resetResult = await counter.reset()
			expect(resetResult).toBe(0)

			// Increment
			const inc1 = await counter.increment()
			expect(inc1).toBe(1)

			const inc2 = await counter.increment()
			expect(inc2).toBe(2)

			// Get count
			const count = await counter.getCount()
			expect(count).toBe(2)
		})

		test('DO RPC preserves state across proxy calls', async () => {
			const doNs = env.COUNTER as RpcNamespace
			const counter = doNs.getByName('state-proxy-test')

			await counter.reset()

			// Multiple operations
			await counter.increment()
			await counter.increment()
			await counter.increment()

			const finalCount = await counter.getCount()
			expect(finalCount).toBe(3)
		})

		test('different named DOs have separate state via proxy', async () => {
			const doNs = env.COUNTER as RpcNamespace

			const counterA = doNs.getByName('proxy-a')
			const counterB = doNs.getByName('proxy-b')

			await counterA.reset()
			await counterB.reset()

			await counterA.increment()
			await counterA.increment()
			await counterB.increment()

			expect(await counterA.getCount()).toBe(2)
			expect(await counterB.getCount()).toBe(1)
		})
	})
})
