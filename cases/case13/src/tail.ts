// =============================================================================
// Case 13: Tail Workers — Tail Handler
// =============================================================================
// Demonstrates processing logs from producer workers via tail() handler.
// Logs are batched and delivered after producer worker execution completes.
// =============================================================================

import { env } from 'devflare'
import type { TraceItem, TraceLog } from '@cloudflare/workers-types'

/**
 * Log entry structure for storage
 */
export interface LogEntry {
	id: string
	scriptName: string
	outcome: string
	eventTimestamp: number
	logs: Array<{
		level: string
		message: string[]
		timestamp: number
	}>
	exceptions: Array<{
		name: string
		message: string
		timestamp: number
	}>
	request?: {
		url: string
		method: string
	}
}

/**
 * Process trace items and extract relevant log data
 */
function processTraceItem(event: TraceItem): LogEntry {
	const logs = (event.logs ?? []).map((log: TraceLog) => ({
		level: log.level,
		message: log.message as string[],
		timestamp: log.timestamp
	}))

	const exceptions = (event.exceptions ?? []).map((ex) => ({
		name: ex.name,
		message: ex.message,
		timestamp: ex.timestamp
	}))

	// Extract request info if available
	const request = event.event && 'request' in event.event
		? {
			url: (event.event.request as { url: string }).url,
			method: (event.event.request as { method: string }).method
		}
		: undefined

	return {
		id: `${event.scriptName}-${event.eventTimestamp}`,
		scriptName: event.scriptName ?? 'unknown',
		outcome: event.outcome,
		eventTimestamp: event.eventTimestamp ?? Date.now(),
		logs,
		exceptions,
		request
	}
}

/**
 * Filter logs by minimum level
 */
function filterByLevel(entry: LogEntry, minLevel: string): LogEntry {
	const levels = ['debug', 'log', 'info', 'warn', 'error']
	const minIndex = levels.indexOf(minLevel)

	if (minIndex === -1) return entry

	return {
		...entry,
		logs: entry.logs.filter((log) => {
			const logIndex = levels.indexOf(log.level)
			return logIndex >= minIndex
		})
	}
}

/**
 * Tail handler - processes logs from producer workers
 */
export async function tail(events: TraceItem[]): Promise<void> {
	const minLevel = env.MIN_LOG_LEVEL ?? 'log'

	for (const event of events) {
		// Process the trace item
		let entry = processTraceItem(event)

		// Filter by minimum log level
		entry = filterByLevel(entry, minLevel)

		// Skip if no logs or exceptions after filtering
		if (entry.logs.length === 0 && entry.exceptions.length === 0) {
			continue
		}

		// Store in KV for later retrieval
		const key = `tail:${entry.id}`
		await env.LOG_STORE.put(key, JSON.stringify(entry), {
			expirationTtl: 86400 // 24 hours
		})
	}
}
