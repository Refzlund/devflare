import { afterEach, expect, mock, test } from 'bun:test'
import { getServiceStatus } from '../../../src/cloudflare/account-status'
import { jsonResponse } from '../../helpers/cloudflare-api'
import { installTrackedTimeouts } from '../../helpers/tracked-timeouts'

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
const originalToken = process.env.CLOUDFLARE_API_TOKEN

afterEach(() => {
	globalThis.fetch = originalFetch
	globalThis.setTimeout = originalSetTimeout
	globalThis.clearTimeout = originalClearTimeout
	if (originalToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalToken
	}
})

test('getServiceStatus clears timeout guards after a successful inventory lookup', async () => {
	process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
	const { scheduledTimeoutIds, clearedTimeoutIds } = installTrackedTimeouts()

	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		const url = String(input)
		if (!url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
			throw new Error(`Unexpected fetch URL: ${url}`)
		}

		return jsonResponse(
			[
				{
					id: 'worker-1',
					name: 'worker-1',
					created_on: '2026-04-12T00:00:00.000Z',
					modified_on: '2026-04-12T00:00:00.000Z'
				}
			],
			{
				page: 1,
				per_page: 50,
				total_pages: 1,
				count: 1,
				total_count: 1
			}
		)
	}) as unknown as typeof fetch

	const status = await getServiceStatus('acc_123', 'workers')

	expect(status).toEqual({
		service: 'workers',
		available: true,
		count: 1
	})
	expect([...clearedTimeoutIds].sort((left, right) => left - right)).toEqual(
		[...scheduledTimeoutIds].sort((left, right) => left - right)
	)
})
