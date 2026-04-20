import { afterEach, describe, expect, mock, test } from 'bun:test'
import { runAccountCommand } from '../../../src/cli/commands/account'
import { jsonResponse } from '../../helpers/cloudflare-api'
import { createLogger } from '../../helpers/mock-logger'

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN
const originalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID

afterEach(() => {
	globalThis.fetch = originalFetch
	if (originalToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalToken
	}
	if (originalAccountId === undefined) {
		delete process.env.CLOUDFLARE_ACCOUNT_ID
	} else {
		process.env.CLOUDFLARE_ACCOUNT_ID = originalAccountId
	}
})

describe('account command', () => {
	test('falls back to the configured account when all-account enumeration is unavailable', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		process.env.CLOUDFLARE_ACCOUNT_ID = 'acc_123'

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts?page=1&per_page=50')) {
				return new Response(JSON.stringify({
					success: false,
					errors: [{ code: 6003, message: 'Invalid request headers' }],
					messages: [],
					result: []
				}), {
					status: 400,
					headers: {
						'Content-Type': 'application/json'
					}
				})
			}

			if (url.endsWith('/accounts/acc_123')) {
				return jsonResponse({
					id: 'acc_123',
					name: 'Configured Account',
					type: 'standard'
				})
			}

			if (url.includes('/storage/kv/namespaces')) {
				throw new Error('KV access is not required for this fallback path')
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runAccountCommand(
			{
				command: 'account',
				args: [],
				options: {}
			},
			logger as any,
			{}
		)

		expect(result.exitCode).toBe(0)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Using the configured account directly'))).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Configured Account'))).toBe(true)
	})
})