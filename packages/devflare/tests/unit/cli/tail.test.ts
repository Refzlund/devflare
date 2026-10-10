import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import * as realWs from 'ws'
import {
	formatTailEventLines,
	parseTailFormat,
	runTailCommand
} from '../../../src/cli/commands/tail'
import type { ParsedArgs } from '../../../src/cli/index'
import { invalidateToken } from '../../../src/cloudflare/auth'
import { jsonResponse } from '../../helpers/cloudflare-api'
import { createLogger } from '../../helpers/mock-logger'

// -----------------------------------------------------------------------------
// Controllable fake `ws` WebSocket
// -----------------------------------------------------------------------------

type WsHandler = (...args: unknown[]) => void

class FakeWebSocket {
	static instances: FakeWebSocket[] = []

	url: string
	protocols?: string | string[]
	options?: { headers?: Record<string, string> }
	closed = false
	private handlers = new Map<string, WsHandler[]>()

	constructor(
		url: string,
		protocols?: string | string[],
		options?: { headers?: Record<string, string> }
	) {
		this.url = url
		this.protocols = protocols
		this.options = options
		FakeWebSocket.instances.push(this)
	}

	on(event: string, handler: WsHandler): void {
		const existing = this.handlers.get(event) ?? []
		existing.push(handler)
		this.handlers.set(event, existing)
	}

	emit(event: string, ...args: unknown[]): void {
		for (const handler of this.handlers.get(event) ?? []) {
			handler(...args)
		}
	}

	close(): void {
		this.closed = true
	}
}

mock.module('ws', () => ({ WebSocket: FakeWebSocket }))

afterAll(() => {
	// Restore the real `ws` module so other unit suites (browser-shim) are not
	// affected by the process-global mock.
	mock.module('ws', () => realWs)
})

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN
const originalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID

beforeEach(() => {
	FakeWebSocket.instances = []
	invalidateToken()
	process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
	process.env.CLOUDFLARE_ACCOUNT_ID = 'acc_123'
})

afterEach(() => {
	globalThis.fetch = originalFetch
	invalidateToken()
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

function createParsed(options: ParsedArgs['options'], args: string[] = []): ParsedArgs {
	return { command: 'tail', args, options }
}

describe('parseTailFormat', () => {
	test('defaults to pretty', () => {
		expect(parseTailFormat(undefined)).toBe('pretty')
	})

	test('accepts pretty and json (case-insensitive)', () => {
		expect(parseTailFormat('pretty')).toBe('pretty')
		expect(parseTailFormat('JSON')).toBe('json')
	})

	test('rejects unknown formats', () => {
		expect(() => parseTailFormat('xml')).toThrow(/pretty.*json/)
	})
})

describe('formatTailEventLines', () => {
	test('renders a request event with logs and exceptions', () => {
		const lines = formatTailEventLines({
			scriptName: 'demo-worker',
			outcome: 'ok',
			eventTimestamp: 0,
			event: { request: { method: 'GET', url: 'https://example.com/' } },
			logs: [{ level: 'log', message: ['hello', 'world'] }],
			exceptions: [{ name: 'TypeError', message: 'boom' }]
		})

		const text = lines.map((line) => line.text)
		expect(text[0]).toContain('demo-worker')
		expect(text[0]).toContain('GET https://example.com/')
		expect(text[0]).toContain('ok')
		expect(text).toContain('  log: hello world')
		expect(text).toContain('  exception TypeError: boom')
	})

	test('marks non-ok outcomes and exceptions as error level', () => {
		const lines = formatTailEventLines({
			outcome: 'exception',
			eventTimestamp: 0,
			event: { cron: '0 * * * *' },
			exceptions: [{ name: 'Error', message: 'fail' }]
		})

		expect(lines[0].level).toBe('error')
		expect(lines[0].text).toContain('cron 0 * * * *')
		expect(lines.some((line) => line.level === 'error' && line.text.includes('fail'))).toBe(true)
	})
})

describe('runTailCommand validation', () => {
	test('errors on an unknown --format', async () => {
		const logger = createLogger()
		const result = await runTailCommand(
			createParsed({ format: 'xml', worker: 'demo' }),
			logger as never,
			{ silent: true }
		)
		expect(result.exitCode).toBe(1)
		expect(logger.error).toHaveBeenCalled()
	})

	test('errors when no worker name can be resolved', async () => {
		const logger = createLogger()
		const result = await runTailCommand(createParsed({}), logger as never, {
			silent: true,
			cwd: '/nonexistent-devflare-dir'
		})
		expect(result.exitCode).toBe(1)
	})

	test('errors when not authenticated', async () => {
		delete process.env.CLOUDFLARE_API_TOKEN
		invalidateToken()
		const logger = createLogger()
		const result = await runTailCommand(createParsed({ worker: 'demo' }), logger as never, {
			silent: true
		})
		expect(result.exitCode).toBe(1)
	})
})

describe('runTailCommand streaming', () => {
	test('creates a tail, connects with auth + sub-protocol, prints events, and deletes on close', async () => {
		const calls: Array<{ method: string; url: string }> = []
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			calls.push({ method: init?.method ?? 'GET', url })

			if (init?.method === 'POST' && url.endsWith('/workers/scripts/demo/tails')) {
				return jsonResponse({
					id: 'tail-1',
					url: 'wss://tail.example.com/tail-1',
					expires_at: '2030-01-01T00:00:00Z'
				})
			}

			if (init?.method === 'DELETE') {
				return jsonResponse({})
			}

			return jsonResponse({})
		}) as unknown as typeof fetch

		const logger = createLogger()
		const resultPromise = runTailCommand(
			createParsed({ worker: 'demo', account: 'acc_123', format: 'json' }),
			logger as never,
			{ silent: true }
		)

		// Wait a tick for the async tail-create + ws construction.
		await new Promise((resolve) => setTimeout(resolve, 20))

		const socket = FakeWebSocket.instances[0]
		expect(socket).toBeDefined()
		expect(socket.url).toBe('wss://tail.example.com/tail-1')
		expect(socket.protocols).toBe('trace-v1')
		expect(socket.options?.headers?.Authorization).toBe('Bearer cf_test_token')

		socket.emit('open')
		socket.emit(
			'message',
			JSON.stringify({
				scriptName: 'demo',
				outcome: 'ok',
				eventTimestamp: 0,
				event: { request: { method: 'GET', url: 'https://example.com/' } },
				logs: []
			})
		)
		socket.emit('close')

		const result = await resultPromise
		expect(result.exitCode).toBe(0)
		expect(socket.closed).toBe(true)

		const methods = calls.map((call) => call.method)
		expect(methods).toContain('POST')
		expect(methods).toContain('DELETE')

		// JSON format echoes the raw event.
		const jsonLogged = (logger.log?.mock.calls ?? []).some((args) =>
			String(args[0]).includes('"scriptName":"demo"')
		)
		expect(jsonLogged).toBe(true)
	})

	test('surfaces a failed tail-create as a clear error without opening a socket', async () => {
		globalThis.fetch = mock(async () => {
			return new Response(
				JSON.stringify({
					success: false,
					errors: [{ code: 10000, message: 'Authentication error' }],
					messages: [],
					result: null
				}),
				{ headers: { 'Content-Type': 'application/json' } }
			)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runTailCommand(
			createParsed({ worker: 'demo', account: 'acc_123' }),
			logger as never,
			{ silent: true }
		)

		expect(result.exitCode).toBe(1)
		expect(FakeWebSocket.instances).toHaveLength(0)
		expect(logger.error).toHaveBeenCalled()
	})
})
