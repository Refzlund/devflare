// =============================================================================
// Tail Command: stream live logs from a deployed Worker
// =============================================================================
// `devflare tail` is an operate-deployed-Worker command: it talks to REAL
// Cloudflare. It mirrors `wrangler tail` at a basic level using Cloudflare's
// Workers Trace (tail) API:
//
//   1. POST /accounts/{account}/workers/scripts/{script}/tails
//        → { id, url, expires_at }  (a short-lived WebSocket endpoint)
//   2. Connect to that WebSocket URL (sub-protocol `trace-v1`, Bearer auth)
//        and receive JSON `TraceItem` events.
//   3. Format + print each event (timestamp, outcome, logs, exceptions).
//   4. On Ctrl-C / stream end, DELETE the tail and close the socket.
//
// Unlike the offline `cf.tail.trigger()` test helper, this is inherently
// remote — there is no local emulation of a live deployed Worker's traffic.
// =============================================================================

import type { ConsolaInstance } from 'consola'
import { getApiToken } from '../../cloudflare/auth'
import { loadConfig } from '../../config/loader'
import { asOptionalString, resolveCloudflareAccountId } from '../command-utils'
import type { CliOptions, CliResult, ParsedArgs } from '../index'
import { createCliTheme, dim, green, logLine, red, whiteDim, yellow } from '../ui'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'
const TAIL_SUBPROTOCOL = 'trace-v1'

export type TailFormat = 'pretty' | 'json'

interface CreatedTail {
	id: string
	url: string
	expiresAt?: string
}

interface CloudflareEnvelope<T> {
	success: boolean
	errors: Array<{ code: number; message: string }>
	result: T
}

// -----------------------------------------------------------------------------
// Trace event shape (subset of @cloudflare/workers-types TraceItem we render)
// -----------------------------------------------------------------------------

export interface TailTraceLog {
	level?: string
	message?: unknown
	timestamp?: number
}

export interface TailTraceException {
	name?: string
	message?: string
	timestamp?: number
}

export interface TailTraceEvent {
	scriptName?: string | null
	outcome?: string
	eventTimestamp?: number | null
	event?: {
		request?: { method?: string; url?: string }
		cron?: string
		scheduledTime?: number
		queue?: string
		mailFrom?: string
		rpcMethod?: string
	} | null
	logs?: TailTraceLog[]
	exceptions?: TailTraceException[]
}

// -----------------------------------------------------------------------------
// Pure formatting helpers (unit-tested without a network/WebSocket)
// -----------------------------------------------------------------------------

export function parseTailFormat(value: string | boolean | undefined): TailFormat {
	const normalized = asOptionalString(value)?.toLowerCase()
	if (normalized === undefined || normalized === 'pretty') {
		return 'pretty'
	}

	if (normalized === 'json') {
		return 'json'
	}

	throw new Error(`--format must be "pretty" or "json", received "${String(value)}".`)
}

function formatTimestamp(timestamp: number | null | undefined): string {
	if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
		return new Date().toISOString()
	}

	return new Date(timestamp).toISOString()
}

function describeTriggerEvent(event: TailTraceEvent['event']): string {
	if (!event) {
		return 'event'
	}

	if (event.request?.url) {
		return `${event.request.method ?? 'GET'} ${event.request.url}`
	}

	if (event.cron) {
		return `cron ${event.cron}`
	}

	if (event.queue) {
		return `queue ${event.queue}`
	}

	if (event.mailFrom) {
		return `email from ${event.mailFrom}`
	}

	if (event.rpcMethod) {
		return `rpc ${event.rpcMethod}`
	}

	return 'event'
}

function stringifyLogMessage(message: unknown): string {
	if (typeof message === 'string') {
		return message
	}

	if (Array.isArray(message)) {
		return message.map((part) => stringifyLogMessage(part)).join(' ')
	}

	if (message === undefined) {
		return ''
	}

	try {
		return JSON.stringify(message)
	} catch {
		return String(message)
	}
}

/**
 * Render one trace event as the lines `devflare tail` prints in pretty mode.
 * Returns an ordered list of `{ level, text }` so the caller can route each
 * line to the matching logger method (and tests can assert content without
 * ANSI noise).
 */
export function formatTailEventLines(
	event: TailTraceEvent
): Array<{ level: string; text: string }> {
	const lines: Array<{ level: string; text: string }> = []
	const timestamp = formatTimestamp(event.eventTimestamp)
	const outcome = event.outcome ?? 'unknown'
	const trigger = describeTriggerEvent(event.event)
	const scriptName = event.scriptName ? ` ${event.scriptName}` : ''

	lines.push({
		level: outcome === 'ok' ? 'info' : 'error',
		text: `[${timestamp}]${scriptName} ${trigger} — ${outcome}`
	})

	for (const log of event.logs ?? []) {
		const level = log.level ?? 'log'
		const text = stringifyLogMessage(log.message)
		lines.push({
			level: level === 'error' || level === 'warn' ? level : 'info',
			text: `  ${level}: ${text}`
		})
	}

	for (const exception of event.exceptions ?? []) {
		const name = exception.name ?? 'Error'
		const message = exception.message ?? ''
		lines.push({
			level: 'error',
			text: `  exception ${name}: ${message}`
		})
	}

	return lines
}

// -----------------------------------------------------------------------------
// Cloudflare tail API
// -----------------------------------------------------------------------------

async function readEnvelope<T>(response: Response, endpoint: string): Promise<T> {
	const text = await response.text()
	let parsed: CloudflareEnvelope<T>
	try {
		parsed = JSON.parse(text) as CloudflareEnvelope<T>
	} catch {
		throw new Error(
			`Cloudflare ${endpoint} returned an invalid response (status ${response.status}).`
		)
	}

	if (!parsed.success) {
		const first = parsed.errors?.[0]
		throw new Error(
			first
				? `Cloudflare ${endpoint} failed (${first.code}): ${first.message}`
				: `Cloudflare ${endpoint} failed (status ${response.status}).`
		)
	}

	return parsed.result
}

async function createTail(
	accountId: string,
	workerName: string,
	token: string
): Promise<CreatedTail> {
	const response = await fetch(
		`${CLOUDFLARE_API_BASE}/accounts/${accountId}/workers/scripts/${encodeURIComponent(
			workerName
		)}/tails`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			}
		}
	)

	const result = await readEnvelope<{ id: string; url: string; expires_at?: string }>(
		response,
		`create tail for ${workerName}`
	)

	return {
		id: result.id,
		url: result.url,
		expiresAt: result.expires_at
	}
}

async function deleteTail(
	accountId: string,
	workerName: string,
	tailId: string,
	token: string
): Promise<void> {
	const response = await fetch(
		`${CLOUDFLARE_API_BASE}/accounts/${accountId}/workers/scripts/${encodeURIComponent(
			workerName
		)}/tails/${encodeURIComponent(tailId)}`,
		{
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`
			}
		}
	)

	// Surface a delete failure only as a non-fatal warning to the caller (the
	// tail itself expires server-side); never swallow it silently.
	if (!response.ok) {
		await readEnvelope<unknown>(response, `delete tail ${tailId}`)
	}
}

function parseTailMessage(raw: string): TailTraceEvent[] {
	const parsed = JSON.parse(raw) as unknown
	if (Array.isArray(parsed)) {
		return parsed as TailTraceEvent[]
	}

	return [parsed as TailTraceEvent]
}

// -----------------------------------------------------------------------------
// Worker name resolution
// -----------------------------------------------------------------------------

async function resolveWorkerName(
	parsed: ParsedArgs,
	cwd: string,
	configFile: string | undefined,
	fallbackArg: string | undefined
): Promise<string | undefined> {
	const explicit = asOptionalString(parsed.options.worker) ?? fallbackArg
	if (explicit) {
		return explicit
	}

	try {
		const config = await loadConfig({ cwd, configFile })
		return config.name
	} catch {
		return undefined
	}
}

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

export async function runTailCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const theme = createCliTheme(parsed.options)
	const cwd = options.cwd ?? process.cwd()
	const configFile = asOptionalString(parsed.options.config)

	let format: TailFormat
	try {
		format = parseTailFormat(parsed.options.format)
	} catch (error) {
		logger.error(error instanceof Error ? error.message : String(error))
		return { exitCode: 1 }
	}

	const fallbackArg = parsed.args[0]
	const workerName = await resolveWorkerName(parsed, cwd, configFile, fallbackArg)
	if (!workerName) {
		logger.error('No Worker name could be resolved.')
		logLine(
			logger,
			dim(
				'Pass a Worker name (`devflare tail <worker>`), --worker <name>, or run inside a configured package.',
				theme
			)
		)
		return { exitCode: 1 }
	}

	const token = await getApiToken()
	if (!token) {
		logger.error('Not authenticated with Cloudflare.')
		logLine(logger, dim('Run `devflare login` first, or set CLOUDFLARE_API_TOKEN.', theme))
		return { exitCode: 1 }
	}

	let configuredAccountId: string | undefined
	try {
		const config = await loadConfig({ cwd, configFile })
		configuredAccountId = config.accountId
	} catch {
		configuredAccountId = undefined
	}

	const accountId = await resolveCloudflareAccountId({
		explicitAccountId: asOptionalString(parsed.options.account),
		configuredAccountId
	})
	if (!accountId) {
		logger.error('No Cloudflare account could be resolved.')
		logLine(
			logger,
			dim(
				'Use --account <id> or set accountId in devflare.config.* / CLOUDFLARE_ACCOUNT_ID.',
				theme
			)
		)
		return { exitCode: 1 }
	}

	logLine(logger)
	logLine(logger, `${yellow('tail', theme)} ${dim('Streaming live logs from Cloudflare', theme)}`)
	logLine(logger, `${dim('worker', theme)} ${green(workerName, theme)}`)
	logLine(logger, `${dim('account', theme)} ${whiteDim(accountId, theme)}`)

	let createdTail: CreatedTail
	try {
		createdTail = await createTail(accountId, workerName, token)
	} catch (error) {
		logger.error(error instanceof Error ? error.message : String(error))
		return { exitCode: 1 }
	}

	logLine(
		logger,
		dim(
			`Connected to tail ${createdTail.id}${
				createdTail.expiresAt ? ` (expires ${createdTail.expiresAt})` : ''
			}. Press Ctrl-C to stop.`,
			theme
		)
	)

	const { WebSocket: WsWebSocket } = (await import('ws')) as unknown as {
		WebSocket: new (
			url: string,
			protocols?: string | string[],
			options?: { headers?: Record<string, string> }
		) => WsLikeSocket
	}

	return new Promise<CliResult>((resolve) => {
		let settled = false
		const socket = new WsWebSocket(createdTail.url, TAIL_SUBPROTOCOL, {
			headers: {
				Authorization: `Bearer ${token}`,
				'User-Agent': 'devflare'
			}
		})

		const cleanup = async (exitCode: number): Promise<void> => {
			if (settled) {
				return
			}
			settled = true

			try {
				socket.close()
			} catch {
				// Socket already closing/closed.
			}

			process.off('SIGINT', onSigint)

			try {
				await deleteTail(accountId, workerName, createdTail.id, token)
			} catch (error) {
				logger.warn(
					`Could not delete the tail session ${createdTail.id}; it will expire on its own. ${
						error instanceof Error ? error.message : String(error)
					}`
				)
			}

			resolve({ exitCode })
		}

		const onSigint = (): void => {
			logLine(logger)
			logLine(logger, dim('Stopping tail…', theme))
			void cleanup(0)
		}

		process.on('SIGINT', onSigint)

		socket.on('open', () => {
			logger.success('Tail stream open')
		})

		socket.on('message', (data: unknown) => {
			const raw = typeof data === 'string' ? data : String(data)
			let events: TailTraceEvent[]
			try {
				events = parseTailMessage(raw)
			} catch {
				logger.warn(`Received a non-JSON tail message: ${raw.slice(0, 200)}`)
				return
			}

			for (const event of events) {
				if (format === 'json') {
					logger.log(JSON.stringify(event))
					continue
				}

				for (const line of formatTailEventLines(event)) {
					if (line.level === 'error') {
						logLine(logger, red(line.text, theme))
					} else if (line.level === 'warn') {
						logLine(logger, yellow(line.text, theme))
					} else {
						logLine(logger, line.text)
					}
				}
			}
		})

		socket.on('error', (error: Error) => {
			logger.error(`Tail stream error: ${error.message}`)
			void cleanup(1)
		})

		socket.on('close', () => {
			if (!settled) {
				logLine(logger, dim('Tail stream closed.', theme))
				void cleanup(0)
			}
		})
	})
}

interface WsLikeSocket {
	close(): void
	on(event: 'open', handler: () => void): void
	on(event: 'message', handler: (data: unknown) => void): void
	on(event: 'error', handler: (error: Error) => void): void
	on(event: 'close', handler: () => void): void
}
