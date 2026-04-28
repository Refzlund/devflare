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
