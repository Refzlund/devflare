import { afterEach, describe, expect, mock, test } from 'bun:test'
import { CloudflareAPIError, apiGet, apiGetAll, kvDelete } from '../../../src/cloudflare/api'
import { jsonResponse } from '../../helpers/cloudflare-api'
import { installTrackedTimeouts } from '../../helpers/tracked-timeouts'

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
const originalCloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN

afterEach(() => {
	globalThis.fetch = originalFetch
	globalThis.setTimeout = originalSetTimeout
	globalThis.clearTimeout = originalClearTimeout

	if (originalCloudflareApiToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalCloudflareApiToken
	}
})

describe('apiGetAll', () => {
	test('collects paginated array results', async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.endsWith('/items?page=1&per_page=50')) {
				return jsonResponse([{ id: 'one' }, { id: 'two' }], {
					page: 1,
					per_page: 50,
					total_pages: 2,
					count: 2,
					total_count: 3
				})
			}

			if (url.endsWith('/items?page=2&per_page=50')) {
				return jsonResponse([{ id: 'three' }], {
					page: 2,
					per_page: 50,
					total_pages: 2,
					count: 1,
					total_count: 3
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const result = await apiGetAll<{ id: string }>('/items', { token: 'cf_test_token' })

		expect(result).toEqual([{ id: 'one' }, { id: 'two' }, { id: 'three' }])
	})

	test('accepts object-wrapped array results like the R2 bucket list API', async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (!url.endsWith('/accounts/test-account/r2/buckets?page=1&per_page=50')) {
				throw new Error(`Unexpected fetch URL: ${url}`)
			}

			return jsonResponse({
				buckets: [
					{ name: 'preview-assets', creation_date: '2026-04-11T00:00:00.000Z' },
					{ name: 'preview-archive', creation_date: '2026-04-11T00:00:00.000Z' }
				]
			})
		}) as unknown as typeof fetch

		const result = await apiGetAll<{ name: string; creation_date: string }>(
			'/accounts/test-account/r2/buckets',
			{
				token: 'cf_test_token'
			}
		)

		expect(result.map((bucket) => bucket.name)).toEqual(['preview-assets', 'preview-archive'])
	})

	test('follows cursor pagination when Cloudflare returns a next cursor', async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.endsWith('/accounts/test-account/r2/buckets?page=1&per_page=50')) {
				return jsonResponse(
					{
						buckets: [{ name: 'preview-assets', creation_date: '2026-04-11T00:00:00.000Z' }]
					},
					{
						cursor: 'next-page',
						per_page: 50
					}
				)
			}

			if (url.endsWith('/accounts/test-account/r2/buckets?cursor=next-page&per_page=50')) {
				return jsonResponse(
					{
						buckets: [{ name: 'preview-archive', creation_date: '2026-04-11T00:00:00.000Z' }]
					},
					{
						per_page: 50
					}
				)
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const result = await apiGetAll<{ name: string; creation_date: string }>(
			'/accounts/test-account/r2/buckets',
			{
				token: 'cf_test_token'
			}
		)

		expect(result.map((bucket) => bucket.name)).toEqual(['preview-assets', 'preview-archive'])
	})

	test('clears timeout guards after a successful request', async () => {
		const { scheduledTimeoutIds, clearedTimeoutIds } = installTrackedTimeouts()

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (!url.endsWith('/items?page=1&per_page=50')) {
				throw new Error(`Unexpected fetch URL: ${url}`)
			}

			return jsonResponse([{ id: 'one' }], {
				page: 1,
				per_page: 50,
				total_pages: 1,
				count: 1,
				total_count: 1
			})
		}) as unknown as typeof fetch

		const result = await apiGetAll<{ id: string }>('/items', { token: 'cf_test_token' })

		expect(result).toEqual([{ id: 'one' }])
		expect(clearedTimeoutIds).toEqual(scheduledTimeoutIds)
	})

	test('retries authentication failures independently per in-flight request', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const firstAttemptResolvers: Array<() => void> = []
		let fetchCalls = 0

		globalThis.fetch = mock(async () => {
			fetchCalls += 1

			if (fetchCalls <= 2) {
				await new Promise<void>((resolve) => {
					firstAttemptResolvers.push(resolve)

					if (firstAttemptResolvers.length === 2) {
						for (const release of firstAttemptResolvers.splice(0)) {
							release()
						}
					}
				})
			}

			return new Response(
				JSON.stringify({
					success: false,
					errors: [{ code: 10000, message: 'authentication error' }],
					messages: [],
					result: null
				}),
				{
					status: 401,
					headers: {
						'Content-Type': 'application/json'
					}
				}
			)
		}) as unknown as typeof fetch

		const results = await Promise.allSettled([apiGet<null>('/items'), apiGet<null>('/items')])

		expect(fetchCalls).toBe(4)
		for (const result of results) {
			expect(result.status).toBe('rejected')
			if (result.status === 'rejected') {
				expect(result.reason).toBeInstanceOf(CloudflareAPIError)
				expect(result.reason.code).toBe(401)
			}
		}
	})

	test('throws a typed CloudflareAPIError when the API returns invalid JSON', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'

		globalThis.fetch = mock(
			async () =>
				new Response('<html>bad gateway</html>', {
					status: 502,
					headers: {
						'Content-Type': 'text/html'
					}
				})
		) as unknown as typeof fetch

		await expect(apiGet('/items')).rejects.toMatchObject({
			name: 'CloudflareAPIError',
			message: expect.stringContaining('Cloudflare API returned an invalid JSON response.'),
			code: 502
		})
	})

	test('throws a clear error when a JSON response is not the v4 envelope shape', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'

		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ data: [1, 2, 3] }), {
					status: 200,
					headers: {
						'Content-Type': 'application/json'
					}
				})
		) as unknown as typeof fetch

		await expect(apiGet('/items')).rejects.toMatchObject({
			name: 'CloudflareAPIError',
			message: expect.stringContaining(
				'Cloudflare GET /items returned a non-envelope JSON response.'
			),
			code: 200
		})
	})

	test('surfaces the first envelope error code and message when success is false', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'

		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						success: false,
						errors: [
							{ code: 7003, message: 'Could not route to the requested resource' },
							{ code: 7000, message: 'ignored secondary error' }
						],
						messages: [],
						result: null
					}),
					{
						status: 400,
						headers: {
							'Content-Type': 'application/json'
						}
					}
				)
		) as unknown as typeof fetch

		const failure = (await apiGet('/items').catch((error) => error)) as CloudflareAPIError

		expect(failure).toBeInstanceOf(CloudflareAPIError)
		expect(failure.message).toContain('7003')
		expect(failure.message).toContain('Could not route to the requested resource')
		expect(failure.code).toBe(400)
		expect(failure.errors[0]).toEqual({
			code: 7003,
			message: 'Could not route to the requested resource'
		})
	})
})

describe('kvDelete', () => {
	test('issues DELETE to the KV values endpoint and resolves on success envelope', async () => {
		const calls: Array<{ url: string; method: string; authorization: string | null }> = []

		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			const headers = new Headers(init?.headers)
			calls.push({
				url,
				method: String(init?.method ?? 'GET'),
				authorization: headers.get('authorization')
			})

			return new Response(
				JSON.stringify({
					success: true,
					errors: [],
					messages: [],
					result: null
				}),
				{
					status: 200,
					headers: {
						'Content-Type': 'application/json'
					}
				}
			)
		}) as unknown as typeof fetch

		await expect(
			kvDelete('acct-123', 'ns-abc', 'settings:defaultAccountId', { token: 'cf_test_token' })
		).resolves.toBeUndefined()

		expect(calls).toHaveLength(1)
		expect(calls[0].method).toBe('DELETE')
		expect(calls[0].url).toBe(
			'https://api.cloudflare.com/client/v4/accounts/acct-123/storage/kv/namespaces/ns-abc/values/settings%3AdefaultAccountId'
		)
		expect(calls[0].authorization).toBe('Bearer cf_test_token')
	})
})
