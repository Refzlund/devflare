import { afterEach, describe, expect, mock, test } from 'bun:test'
import { runTokenCommand } from '../../../src/cli/commands/token'

interface TestLogger {
	info: ReturnType<typeof mock>
	warn: ReturnType<typeof mock>
	error: ReturnType<typeof mock>
	success: ReturnType<typeof mock>
	debug: ReturnType<typeof mock>
	log: ReturnType<typeof mock>
	prompt: ReturnType<typeof mock>
	messages: Array<{ level: string; args: unknown[] }>
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g

function stripAnsi(value: string): string {
	return value.replace(ANSI_REGEX, '')
}

function createLogger(options: { promptResult?: string | symbol } = {}): TestLogger {
	const messages: Array<{ level: string; args: unknown[] }> = []

	const createMethod = (level: string) => mock((...args: unknown[]) => {
		messages.push({ level, args })
	})
	const prompt = mock(async (...args: unknown[]) => {
		messages.push({ level: 'prompt', args })
		return options.promptResult ?? 'preview'
	})

	return {
		info: createMethod('info'),
		warn: createMethod('warn'),
		error: createMethod('error'),
		success: createMethod('success'),
		debug: createMethod('debug'),
		log: createMethod('log'),
		prompt,
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

afterEach(() => {
	globalThis.fetch = originalFetch
})

describe('token command', () => {
	test('creates a new Devflare-managed account-owned token from a bootstrap token', async () => {
		const requests: Array<{
			url: string
			authorization: string | null
			method: string
			body?: string
		}> = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			const authorization = new Headers(init?.headers).get('Authorization')
			requests.push({
				url,
				authorization,
				method: init?.method ?? 'GET',
				body: typeof init?.body === 'string' ? init.body : undefined
			})

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

			if (url.includes('/accounts/acc_123/tokens/permission_groups?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'group-workers',
						name: 'Workers Scripts Write',
						scopes: ['com.cloudflare.api.account']
					},
					{
						id: 'group-kv',
						name: 'Workers KV Storage Write',
						scopes: ['com.cloudflare.api.account']
					},
					{
						id: 'group-nope',
						name: 'Account WAF Write',
						scopes: ['com.cloudflare.api.account']
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 3,
					total_count: 3
				})
			}

			if (url.endsWith('/accounts/acc_123/tokens')) {
				return jsonResponse({
					id: 'token_123',
					name: 'devflare-custom',
					value: 'cfat_1234567890'
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runTokenCommand(
			{
				command: 'tokens',
				args: ['bootstrap-token'],
				options: {
					new: 'custom'
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))
		const createRequest = requests.find((request) => request.method === 'POST')
		const createRequestBody = JSON.parse(createRequest?.body ?? '{}') as {
			name?: string
			policies?: Array<{ permission_groups?: Array<{ id: string }> }>
		}

		expect(result.exitCode).toBe(0)
		expect(result.output).toBe('cfat_1234567890')
		expect(requests).toHaveLength(3)
		expect(requests.every((request) => request.authorization === 'Bearer bootstrap-token')).toBe(true)
		expect(createRequestBody.name).toBe('devflare-custom')
		expect(createRequestBody.policies?.[0]?.permission_groups?.map((group) => group.id)).toEqual([
			'group-workers',
			'group-kv'
		])
		expect(renderedMessages.some((message) => message.includes('Created devflare-custom'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Permission groups: 2 Devflare-relevant account-scoped selected from 3 available'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('cfat_1234567890'))).toBe(true)
	})

	test('creates an all-flags token from reusable account-scoped permissions only', async () => {
		const requests: Array<{
			url: string
			authorization: string | null
			method: string
			body?: string
		}> = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			const authorization = new Headers(init?.headers).get('Authorization')
			requests.push({
				url,
				authorization,
				method: init?.method ?? 'GET',
				body: typeof init?.body === 'string' ? init.body : undefined
			})

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

			if (url.includes('/accounts/acc_123/tokens/permission_groups?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'group-workers-account',
						name: 'Workers Scripts Write',
						scopes: ['com.cloudflare.api.account']
					},
					{
						id: 'group-queues-account',
						name: 'Queues Write',
						scopes: ['com.cloudflare.api.account']
					},
					{
						id: 'group-workers-zone',
						name: 'Workers Scripts Write',
						scopes: ['com.cloudflare.api.account.zone']
					},
					{
						id: 'group-user-read',
						name: 'User Details Read',
						scopes: ['com.cloudflare.api.user']
					},
					{
						id: 'group-tokens',
						name: 'Account API Tokens Write',
						scopes: ['com.cloudflare.api.account']
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 5,
					total_count: 5
				})
			}

			if (url.endsWith('/accounts/acc_123/tokens')) {
				return jsonResponse({
					id: 'token_999',
					name: 'devflare-everything',
					value: 'cfat_all_flags'
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runTokenCommand(
			{
				command: 'tokens',
				args: ['bootstrap-token'],
				options: {
					new: 'everything',
					'all-flags': true
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))
		const createRequest = requests.find((request) => request.method === 'POST')
		const createRequestBody = JSON.parse(createRequest?.body ?? '{}') as {
			name?: string
			policies?: Array<{ permission_groups?: Array<{ id: string }> }>
		}

		expect(result.exitCode).toBe(0)
		expect(result.output).toBe('cfat_all_flags')
		expect(createRequestBody.name).toBe('devflare-everything')
		expect(createRequestBody.policies?.[0]?.permission_groups?.map((group) => group.id)).toEqual([
			'group-workers-account',
			'group-queues-account'
		])
		expect(renderedMessages.some((message) => message.includes('Permission groups: 2 reusable account-scoped selected from 5 available'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('zone/user-scoped groups are skipped automatically'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Account API Tokens permissions are still excluded'))).toBe(true)
	})

	test('prompts for the token name when --new is passed without a value', async () => {
		const requests: Array<{ url: string; method: string; body?: string }> = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			requests.push({
				url,
				method: init?.method ?? 'GET',
				body: typeof init?.body === 'string' ? init.body : undefined
			})

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

			if (url.includes('/accounts/acc_123/tokens/permission_groups?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'group-workers',
						name: 'Workers Scripts Write',
						scopes: ['com.cloudflare.api.account']
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			if (url.endsWith('/accounts/acc_123/tokens')) {
				return jsonResponse({
					id: 'token_456',
					name: 'devflare-preview',
					value: 'cfat_prompted'
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger({ promptResult: 'preview' })
		const result = await runTokenCommand(
			{
				command: 'tokens',
				args: ['bootstrap-token'],
				options: {
					new: true
				}
			},
			logger as any,
			{}
		)
		const createRequest = requests.find((request) => request.method === 'POST')
		const createRequestBody = JSON.parse(createRequest?.body ?? '{}') as { name?: string }

		expect(result.exitCode).toBe(0)
		expect(logger.prompt).toHaveBeenCalledTimes(1)
		expect(createRequestBody.name).toBe('devflare-preview')
	})

	test('lists only Devflare-managed account-owned tokens', async () => {
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

			if (url.includes('/accounts/acc_123/tokens?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'token_123',
						name: 'devflare-preview',
						status: 'active',
						modified_on: '2026-04-08T10:15:00.000Z'
					},
					{
						id: 'token_124',
						name: 'manual-token',
						status: 'active',
						modified_on: '2026-04-08T10:10:00.000Z'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 2,
					total_count: 2
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runTokenCommand(
			{
				command: 'tokens',
				args: ['bootstrap-token'],
				options: {
					list: true
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))

		expect(result.exitCode).toBe(0)
		expect(result.output).toBe('preview')
		expect(renderedMessages.some((message) => message.includes('Devflare-managed tokens'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('preview'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('devflare-preview'))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('manual-token'))).toBe(false)
	})

	test('rolls a normalized Devflare-managed token name without deleting and recreating it', async () => {
		const requests: Array<{
			url: string
			method: string
			body?: string
		}> = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			requests.push({
				url,
				method: init?.method ?? 'GET',
				body: typeof init?.body === 'string' ? init.body : undefined
			})

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

			if (url.includes('/accounts/acc_123/tokens?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'token_123',
						name: 'devflare-preview',
						status: 'active'
					},
					{
						id: 'token_124',
						name: 'manual-token',
						status: 'active'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 2,
					total_count: 2
				})
			}

			if (init?.method === 'PUT' && url.endsWith('/accounts/acc_123/tokens/token_123/value')) {
				return jsonResponse('cfat_rolled_secret')
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runTokenCommand(
			{
				command: 'tokens',
				args: ['bootstrap-token'],
				options: {
					roll: 'preview'
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))
		const rollRequest = requests.find((request) => request.method === 'PUT')

		expect(result.exitCode).toBe(0)
		expect(result.output).toBe('cfat_rolled_secret')
		expect(rollRequest?.url).toBe('https://api.cloudflare.com/client/v4/accounts/acc_123/tokens/token_123/value')
		expect(rollRequest?.body).toBe('{}')
		expect(renderedMessages.some((message) => message.includes('Rolled 1 Devflare-managed token(s) named devflare-preview'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Cloudflare only returns the new token secret once. Store it safely now.'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('cfat_rolled_secret'))).toBe(true)
	})

	test('deletes a normalized Devflare-managed token name', async () => {
		const deletedUrls: string[] = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
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

			if (url.includes('/accounts/acc_123/tokens?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'token_123',
						name: 'devflare-preview',
						status: 'active'
					},
					{
						id: 'token_124',
						name: 'manual-token',
						status: 'active'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 2,
					total_count: 2
				})
			}

			if (init?.method === 'DELETE' && url.endsWith('/accounts/acc_123/tokens/token_123')) {
				deletedUrls.push(url)
				return jsonResponse({ id: 'token_123' })
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runTokenCommand(
			{
				command: 'tokens',
				args: ['bootstrap-token'],
				options: {
					delete: 'preview'
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))

		expect(result.exitCode).toBe(0)
		expect(result.output).toBe('token_123')
		expect(deletedUrls).toEqual([
			'https://api.cloudflare.com/client/v4/accounts/acc_123/tokens/token_123'
		])
		expect(renderedMessages.some((message) => message.includes('Deleted 1 Devflare-managed token(s) named devflare-preview'))).toBe(true)
	})

	test('deletes all Devflare-managed account-owned tokens without touching other tokens', async () => {
		const deletedUrls: string[] = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
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

			if (url.includes('/accounts/acc_123/tokens?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'token_123',
						name: 'devflare-preview-a',
						status: 'active'
					},
					{
						id: 'token_124',
						name: 'manual-token',
						status: 'active'
					},
					{
						id: 'token_125',
						name: 'devflare-preview-b',
						status: 'disabled'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 3,
					total_count: 3
				})
			}

			if (init?.method === 'DELETE' && url.includes('/accounts/acc_123/tokens/token_')) {
				deletedUrls.push(url)
				return jsonResponse({ id: url.split('/').pop() })
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runTokenCommand(
			{
				command: 'tokens',
				args: ['bootstrap-token'],
				options: {
					'delete-all': true
				}
			},
			logger as any,
			{}
		)
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))

		expect(result.exitCode).toBe(0)
		expect(result.output).toBe('token_123\ntoken_125')
		expect(deletedUrls).toEqual([
			'https://api.cloudflare.com/client/v4/accounts/acc_123/tokens/token_123',
			'https://api.cloudflare.com/client/v4/accounts/acc_123/tokens/token_125'
		])
		expect(renderedMessages.some((message) => message.includes('Deleted 2 Devflare-managed token(s)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Left 1 non-Devflare token(s) untouched.'))).toBe(true)
	})

	test('requires a bootstrap token argument', async () => {
		const logger = createLogger()
		const result = await runTokenCommand(
			{
				command: 'tokens',
				args: [],
				options: {}
			},
			logger as any,
			{}
		)

		expect(result.exitCode).toBe(1)
		expect(logger.messages.some((message) => message.level === 'error')).toBe(false)
		expect(logger.messages.some((message) => stripAnsi(message.args.join(' ')).includes('devflare tokens <bootstrap-token>'))).toBe(true)
		expect(stripAnsi(logger.messages.at(-1)?.args.join(' ') ?? 'missing')).toBe('')
	})

	test('shows a usage summary without logging an error when no token operation is selected', async () => {
		const logger = createLogger()
		const result = await runTokenCommand(
			{
				command: 'tokens',
				args: ['bootstrap-token'],
				options: {}
			},
			logger as any,
			{}
		)
		const renderedMessages = logger.messages.map((message) => stripAnsi(message.args.join(' ')))

		expect(result.exitCode).toBe(1)
		expect(logger.messages.some((message) => message.level === 'error')).toBe(false)
		expect(renderedMessages.some((message) => message.includes('Choose one token operation: --list, --new, --roll, --delete, or --delete-all.'))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('Usage: devflare tokens <bootstrap-token>'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('--roll [name]'))).toBe(true)
		expect(renderedMessages.at(-1)).toBe('')
	})
})
