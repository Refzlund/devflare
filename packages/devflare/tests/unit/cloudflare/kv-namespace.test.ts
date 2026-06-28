import { afterEach, describe, expect, mock, test } from 'bun:test'
import { getOrCreateNamedKVNamespace } from '../../../src/cloudflare/kv-namespace'
import { jsonResponse } from '../../helpers/cloudflare-api'

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
})

describe('getOrCreateNamedKVNamespace', () => {
	test('reuses an existing namespace found on a later page', async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)

			if (
				init?.method === 'GET' &&
				url.endsWith('/accounts/acc_123/storage/kv/namespaces?page=1&per_page=50')
			) {
				return jsonResponse([{ id: 'ns-other', title: 'other-namespace' }], {
					page: 1,
					per_page: 50,
					total_pages: 2,
					count: 1,
					total_count: 2
				})
			}

			if (
				init?.method === 'GET' &&
				url.endsWith('/accounts/acc_123/storage/kv/namespaces?page=2&per_page=50')
			) {
				return jsonResponse([{ id: 'ns-devflare', title: 'devflare-usage' }], {
					page: 2,
					per_page: 50,
					total_pages: 2,
					count: 1,
					total_count: 2
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const namespaceId = await getOrCreateNamedKVNamespace('acc_123', undefined, {
			token: 'cf_test_token'
		})

		expect(namespaceId).toBe('ns-devflare')
	})

	test('creates the namespace when no existing match is found', async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)

			if (
				init?.method === 'GET' &&
				url.endsWith('/accounts/acc_123/storage/kv/namespaces?page=1&per_page=50')
			) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			if (init?.method === 'POST' && url.endsWith('/accounts/acc_123/storage/kv/namespaces')) {
				return jsonResponse({
					id: 'ns-created',
					title: 'custom-title'
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const namespaceId = await getOrCreateNamedKVNamespace('acc_123', 'custom-title', {
			token: 'cf_test_token'
		})

		expect(namespaceId).toBe('ns-created')
	})
})
