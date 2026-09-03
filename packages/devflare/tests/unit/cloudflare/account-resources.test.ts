import { afterEach, describe, expect, mock, test } from 'bun:test'
import { listVectorizeIndexes } from '../../../src/cloudflare/account-resources'
import { CloudflareAPIError } from '../../../src/cloudflare/api'

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN

afterEach(() => {
	globalThis.fetch = originalFetch
	if (originalToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalToken
	}
})

describe('listVectorizeIndexes', () => {
	test('returns [] when the endpoint is unavailable on this account (404)', async () => {
		globalThis.fetch = mock(async () => {
			return new Response(
				JSON.stringify({
					success: false,
					errors: [{ code: 7000, message: 'No route for that URI' }],
					messages: [],
					result: null
				}),
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			)
		}) as unknown as typeof fetch

		const indexes = await listVectorizeIndexes('acct', { token: 'cf_test_token' })
		expect(indexes).toEqual([])
	})

	test('re-throws permission errors (403) instead of silently returning []', async () => {
		globalThis.fetch = mock(async () => {
			return new Response(
				JSON.stringify({
					success: false,
					errors: [{ code: 9109, message: 'Unauthorized to access this resource.' }],
					messages: [],
					result: null
				}),
				{ status: 403, headers: { 'Content-Type': 'application/json' } }
			)
		}) as unknown as typeof fetch

		await expect(listVectorizeIndexes('acct', { token: 'cf_test_token' })).rejects.toBeInstanceOf(
			CloudflareAPIError
		)
	})
})
