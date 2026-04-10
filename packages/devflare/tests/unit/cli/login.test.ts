import { afterEach, describe, expect, mock, test } from 'bun:test'
import { runLoginCommand } from '../../../src/cli/commands/login'
import { clearDependencies, setDependencies, type CliDependencies } from '../../../src/cli/dependencies'

interface TestLogger {
	info: ReturnType<typeof mock>
	warn: ReturnType<typeof mock>
	error: ReturnType<typeof mock>
	success: ReturnType<typeof mock>
	debug: ReturnType<typeof mock>
	log: ReturnType<typeof mock>
	messages: Array<{ level: string; args: unknown[] }>
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g

function stripAnsi(value: string): string {
	return value.replace(ANSI_REGEX, '')
}

function createLogger(): TestLogger {
	const messages: Array<{ level: string; args: unknown[] }> = []

	const createMethod = (level: string) => mock((...args: unknown[]) => {
		messages.push({ level, args })
	})

	return {
		info: createMethod('info'),
		warn: createMethod('warn'),
		error: createMethod('error'),
		success: createMethod('success'),
		debug: createMethod('debug'),
		log: createMethod('log'),
		messages
	}
}

function jsonResponse(result: unknown, resultInfo?: Record<string, number>): Response {
	return new Response(JSON.stringify({
		success: true,
		errors: [],
		messages: [],
		result,
		...(resultInfo ? { result_info: resultInfo } : {})
	}), {
		headers: {
			'Content-Type': 'application/json'
		}
	})
}

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
	clearDependencies()
})

describe('login command', () => {
	test('skips Wrangler login when authentication already exists', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/accounts?page=1&per_page=50')) {
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

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as typeof fetch

		const execCalls: Array<{ command: string; args: string[] }> = []
		const deps: CliDependencies = {
			fs: {} as CliDependencies['fs'],
			exec: {
				exec: async (command, args = []) => {
					execCalls.push({ command, args })
					return {
						exitCode: 0,
						stdout: '',
						stderr: '',
						failed: false,
						killed: false
					}
				},
				spawn: () => {
					throw new Error('spawn should not be called')
				}
			}
		}
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
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))

		expect(result.exitCode).toBe(0)
		expect(execCalls).toHaveLength(0)
		expect(renderedMessages.some((message) => message.includes('Already authenticated'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Devflare Account'))).toBe(true)
	})

	test('runs Wrangler login when forced', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/accounts?page=1&per_page=50')) {
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

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as typeof fetch

		const execCalls: Array<{ command: string; args: string[] }> = []
		const deps: CliDependencies = {
			fs: {} as CliDependencies['fs'],
			exec: {
				exec: async (command, args = []) => {
					execCalls.push({ command, args })
					return {
						exitCode: 0,
						stdout: '',
						stderr: '',
						failed: false,
						killed: false
					}
				},
				spawn: () => {
					throw new Error('spawn should not be called')
				}
			}
		}
		setDependencies(deps)

		const logger = createLogger()
		const result = await runLoginCommand(
			{
				command: 'login',
				args: [],
				options: {
					force: true
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))

		expect(result.exitCode).toBe(0)
		expect(execCalls).toEqual([
			{
				command: 'bunx',
				args: ['--bun', 'wrangler', 'login']
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

		const deps: CliDependencies = {
			fs: {} as CliDependencies['fs'],
			exec: {
				exec: async () => ({
					exitCode: 0,
					stdout: '',
					stderr: '',
					failed: false,
					killed: false
				}),
				spawn: () => {
					throw new Error('spawn should not be called')
				}
			}
		}
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
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('Configured account: Configured Account (acc_123)'))).toBe(true)
	})
})
