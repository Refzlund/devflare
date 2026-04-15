import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
	getWorkerVersionDetail,
	listWorkerVersions
} from '../../../src/cloudflare/account-workers'
import { jsonResponse } from '../../helpers/cloudflare-api'

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
})

describe('account-workers version metadata parsing', () => {
	test('listWorkerVersions preserves Cloudflare has_preview metadata', async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (!url.includes('/accounts/acc_123/workers/scripts/demo-worker/versions?page=1&per_page=100')) {
				throw new Error(`Unexpected fetch URL: ${url}`)
			}

			return jsonResponse({
				items: [
					{
						id: 'version-preview',
						number: 2,
						metadata: {
							author_id: 'user_123',
							created_on: '2026-04-16T00:00:00.000Z',
							modified_on: '2026-04-16T00:00:01.000Z',
							has_preview: true,
							source: 'wrangler'
						}
					}
				]
			})
		}) as unknown as typeof fetch

		const versions = await listWorkerVersions('acc_123', 'demo-worker', {
			token: 'cf_test_token'
		})

		expect(versions).toHaveLength(1)
		expect(versions[0].id).toBe('version-preview')
		expect(versions[0].metadata.hasPreview).toBe(true)
	})

	test('getWorkerVersionDetail preserves Cloudflare has_preview metadata', async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (!url.includes('/accounts/acc_123/workers/scripts/demo-worker/versions/version-preview')) {
				throw new Error(`Unexpected fetch URL: ${url}`)
			}

			return jsonResponse({
				id: 'version-preview',
				number: 2,
				metadata: {
					author_id: 'user_123',
					created_on: '2026-04-16T00:00:00.000Z',
					modified_on: '2026-04-16T00:00:01.000Z',
					has_preview: true,
					source: 'wrangler'
				}
			})
		}) as unknown as typeof fetch

		const version = await getWorkerVersionDetail('acc_123', 'demo-worker', 'version-preview', {
			token: 'cf_test_token'
		})

		expect(version.id).toBe('version-preview')
		expect(version.metadata.hasPreview).toBe(true)
	})
})