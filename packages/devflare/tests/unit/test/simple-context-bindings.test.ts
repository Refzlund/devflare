import { afterEach, describe, expect, mock, test } from 'bun:test'
import { buildRemoteAndStaticBindings } from '../../../src/test/simple-context-bindings'
import { createMockVersionMetadata } from '../../../src/test/utilities'

const originalRemoteMode = process.env.DEVFLARE_REMOTE
const originalApiToken = process.env.CLOUDFLARE_API_TOKEN
const originalFetch = globalThis.fetch

afterEach(() => {
	if (originalRemoteMode === undefined) {
		delete process.env.DEVFLARE_REMOTE
	} else {
		process.env.DEVFLARE_REMOTE = originalRemoteMode
	}

	if (originalApiToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalApiToken
	}

	globalThis.fetch = originalFetch
})

describe('buildRemoteAndStaticBindings', () => {
	test('adds deterministic Version Metadata bindings for createTestContext', () => {
		const bindings = buildRemoteAndStaticBindings({
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				versionMetadata: {
					binding: 'CF_VERSION_METADATA'
				}
			}
		})

		expect(bindings.CF_VERSION_METADATA).toEqual(createMockVersionMetadata())
	})

	test('adds remote Vectorize bindings only when Devflare remote mode is active', () => {
		const config = {
			name: 'my-worker',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				vectorize: {
					DOCUMENTS: {
						indexName: 'documents-index',
						remote: true
					}
				}
			}
		}

		expect(buildRemoteAndStaticBindings(config).DOCUMENTS).toBeUndefined()

		process.env.DEVFLARE_REMOTE = '1'
		const bindings = buildRemoteAndStaticBindings(config)

		expect(bindings.DOCUMENTS).toBeDefined()
		expect(typeof (bindings.DOCUMENTS as VectorizeIndex).query).toBe('function')
	})

	test('adds remote AI bindings only when Devflare remote mode is active', () => {
		const config = {
			name: 'my-worker',
			accountId: 'account-123',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				ai: {
					binding: 'AI',
					remote: true,
					staging: true
				}
			}
		}

		expect(buildRemoteAndStaticBindings(config).AI).toBeUndefined()

		process.env.DEVFLARE_REMOTE = '1'
		const bindings = buildRemoteAndStaticBindings(config)

		expect(bindings.AI).toBeDefined()
		expect(typeof (bindings.AI as Ai).run).toBe('function')
	})

	test('remote AI bindings expose AI Gateway methods in remote mode', async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = []
		process.env.DEVFLARE_REMOTE = '1'
		process.env.CLOUDFLARE_API_TOKEN = 'token-123'
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			requests.push({ url, init })

			if (url.endsWith('/logs/log-1') && init?.method === 'GET') {
				return Response.json({
					success: true,
					result: {
						id: 'log-1',
						provider: 'workers-ai',
						model: '@cf/test',
						path: '/v1/account-123/my-gateway/workers-ai',
						duration: 12,
						status_code: 200,
						success: true,
						cached: false,
						request_size: 10,
						request_head_complete: true,
						response_size: 20,
						response_head_complete: true,
						created_at: '2026-04-26T00:00:00.000Z'
					}
				})
			}

			if (url.endsWith('/logs/log-1') && init?.method === 'PATCH') {
				return Response.json({ success: true, result: null })
			}

			return new Response('gateway response')
		}) as unknown as typeof fetch

		const bindings = buildRemoteAndStaticBindings({
			name: 'my-worker',
			accountId: 'account-123',
			compatibilityDate: '2026-04-26',
			compatibilityFlags: [],
			bindings: {
				ai: {
					binding: 'AI',
					remote: true
				}
			}
		})

		const ai = bindings.AI as Ai
		const gateway = ai.gateway('my-gateway') as unknown as AiGateway

		expect(typeof gateway.patchLog).toBe('function')
		expect(typeof gateway.getLog).toBe('function')
		expect(typeof gateway.getUrl).toBe('function')
		expect(typeof gateway.run).toBe('function')
		expect(await gateway.getUrl()).toBe('https://gateway.ai.cloudflare.com/v1/account-123/my-gateway/')
		expect(await gateway.getUrl('workers-ai')).toBe('https://gateway.ai.cloudflare.com/v1/account-123/my-gateway/workers-ai')

		const response = await gateway.run({
			provider: 'workers-ai',
			endpoint: '@cf/test',
			headers: {},
			query: { prompt: 'hi' }
		})
		await gateway.patchLog('log-1', { feedback: 1 })
		const log = await gateway.getLog('log-1')

		expect(await response.text()).toBe('gateway response')
		expect(log.id).toBe('log-1')
		expect(requests.map((request) => [request.url, request.init?.method])).toEqual([
			['https://gateway.ai.cloudflare.com/v1/account-123/my-gateway/', 'POST'],
			['https://api.cloudflare.com/client/v4/accounts/account-123/ai-gateway/gateways/my-gateway/logs/log-1', 'PATCH'],
			['https://api.cloudflare.com/client/v4/accounts/account-123/ai-gateway/gateways/my-gateway/logs/log-1', 'GET']
		])
	})
})
