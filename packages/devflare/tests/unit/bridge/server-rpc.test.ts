// =============================================================================
// Bridge Gateway — executeRpcMethod dispatch tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { executeRpcMethod } from '../../../src/bridge/server'
import type { GatewayEnv } from '../../../src/bridge/server'
import { serializeRequest } from '../../../src/bridge/v2/value-serialization'

const noopCtx = {
	waitUntil: () => {},
	passThroughOnException: () => {}
} as unknown as ExecutionContext

describe('executeRpcMethod — namespaced dispatch', () => {
	test('kv.get dispatches to KVNamespace.get', async () => {
		const calls: unknown[][] = []
		const kv = {
			get: (...args: unknown[]) => {
				calls.push(args)
				return 'kv-value'
			},
			put: () => {},
			list: () => {},
			delete: () => {},
			getWithMetadata: () => {}
		}
		const env = { MY_KV: kv } as unknown as GatewayEnv

		const result = await executeRpcMethod(
			'MY_KV.kv.get',
			['some-key', { type: 'text' }],
			env,
			noopCtx
		)

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
			send: (msg: unknown) => {
				sent.push(msg)
			},
			sendBatch: () => {}
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
		await expect(executeRpcMethod('AI.ai.run', ['@cf/x', {}], env, noopCtx)).rejects.toThrow(
			/does not support run/
		)
	})

	test('service.fetch dispatches to Cloudflare service binding fetch', async () => {
		const service = {
			async fetch(request: Request) {
				return new Response(`service:${request.method}:${await request.text()}`, {
					status: 202,
					headers: { 'x-service': 'ok' }
				})
			}
		}
		const env = { API: service } as unknown as GatewayEnv
		const { serialized } = await serializeRequest(
			new Request('https://api.local/action', {
				method: 'POST',
				body: 'payload'
			})
		)

		const result = (await executeRpcMethod(
			'API.service.fetch',
			[serialized],
			env,
			noopCtx
		)) as Response

		expect(result.status).toBe(202)
		expect(result.headers.get('x-service')).toBe('ok')
		expect(await result.text()).toBe('service:POST:payload')
	})
})

describe('executeRpcMethod — B3-final: bare verbs and legacy sub-prefixes throw', () => {
	const env = {
		K: {
			get: () => 'v',
			put: () => {},
			list: () => {},
			delete: () => {},
			getWithMetadata: () => {}
		},
		D: {
			idFromName: () => ({ __id: 'a' }),
			idFromString: () => ({ __id: 'a' }),
			newUniqueId: () => ({ __id: 'a' }),
			get: () => ({ fetch: () => new Response('ok') })
		},
		DB: {
			prepare: () => ({ first: () => ({ id: 1 }), bind: () => ({}) }),
			exec: () => {},
			batch: () => {},
			dump: () => {}
		},
		X: { foo: () => {} }
	} as unknown as GatewayEnv

	test('bare verb on KV-shaped binding throws (no fallback translation)', async () => {
		await expect(executeRpcMethod('K.get', ['k1'], env, noopCtx)).rejects.toThrow(
			/Unsupported bridge operation 'get'/
		)
	})

	test('bare verb on DO-shaped binding throws', async () => {
		const serializedId = { __type: 'DOId', hex: 'abc' }
		await expect(executeRpcMethod('D.get', [serializedId], env, noopCtx)).rejects.toThrow(
			/Unsupported bridge operation 'get'/
		)
	})

	test('bare verb on unknown binding kind throws', async () => {
		await expect(executeRpcMethod('X.get', ['k'], env, noopCtx)).rejects.toThrow(
			/Unsupported bridge operation 'get'/
		)
	})

	test('bare fetch on a service-shaped binding explains the SvelteKit service-binding path', async () => {
		await expect(
			executeRpcMethod('X.fetch', [new Request('https://api.local/')], env, noopCtx)
		).rejects.toThrow(/Expected Cloudflare API: env\.X\.fetch\(request\)/)
	})

	test('legacy stmt.first prefix throws (use d1.stmt.first)', async () => {
		await expect(executeRpcMethod('DB.stmt.first', ['SELECT 1'], env, noopCtx)).rejects.toThrow(
			/Unsupported bridge operation 'stmt\.first'/
		)
	})

	test('legacy stub.fetch prefix throws (use do.fetch)', async () => {
		await expect(executeRpcMethod('D.stub.fetch', [], env, noopCtx)).rejects.toThrow(
			/Unsupported bridge operation 'stub\.fetch'/
		)
	})
})

describe('executeRpcMethod — B5-frame: binding errors round-trip with typed cause', () => {
	test('KV.get throw surfaces back through executeRpcMethod', async () => {
		const kv = {
			get: () => {
				throw new Error('kv blew up')
			},
			put: () => {},
			list: () => {},
			delete: () => {},
			getWithMetadata: () => {}
		}
		const env = { K: kv } as unknown as GatewayEnv
		await expect(executeRpcMethod('K.kv.get', ['k1'], env, noopCtx)).rejects.toThrow(/kv blew up/)
	})

	test('R2.get throw surfaces back through executeRpcMethod', async () => {
		const r2 = {
			head: () => null,
			get: () => {
				throw new Error('r2 blew up')
			},
			put: () => {},
			delete: () => {},
			list: () => {},
			createMultipartUpload: () => {}
		}
		const env = { B: r2 } as unknown as GatewayEnv
		await expect(executeRpcMethod('B.r2.get', ['some/key'], env, noopCtx)).rejects.toThrow(
			/r2 blew up/
		)
	})

	test('D1 prepare-then-first throw surfaces back through executeRpcMethod', async () => {
		const stmt = {
			bind: () => stmt,
			first: () => {
				throw new Error('d1 blew up')
			}
		}
		const d1 = {
			prepare: () => stmt,
			exec: () => {},
			batch: () => {},
			dump: () => {}
		}
		const env = { DB: d1 } as unknown as GatewayEnv
		await expect(executeRpcMethod('DB.d1.stmt.first', ['SELECT 1'], env, noopCtx)).rejects.toThrow(
			/d1 blew up/
		)
	})
})

describe('executeRpcMethod — do.rpc dispatches native Durable Object RPC', () => {
	// Mirrors the reported bug: a DO that `extends DurableObject` exposes RPC
	// methods natively AND defines its own fetch() that only accepts websocket
	// upgrades (426 for anything else). The bridge must invoke the method
	// DIRECTLY on the stub; routing it through fetch() hands the internal `_rpc`
	// probe to the user handler, whose 426 text body then fails `response.json()`
	// with "Unexpected token 'e', \"expected a\"... is not valid JSON".
	function makeNativeRpcDoEnv(): GatewayEnv {
		const stub = {
			fetch(request: Request): Response {
				if (request.headers.get('Upgrade') !== 'websocket') {
					return new Response('expected a websocket upgrade', { status: 426 })
				}
				return new Response(null, { status: 101 })
			},
			async push(value: string): Promise<{ seq: number; echo: string }> {
				return { seq: 1, echo: value }
			},
			async pull(since: number): Promise<{ seq: number; framesB64: string[]; since: number }> {
				return { seq: 2, framesB64: ['AAAA'], since }
			}
		}
		const doNs = {
			idFromName: () => ({ toString: () => 'hex-id' }),
			idFromString: () => ({ __id: 'hex-id' }),
			newUniqueId: () => ({ __id: 'hex-id' }),
			get: () => stub
		}
		return { MY_DO: doNs } as unknown as GatewayEnv
	}

	const serializedId = { __type: 'DOId', hex: 'hex-id' }

	test('push() returns the structured value (not the fetch 426 / JSON-parse error)', async () => {
		const env = makeNativeRpcDoEnv()
		const result = await executeRpcMethod(
			'MY_DO.do.rpc',
			['MY_DO', serializedId, 'push', ['AAAA']],
			env,
			noopCtx
		)
		expect(result).toEqual({ seq: 1, echo: 'AAAA' })
	})

	test('pull(since) returns its structured value', async () => {
		const env = makeNativeRpcDoEnv()
		const result = await executeRpcMethod(
			'MY_DO.do.rpc',
			['MY_DO', serializedId, 'pull', [5]],
			env,
			noopCtx
		)
		expect(result).toEqual({ seq: 2, framesB64: ['AAAA'], since: 5 })
	})

	test('a genuine error thrown by the RPC method propagates (not swallowed as a fallback)', async () => {
		const stub = {
			fetch: () => new Response('should not be reached', { status: 500 }),
			async push(): Promise<never> {
				throw new Error('boom from method')
			}
		}
		const doNs = {
			idFromName: () => ({ toString: () => 'hex' }),
			idFromString: () => ({ __id: 'hex' }),
			newUniqueId: () => ({ __id: 'hex' }),
			get: () => stub
		}
		const env = { MY_DO: doNs } as unknown as GatewayEnv
		await expect(
			executeRpcMethod('MY_DO.do.rpc', ['MY_DO', serializedId, 'push', []], env, noopCtx)
		).rejects.toThrow(/boom from method/)
	})

	test('falls back to the fetch /_rpc convention for a DO with no native method', async () => {
		// A stub whose only surface is fetch() dispatching POST /_rpc — the legacy
		// non-RPC DO shape. The gateway must keep serving it.
		const stub = {
			async fetch(request: Request): Promise<Response> {
				const { method, params } = (await request.json()) as {
					method: string
					params: unknown[]
				}
				if (method === 'ping') {
					return Response.json({ ok: true, result: { pong: params[0] } })
				}
				return Response.json({ ok: false, error: { message: `no method ${method}` } })
			}
		}
		const doNs = {
			idFromName: () => ({ toString: () => 'hex' }),
			idFromString: () => ({ __id: 'hex' }),
			newUniqueId: () => ({ __id: 'hex' }),
			get: () => stub
		}
		const env = { LEGACY_DO: doNs } as unknown as GatewayEnv
		const result = await executeRpcMethod(
			'LEGACY_DO.do.rpc',
			['LEGACY_DO', serializedId, 'ping', ['hi']],
			env,
			noopCtx
		)
		expect(result).toEqual({ pong: 'hi' })
	})

	test('falls back to /_rpc when native dispatch reports the DO is not RPC-enabled', async () => {
		// workerd exposes stub[method] as callable even for non-RPC DOs, but
		// invoking it throws "does not support RPC". The gateway must catch that
		// specific signal and retry through the fetch /_rpc convention.
		const stub = {
			async fetch(request: Request): Promise<Response> {
				const { method, params } = (await request.json()) as {
					method: string
					params: unknown[]
				}
				return Response.json({ ok: true, result: { via: 'fetch', method, params } })
			},
			ping(): never {
				throw new Error(
					'The receiving Durable Object does not support RPC, because its class was not declared with `extends DurableObject`.'
				)
			}
		}
		const doNs = {
			idFromName: () => ({ toString: () => 'hex' }),
			idFromString: () => ({ __id: 'hex' }),
			newUniqueId: () => ({ __id: 'hex' }),
			get: () => stub
		}
		const env = { PROXY_DO: doNs } as unknown as GatewayEnv
		const result = await executeRpcMethod(
			'PROXY_DO.do.rpc',
			['PROXY_DO', serializedId, 'ping', ['x']],
			env,
			noopCtx
		)
		expect(result).toEqual({ via: 'fetch', method: 'ping', params: ['x'] })
	})
})

describe('executeRpcMethod — DO jurisdiction (B2)', () => {
	test('forwards jurisdiction to binding.jurisdiction(j) when supported', async () => {
		const seen: string[] = []
		const scopedId = { toString: () => 'eu-id' }
		const scopedNs = {
			idFromName: (name: string) => {
				seen.push(`name:${name}`)
				return scopedId
			},
			newUniqueId: () => scopedId
		}
		const binding = {
			idFromName: () => {
				throw new Error('unscoped idFromName should not be called')
			},
			idFromString: () => scopedId,
			newUniqueId: () => {
				throw new Error('unscoped newUniqueId should not be called')
			},
			get: () => ({ fetch: () => new Response('ok') }),
			jurisdiction: (j: string) => {
				seen.push(`j:${j}`)
				return scopedNs
			}
		}
		const env = { MY_DO: binding } as unknown as GatewayEnv

		const result = await executeRpcMethod('MY_DO.do.idFromName', ['room', 'eu'], env, noopCtx)
		expect(result).toEqual({ __type: 'DOId', hex: 'eu-id' })
		expect(seen).toEqual(['j:eu', 'name:room'])
	})

	test('degrades to the plain binding when jurisdiction() is absent', async () => {
		const seen: string[] = []
		const plainId = { toString: () => 'plain-id' }
		const binding = {
			idFromName: (name: string) => {
				seen.push(`name:${name}`)
				return plainId
			},
			idFromString: () => plainId,
			newUniqueId: () => plainId,
			get: () => ({ fetch: () => new Response('ok') })
			// no jurisdiction() method
		}
		const env = { MY_DO: binding } as unknown as GatewayEnv

		const result = await executeRpcMethod('MY_DO.do.idFromName', ['room', 'eu'], env, noopCtx)
		expect(result).toEqual({ __type: 'DOId', hex: 'plain-id' })
		expect(seen).toEqual(['name:room'])
	})

	test('no jurisdiction arg → plain binding even when jurisdiction() exists', async () => {
		const seen: string[] = []
		const plainId = { toString: () => 'plain-id' }
		const binding = {
			idFromName: () => {
				throw new Error('idFromName(unscoped) should not run for newUniqueId test')
			},
			idFromString: () => plainId,
			newUniqueId: () => {
				seen.push('newUniqueId')
				return plainId
			},
			get: () => ({ fetch: () => new Response('ok') }),
			jurisdiction: () => {
				throw new Error('jurisdiction() should not be called without an arg')
			}
		}
		const env = { MY_DO: binding } as unknown as GatewayEnv

		const result = await executeRpcMethod(
			'MY_DO.do.newUniqueId',
			[undefined, undefined],
			env,
			noopCtx
		)
		expect(result).toEqual({ __type: 'DOId', hex: 'plain-id' })
		expect(seen).toEqual(['newUniqueId'])
	})
})
