import { afterEach, describe, expect, mock, test } from 'bun:test'
import { apiGetAll } from '../../../src/cloudflare/api'
import { jsonResponse } from '../../helpers/cloudflare-api'
import { installTrackedTimeouts } from '../../helpers/tracked-timeouts'

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout

afterEach(() => {
	globalThis.fetch = originalFetch
	globalThis.setTimeout = originalSetTimeout
	globalThis.clearTimeout = originalClearTimeout
})

describe('apiGetAll', () => {
	test('collects paginated array results', async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.endsWith('/items?page=1&per_page=50')) {
				return jsonResponse([
					{ id: 'one' },
					{ id: 'two' }
				], {
					page: 1,
					per_page: 50,
					total_pages: 2,
					count: 2,
					total_count: 3
				})
			}

			if (url.endsWith('/items?page=2&per_page=50')) {
				return jsonResponse([
					{ id: 'three' }
				], {
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

		expect(result).toEqual([
			{ id: 'one' },
			{ id: 'two' },
			{ id: 'three' }
		])
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

		const result = await apiGetAll<{ name: string; creation_date: string }>('/accounts/test-account/r2/buckets', {
			token: 'cf_test_token'
		})

		expect(result.map((bucket) => bucket.name)).toEqual(['preview-assets', 'preview-archive'])
	})

	test('follows cursor pagination when Cloudflare returns a next cursor', async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.endsWith('/accounts/test-account/r2/buckets?page=1&per_page=50')) {
				return jsonResponse({
					buckets: [
						{ name: 'preview-assets', creation_date: '2026-04-11T00:00:00.000Z' }
					]
				}, {
					cursor: 'next-page',
					per_page: 50
				})
			}

			if (url.endsWith('/accounts/test-account/r2/buckets?cursor=next-page&per_page=50')) {
				return jsonResponse({
					buckets: [
						{ name: 'preview-archive', creation_date: '2026-04-11T00:00:00.000Z' }
					]
				}, {
					per_page: 50
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const result = await apiGetAll<{ name: string; creation_date: string }>('/accounts/test-account/r2/buckets', {
			token: 'cf_test_token'
		})

		expect(result.map((bucket) => bucket.name)).toEqual(['preview-assets', 'preview-archive'])
	})

	test('clears timeout guards after a successful request', async () => {
		const { scheduledTimeoutIds, clearedTimeoutIds } = installTrackedTimeouts()

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (!url.endsWith('/items?page=1&per_page=50')) {
				throw new Error(`Unexpected fetch URL: ${url}`)
			}

			return jsonResponse([
				{ id: 'one' }
			], {
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
})