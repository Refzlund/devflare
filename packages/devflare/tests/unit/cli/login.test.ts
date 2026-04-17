import { afterEach, describe, expect, mock, test } from 'bun:test'
import { runLoginCommand } from '../../../src/cli/commands/login'
import { clearDependencies, setDependencies, type CliDependencies } from '../../../src/cli/dependencies'
import { jsonResponse } from '../../helpers/cloudflare-api'
import { createLogger, stripAnsi } from '../../helpers/mock-logger'

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN
const originalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID

function createAccountListResponse(): Response {
	return jsonResponse([
		{
			id: 'acc_123',
			name: 'Devflare Account',
			type: 'standard'
		}
	], {
		page: 1,
		per_page: 50,
		total_pages: 1,
		count: 1,
		total_count: 1
	})
}

function createExecDependencies(
	execImplementation: NonNullable<CliDependencies['exec']>['exec']
): CliDependencies {
	return {
		fs: {} as CliDependencies['fs'],
		exec: {
			exec: execImplementation,
			spawn: () => {
				throw new Error('spawn should not be called')
			}
		}
	}
}

function renderMessages(logger: ReturnType<typeof createLogger>): string[] {
	return logger.messages.map((message) => stripAnsi(message.args.join(' ')))
}

function createRecordedExecDependencies(): {
	execCalls: Array<{ command: string; args: string[] }>
	deps: CliDependencies
} {
	const execCalls: Array<{ command: string; args: string[] }> = []
	return {
		execCalls,
		deps: createExecDependencies(async (command, args = []) => {
			execCalls.push({ command, args })
			return {
				exitCode: 0,
				stdout: '',
				stderr: '',
				failed: false,
				killed: false
			}
		})
	}
}

function mockAuthenticatedAccountFetch(): void {
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		const url = String(input)
		if (url.includes('/accounts?page=1&per_page=50')) {
			return createAccountListResponse()
		}

		throw new Error(`Unexpected fetch URL: ${url}`)
	}) as typeof fetch
}

async function runLoginScenario(
	logger: ReturnType<typeof createLogger>,
	options: { force?: boolean } = {}
) {
	return await runLoginCommand(
		{
			command: 'login',
			args: [],
			options: options.force
				? {
					force: true
				}
				: {}
		},
		logger as any,
		{}
	)
}

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
	clearDependencies()
})

describe('login command', () => {
	test('skips Wrangler login when authentication already exists', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		mockAuthenticatedAccountFetch()

		const { execCalls, deps } = createRecordedExecDependencies()
		setDependencies(deps)

		const logger = createLogger()
		const result = await runLoginScenario(logger)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(execCalls).toHaveLength(0)
		expect(renderedMessages.some((message) => message.includes('Already authenticated'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Devflare Account'))).toBe(true)
	})

	test('runs Wrangler login when forced', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		mockAuthenticatedAccountFetch()

		const { execCalls, deps } = createRecordedExecDependencies()
		setDependencies(deps)

		const logger = createLogger()
		const result = await runLoginScenario(logger, { force: true })
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(execCalls).toEqual([
			{
				command: 'bunx',
				args: ['wrangler', 'login']
			}
		])
		expect(renderedMessages.some((message) => message.includes('Authenticated with Cloudflare'))).toBe(true)
	})

	test('falls back to the configured account when account enumeration is unavailable', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		process.env.CLOUDFLARE_ACCOUNT_ID = 'acc_123'
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/accounts?page=1&per_page=50')) {
				return new Response(JSON.stringify({
					success: false,
					errors: [{ code: 6003, message: 'Invalid request headers' }],
					messages: [],
					result: null
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

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as typeof fetch

		const deps = createExecDependencies(async () => ({
			exitCode: 0,
			stdout: '',
			stderr: '',
			failed: false,
			killed: false
		}))
		setDependencies(deps)

		const logger = createLogger()
		const result = await runLoginCommand(
			{
				command: 'login',
				args: [],
				options: {}
			},
			logger as any,
			{}
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('Configured account: Configured Account (acc_123)'))).toBe(true)
	})
})
