// =============================================================================
// Bridge Gateway — executeRpcMethod dispatch tests
// =============================================================================

import { describe, test, expect, beforeEach, spyOn } from 'bun:test'
import { executeRpcMethod, __resetLegacyOpWarnings } from '../../../src/bridge/server'
import type { GatewayEnv } from '../../../src/bridge/server'

const noopCtx = {
	waitUntil: () => { },
	passThroughOnException: () => { }
} as unknown as ExecutionContext

beforeEach(() => {
	__resetLegacyOpWarnings()
})

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

describe('executeRpcMethod — legacy bare-verb fallback', () => {
	test('bare get on KV-shaped binding routes to kv.get and warns once', async () => {
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => { })
		try {
			const calls: unknown[][] = []
			const kv = {
				get: (...args: unknown[]) => { calls.push(args); return 'v' },
				put: () => { },
				list: () => { },
				delete: () => { },
				getWithMetadata: () => { }
			}
			const env = { K: kv } as unknown as GatewayEnv

			const a = await executeRpcMethod('K.get', ['k1'], env, noopCtx)
			const b = await executeRpcMethod('K.get', ['k2'], env, noopCtx)
			expect(a).toBe('v')
			expect(b).toBe('v')
			expect(calls).toEqual([['k1', undefined], ['k2', undefined]])
			// Warned at least once for "get"
			const warns = warnSpy.mock.calls.filter((c) => String(c[0]).includes('Deprecated bridge op "get"'))
			expect(warns.length).toBeGreaterThanOrEqual(1)
			// Only once for the same verb
			expect(warns.length).toBe(1)
		} finally {
			warnSpy.mockRestore()
		}
	})

	test('bare get on DO-shaped binding routes to do.get', async () => {
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => { })
		try {
			const idObj = { __id: 'abc' }
			const doNs = {
				idFromName: () => idObj,
				idFromString: () => idObj,
				newUniqueId: () => idObj,
				get: () => ({ fetch: () => new Response('ok') })
			}
			const env = { D: doNs } as unknown as GatewayEnv
			const serializedId = { __type: 'DOId', hex: 'abc' }
			const result = await executeRpcMethod('D.get', [serializedId], env, noopCtx)
			expect(result).toEqual({ __type: 'DOStub', binding: 'D', id: serializedId })
		} finally {
			warnSpy.mockRestore()
		}
	})

	test('bare get on unknown binding kind throws a typed error', async () => {
		const env = { X: { foo: () => { } } } as unknown as GatewayEnv
		await expect(
			executeRpcMethod('X.get', ['k'], env, noopCtx)
		).rejects.toThrow(/Cannot resolve legacy bridge operation 'get'/)
	})

	test('legacy stmt.first translates to d1.stmt.first', async () => {
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => { })
		try {
			const seen: unknown[] = []
			const stmt = {
				bind: (...b: unknown[]) => ({ ...stmt, _b: b }),
				first: (col?: string) => { seen.push(['first', col]); return { id: 1 } }
			}
			const d1 = {
				prepare: (sql: string) => { seen.push(['prepare', sql]); return stmt },
				exec: () => { },
				batch: () => { },
				dump: () => { }
			}
			const env = { DB: d1 } as unknown as GatewayEnv
			const result = await executeRpcMethod('DB.stmt.first', ['SELECT 1'], env, noopCtx)
			expect(result).toEqual({ id: 1 })
		} finally {
			warnSpy.mockRestore()
		}
	})

	test('legacy stub.fetch translates to do.fetch', async () => {
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => { })
		try {
			const idObj = { toString: () => 'deadbeef' }
			const stub = {
				fetch: async () => new Response('ok', { status: 200 })
			}
			const doNs = {
				idFromName: () => idObj,
				idFromString: () => idObj,
				newUniqueId: () => idObj,
				get: () => stub
			}
			const env = { D: doNs } as unknown as GatewayEnv
			const serializedId = { __type: 'DOId', hex: 'deadbeef' }
			const serializedReq = {
				url: 'http://do/x',
				method: 'GET',
				headers: [],
				body: null
			}
			const result = await executeRpcMethod('D.stub.fetch', ['D', serializedId, serializedReq], env, noopCtx)
			expect(result).toBeInstanceOf(Response)
		} finally {
			warnSpy.mockRestore()
		}
	})
})
