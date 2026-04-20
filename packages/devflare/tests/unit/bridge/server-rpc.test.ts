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

describe('executeRpcMethod — get dispatch', () => {
	test('dispatches to KVNamespace.get when binding is KV-shaped', async () => {
		const calls: unknown[][] = []
		const kv = {
			get: (...args: unknown[]) => {
				calls.push(args)
				return 'kv-value'
			},
			put: () => { },
			list: () => { },
			delete: () => { }
		}
		const env = { MY_KV: kv } as unknown as GatewayEnv

		const result = await executeRpcMethod('MY_KV.get', ['some-key', { type: 'text' }], env, noopCtx)

		expect(result).toBe('kv-value')
		expect(calls).toEqual([['some-key', { type: 'text' }]])
	})

	test('returns DOStub reference when binding is DurableObjectNamespace-shaped', async () => {
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
		const result = await executeRpcMethod('MY_DO.get', [serializedId], env, noopCtx)

		expect(result).toEqual({ __type: 'DOStub', binding: 'MY_DO', id: serializedId })
	})
})

describe('executeRpcMethod — run dispatch', () => {
	test('throws when binding lacks a run() method', async () => {
		const env = { AI: {} } as unknown as GatewayEnv

		await expect(
			executeRpcMethod('AI.run', ['@cf/meta/llama', { prompt: 'hi' }], env, noopCtx)
		).rejects.toThrow(/does not support run/)
	})

	test('forwards to binding.run(params[0], params[1]) when available', async () => {
		const received: unknown[] = []
		const ai = {
			run: (model: string, opts: unknown) => {
				received.push(model, opts)
				return { response: 'hello' }
			}
		}
		const env = { AI: ai } as unknown as GatewayEnv

		const result = await executeRpcMethod(
			'AI.run',
			['@cf/meta/llama', { prompt: 'hi' }],
			env,
			noopCtx
		)

		expect(result).toEqual({ response: 'hello' })
		expect(received).toEqual(['@cf/meta/llama', { prompt: 'hi' }])
	})
})
