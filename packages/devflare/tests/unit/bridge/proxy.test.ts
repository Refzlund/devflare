import { describe, expect, test } from 'bun:test'
import { createEnvProxy } from '../../../src/bridge/proxy'

function textResponsePayload(text: string, init: ResponseInit = {}) {
	return {
		status: init.status ?? 200,
		statusText: init.statusText ?? '',
		headers: Object.entries(init.headers ?? {}),
		body: {
			type: 'bytes',
			data: btoa(text)
		}
	}
}

describe('createEnvProxy service bindings', () => {
	test('routes service fetch through the namespaced bridge operation', async () => {
		const calls: Array<{ method: string; params: unknown[] }> = []
		const client = {
			async call(method: string, params: unknown[]) {
				calls.push({ method, params })
				return textResponsePayload('service-ok', {
					status: 201,
					headers: { 'x-service': 'ok' }
				})
			}
		}

		const env = createEnvProxy({
			client: client as never,
			hints: { API: 'service' }
		})

		const response = await (env.API as Fetcher).fetch(
			new Request('https://api.local/auth/magic-link/request', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'creator@example.com' })
			})
		)

		expect(response.status).toBe(201)
		expect(response.headers.get('x-service')).toBe('ok')
		expect(await response.text()).toBe('service-ok')
		expect(calls[0]?.method).toBe('API.service.fetch')
		expect((calls[0]?.params[0] as { method?: string }).method).toBe('POST')
	})
})

describe('createEnvProxy strict unknown bindings', () => {
	test('returns undefined for unknown platform env names instead of generic bridge proxies', () => {
		const client = {
			async call() {
				throw new Error('unexpected bridge call')
			}
		}

		const env = createEnvProxy({
			client: client as never,
			hints: { API: 'service' },
			strict: true
		} as never)

		expect(env.MISSING_VALUE).toBeUndefined()
		expect(String(env.MISSING_VALUE)).toBe('undefined')
		expect('MISSING_VALUE' in env).toBe(false)
	})
})

describe('createEnvProxy DO jurisdiction (B2)', () => {
	test('threads jurisdiction(j) through do.idFromName and do.fetch', async () => {
		const calls: Array<{ method: string; params: unknown[] }> = []
		const client = {
			async call(method: string, params: unknown[]) {
				calls.push({ method, params })
				if (method.endsWith('.do.idFromName')) {
					return { __type: 'DOId', hex: 'deadbeef' }
				}
				if (method.endsWith('.do.fetch')) {
					return textResponsePayload('do-ok')
				}
				throw new Error('unexpected method ' + method)
			}
		}

		const env = createEnvProxy({
			client: client as never,
			hints: { MY_DO: 'do' }
		})

		const ns = env.MY_DO as DurableObjectNamespace
		const stub = ns.jurisdiction('eu').get(ns.jurisdiction('eu').idFromName('room-1'))
		const res = await stub.fetch(new Request('https://do.local/'))
		expect(await res.text()).toBe('do-ok')

		const idCall = calls.find((c) => c.method === 'MY_DO.do.idFromName')
		expect(idCall).toBeTruthy()
		expect(idCall?.params).toEqual(['room-1', 'eu'])
	})

	test('omits jurisdiction (undefined trailing arg) when not scoped', async () => {
		const calls: Array<{ method: string; params: unknown[] }> = []
		const client = {
			async call(method: string, params: unknown[]) {
				calls.push({ method, params })
				if (method.endsWith('.do.idFromName')) return { __type: 'DOId', hex: 'cafef00d' }
				if (method.endsWith('.do.fetch')) return textResponsePayload('ok')
				throw new Error('unexpected method ' + method)
			}
		}
		const env = createEnvProxy({ client: client as never, hints: { MY_DO: 'do' } })
		const ns = env.MY_DO as DurableObjectNamespace
		const stub = ns.get(ns.idFromName('plain'))
		await stub.fetch(new Request('https://do.local/'))
		const idCall = calls.find((c) => c.method === 'MY_DO.do.idFromName')
		expect(idCall?.params).toEqual(['plain', undefined])
	})
})

describe('createDOStubProxy.connect startTls (B5)', () => {
	test('startTls throws the documented unsupported error', async () => {
		const wsHandlers: { message?: (d: unknown) => void; close?: () => void } = {}
		const client = {
			async call() {
				return { __type: 'DOId', hex: 'abc123' }
			},
			async openDoWebSocket() {
				return {
					wid: 1,
					send: () => {},
					close: () => {},
					onMessage: (h: (d: unknown) => void) => {
						wsHandlers.message = h
					},
					onClose: (h: () => void) => {
						wsHandlers.close = h
					}
				}
			}
		}
		const env = createEnvProxy({ client: client as never, hints: { MY_DO: 'do' } })
		const ns = env.MY_DO as DurableObjectNamespace & { getByName(n: string): DurableObjectStub }
		const stub = ns.getByName('socket')
		const socket = await stub.connect('ws://do/chat')
		expect(() => socket.startTls()).toThrow(
			/not supported on a Durable Object WebSocket connection/
		)
	})
})
