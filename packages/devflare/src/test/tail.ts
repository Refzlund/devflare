// =============================================================================
// Tail Test Helper — Trigger tail handlers in Bun tests
// =============================================================================
// Usage:
//   import { cf } from 'devflare/test'
//
//   // Trigger the tail handler with trace items
//   // createTestContext() auto-detects src/tail.ts when present.
//   await cf.tail.trigger([
//     {
//       scriptName: 'my-worker',
//       outcome: 'ok',
//       eventTimestamp: Date.now(),
//       logs: [{ level: 'log', message: ['Hello'], timestamp: Date.now() }]
//     }
//   ])
// =============================================================================

import type { TraceItem, TraceLog, TraceException } from '@cloudflare/workers-types'
import { join } from 'path'
import { createTailEvent, runWithEventContext } from '../runtime'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface TraceItemOptions {
	/** Name of the worker that produced this trace */
	scriptName?: string
	/** Outcome of the event */
	outcome?: 'ok' | 'exception' | 'exceededCpu' | 'exceededMemory' | 'unknown'
	/** Timestamp of the event */
	eventTimestamp?: number
	/** Logs produced during the event */
	logs?: TraceLog[]
	/** Exceptions thrown during the event */
	exceptions?: TraceException[]
	/** Event details (request, scheduled, etc.) */
	event?: TraceItem['event']
	/** Script version info */
	scriptVersion?: { id: string }
	/** Dispatch namespace (for namespaced workers) */
	dispatchNamespace?: string
	/** Script tags */
	scriptTags?: string[]
	/** Diagnostics channel events */
	diagnosticsChannelEvents?: unknown[]
}

export interface TailTriggerResult {
	/** Whether the handler completed successfully */
	success: boolean
	/** Error message if handler threw */
	error?: string
	/** Number of trace items processed */
	itemCount: number
}

// -----------------------------------------------------------------------------
// Global State (set by createTestContext)
// -----------------------------------------------------------------------------

let tailHandlerPath: string | null = null
let configDir: string | null = null
let testEnvGetter: (() => Record<string, unknown>) | null = null

// -----------------------------------------------------------------------------
// Configuration (called by createTestContext)
// -----------------------------------------------------------------------------

/**
 * Configure the tail test helper
 * @internal Called by createTestContext to set up handler path and env
 */
export function configureTail(options: {
	handlerPath: string | null
	configDir: string
	getEnv: () => Record<string, unknown>
}): void {
	tailHandlerPath = options.handlerPath
	configDir = options.configDir
	testEnvGetter = options.getEnv
}

/**
 * Reset tail helper state
 * @internal Called when test context is disposed
 */
export function resetTailState(): void {
	tailHandlerPath = null
	configDir = null
	testEnvGetter = null
}

// -----------------------------------------------------------------------------
// Trace Item Builder
// -----------------------------------------------------------------------------

/**
 * Create a complete TraceItem from options
 */
function createTraceItem(options: TraceItemOptions): TraceItem {
	return {
		scriptName: options.scriptName ?? 'test-worker',
		outcome: options.outcome ?? 'ok',
		eventTimestamp: options.eventTimestamp ?? Date.now(),
		event: options.event ?? {
			request: {
				url: 'https://example.com/',
				method: 'GET'
			}
		},
		logs: options.logs ?? [],
		exceptions: options.exceptions ?? [],
		diagnosticsChannelEvents: options.diagnosticsChannelEvents ?? [],
		scriptVersion: options.scriptVersion ?? { id: 'test-version' },
		dispatchNamespace: options.dispatchNamespace,
		scriptTags: options.scriptTags ?? []
	} as TraceItem
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Trigger the tail handler with trace items.
 * This directly invokes the auto-detected `src/tail.ts` handler, or another
 * tail handler that has already been configured internally.
 *
 * @param items - Array of trace items or trace item options
 * @returns Result object with success status
 *
 * @example
 * ```ts
 * // Trigger with full trace items
 * await cf.tail.trigger([
 *   {
 *     scriptName: 'my-worker',
 *     outcome: 'ok',
 *     logs: [{ level: 'log', message: ['Request processed'], timestamp: Date.now() }]
 *   }
 * ])
 *
 * // Trigger with minimal options (defaults applied)
 * await cf.tail.trigger([
 *   { logs: [{ level: 'error', message: ['Something failed'], timestamp: Date.now() }] }
 * ])
 * ```
 */
async function trigger(
	items: Array<TraceItem | TraceItemOptions>
): Promise<TailTriggerResult> {
	if (!tailHandlerPath) {
		throw new Error(
			'Tail handler not configured. Add a src/tail.ts file exporting tail(), ' +
			'or configure a tail handler before calling cf.tail.trigger().'
		)
	}

	if (!configDir || !testEnvGetter) {
		throw new Error(
			'Tail helper not initialized. Call createTestContext() before using cf.tail.trigger()'
		)
	}

	// Normalize trace items
	const traceItems = items.map((item) => {
		// Check if it's already a complete TraceItem (has required fields)
		if ('eventTimestamp' in item && 'outcome' in item && 'scriptName' in item) {
			return item as TraceItem
		}
		return createTraceItem(item as TraceItemOptions)
	})

	// Import the tail handler
	const absolutePath = join(configDir, tailHandlerPath)
	const handlerModule = await import(absolutePath)

	// Get the default export (the tail handler function)
	const tailHandler = handlerModule.default ?? handlerModule.tail
	if (typeof tailHandler !== 'function') {
		throw new Error(
			`Tail handler at "${tailHandlerPath}" must export a default function or named "tail" export.\n` +
			+ `Expected: export async function tail(event) { ... }`
		)
	}

	// Create execution context
	const waitUntilPromises: Promise<unknown>[] = []
	const ctx: ExecutionContext = {
		waitUntil(promise: Promise<unknown>) {
			waitUntilPromises.push(promise)
		},
		passThroughOnException() { },
		props: {}
	}

	// Get the test env
	const env = testEnvGetter()
	const tailEvent = createTailEvent(traceItems, env, ctx)

	try {
		// Call the handler
		await runWithEventContext(
			tailEvent,
			() => tailHandler(tailEvent)
		)

		// Wait for all waitUntil promises
		await Promise.all(waitUntilPromises)

		return {
			success: true,
			itemCount: traceItems.length
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			itemCount: traceItems.length
		}
	}
}

/**
 * Create a TraceItem with sensible defaults.
 * Useful for building test data.
 *
 * @param options - Partial trace item options
 * @returns Complete TraceItem
 */
function create(options: TraceItemOptions = {}): TraceItem {
	return createTraceItem(options)
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const tail = {
	trigger,
	create
}
