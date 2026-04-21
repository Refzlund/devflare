// =============================================================================
// Bridge Gateway — executeRpcMethod dispatch tests
// =============================================================================

import { describe, test, expect } from 'bun:test'
import { executeRpcMethod } from '../../../src/bridge/server'
import type { GatewayEnv } from '../../../src/bridge/server'

const noopCtx = {
	waitUntil: () => { },
	passThroughOnException: () => { }
} as unknown as ExecutionContext

describe('executeRpcMethod — namespaced dispatch', () => {
	test('kv.get dispatches to KVNamespace.get', async () => {
		const calls: unknown[][] = []
		const kv = {
			get: (...args: unknown[]) => {
				calls.push(args)
				return 'kv-value'
			},
			put: () => { },
			list: () => { },
			delete: () => { },
			getWithMetadata: () => { }
		}
		const env = { MY_KV: kv } as unknown as GatewayEnv

		const result = await executeRpcMethod('MY_KV.kv.get', ['some-key', { type: 'text' }], env, noopCtx)

		expect(result).toBe('kv-value')
		expect(calls).toEqual([['some-key', { type: 'text' }]])
	})

	test('do.get returns DOStub reference', async () => {
		const stub = { fetch: () => new Response('ok') }
		const idObj = { __id: 'abc' }
		const doNs = {
			idFromName: () => idObj,
			idFromString: () => idObj,
			newUniqueId: () => idObj,
			get: () => stub
		}
		const env = { MY_DO: doNs } as unknown as GatewayEnv

		const serializedId = { __type: 'DOId', hex: 'abc' }
		const result = await executeRpcMethod('MY_DO.do.get', [serializedId], env, noopCtx)

		expect(result).toEqual({ __type: 'DOStub', binding: 'MY_DO', id: serializedId })
	})

	test('queue.send dispatches to Queue.send', async () => {
		const sent: unknown[] = []
		const queue = {
			send: (msg: unknown) => { sent.push(msg) },
			sendBatch: () => { }
		}
		const env = { MY_Q: queue } as unknown as GatewayEnv
		await executeRpcMethod('MY_Q.queue.send', [{ hello: 'world' }], env, noopCtx)
		expect(sent).toEqual([{ hello: 'world' }])
	})

	test('ai.run dispatches to AI.run', async () => {
		const ai = { run: (m: string, i: unknown) => ({ model: m, inputs: i }) }
		const env = { AI: ai } as unknown as GatewayEnv
		const result = await executeRpcMethod('AI.ai.run', ['@cf/x', { prompt: 'hi' }], env, noopCtx)
		expect(result).toEqual({ model: '@cf/x', inputs: { prompt: 'hi' } })
	})

	test('ai.run throws when binding lacks run()', async () => {
		const env = { AI: {} } as unknown as GatewayEnv
		await expect(
			executeRpcMethod('AI.ai.run', ['@cf/x', {}], env, noopCtx)
		).rejects.toThrow(/does not support run/)
	})
})

describe('executeRpcMethod — B3-final: bare verbs and legacy sub-prefixes throw', () => {
	const env = {
		K: {
			get: () => 'v',
			put: () => { },
			list: () => { },
			delete: () => { },
			getWithMetadata: () => { }
		},
		D: {
			idFromName: () => ({ __id: 'a' }),
			idFromString: () => ({ __id: 'a' }),
			newUniqueId: () => ({ __id: 'a' }),
			get: () => ({ fetch: () => new Response('ok') })
		},
		DB: {
			prepare: () => ({ first: () => ({ id: 1 }), bind: () => ({}) }),
			exec: () => { },
			batch: () => { },
			dump: () => { }
		},
		X: { foo: () => { } }
	} as unknown as GatewayEnv

	test('bare verb on KV-shaped binding throws (no fallback translation)', async () => {
		await expect(
			executeRpcMethod('K.get', ['k1'], env, noopCtx)
		).rejects.toThrow(/Unsupported bridge operation 'get'/)
	})

	test('bare verb on DO-shaped binding throws', async () => {
		const serializedId = { __type: 'DOId', hex: 'abc' }
		await expect(
			executeRpcMethod('D.get', [serializedId], env, noopCtx)
		).rejects.toThrow(/Unsupported bridge operation 'get'/)
	})

	test('bare verb on unknown binding kind throws', async () => {
		await expect(
			executeRpcMethod('X.get', ['k'], env, noopCtx)
		).rejects.toThrow(/Unsupported bridge operation 'get'/)
	})

	test('legacy stmt.first prefix throws (use d1.stmt.first)', async () => {
		await expect(
			executeRpcMethod('DB.stmt.first', ['SELECT 1'], env, noopCtx)
		).rejects.toThrow(/Unsupported bridge operation 'stmt\.first'/)
	})

	test('legacy stub.fetch prefix throws (use do.fetch)', async () => {
		await expect(
			executeRpcMethod('D.stub.fetch', [], env, noopCtx)
		).rejects.toThrow(/Unsupported bridge operation 'stub\.fetch'/)
	})
})

