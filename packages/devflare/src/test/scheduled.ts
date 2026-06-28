// =============================================================================
// Scheduled Test Helper — Trigger scheduled handlers in Bun tests
// =============================================================================
// Usage:
//   import { cf } from 'devflare/test'
//
//   // Trigger the scheduled handler with a specific cron expression
//   await cf.scheduled.trigger('0 */6 * * *')  // Matches 6-hour cleanup
//
//   // Trigger with current timestamp (useful for time-based logic)
//   await cf.scheduled.trigger()
// =============================================================================

import { join } from 'path'
import type { ScheduledController } from '@cloudflare/workers-types'
import { createScheduledEvent, runWithEventContext } from '../runtime'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ScheduledTriggerOptions {
	/** Cron expression that triggered this event */
	cron?: string
	/** Scheduled time (defaults to now) */
	scheduledTime?: number | Date
}

export interface ScheduledTriggerResult {
	/** Whether the handler completed successfully */
	success: boolean
	/** Error message if handler threw */
	error?: string
	/** Cron expression used */
	cron: string
	/** Scheduled time */
	scheduledTime: number
}

// -----------------------------------------------------------------------------
// Global State (set by createTestContext)
// -----------------------------------------------------------------------------

let scheduledHandlerPath: string | null = null
let configDir: string | null = null
let testEnvGetter: (() => Record<string, unknown>) | null = null

// -----------------------------------------------------------------------------
// Configuration (called by createTestContext)
// -----------------------------------------------------------------------------

/**
 * Configure the scheduled test helper
 * @internal Called by createTestContext to set up handler path and env
 */
export function configureScheduled(options: {
	handlerPath: string | null
	configDir: string
	getEnv: () => Record<string, unknown>
}): void {
	scheduledHandlerPath = options.handlerPath
	configDir = options.configDir
	testEnvGetter = options.getEnv
}

/**
 * Reset scheduled helper state
 * @internal Called when test context is disposed
 */
export function resetScheduledState(): void {
	scheduledHandlerPath = null
	configDir = null
	testEnvGetter = null
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Trigger the scheduled handler.
 * This directly invokes the scheduled handler function from your config.
 *
 * @param cronOrOptions - Cron expression string or options object
 * @returns Result object with success status
 *
 * @example
 * // Trigger with specific cron expression (every 6 hours)
 * await cf.scheduled.trigger('0 0,6,12,18 * * *')
 *
 * @example
 * // Trigger with options (Weekly Monday at midnight)
 * await cf.scheduled.trigger({
 *   cron: '0 0 * * 1',
 *   scheduledTime: new Date('2026-01-13T00:00:00Z')
 * })
 *
 * @example
 * // Trigger without cron (just scheduled time)
 * await cf.scheduled.trigger()
 */
async function trigger(
	cronOrOptions?: string | ScheduledTriggerOptions
): Promise<ScheduledTriggerResult> {
	if (!scheduledHandlerPath) {
		throw new Error(
			'Scheduled handler not configured. Make sure your devflare.config.ts has files.scheduled set, ' +
				'and the file exists at the specified path (default: src/scheduled.ts)'
		)
	}

	if (!configDir || !testEnvGetter) {
		throw new Error(
			'Scheduled helper not initialized. Call createTestContext() before using cf.scheduled.trigger()'
		)
	}

	// Normalize options
	const options: ScheduledTriggerOptions =
		typeof cronOrOptions === 'string' ? { cron: cronOrOptions } : (cronOrOptions ?? {})

	const cron = options.cron ?? '* * * * *'
	const scheduledTime =
		options.scheduledTime instanceof Date
			? options.scheduledTime.getTime()
			: (options.scheduledTime ?? Date.now())

	// Import the scheduled handler
	const absolutePath = join(configDir, scheduledHandlerPath)
	const handlerModule = await import(absolutePath)

	// Get the default export (the scheduled handler function)
	const scheduledHandler = handlerModule.default ?? handlerModule.scheduled
	if (typeof scheduledHandler !== 'function') {
		throw new Error(
			`Scheduled handler at "${scheduledHandlerPath}" must export a default function or named "scheduled" export.\n` +
				`Expected: export async function scheduled(event) { ... }`
		)
	}

	// Create mock ScheduledController
	const controller: ScheduledController = {
		scheduledTime,
		cron,
		noRetry() {
			// No-op in tests — would prevent retries in production
		}
	}

	// Create execution context
	const waitUntilPromises: Promise<unknown>[] = []
	const ctx: ExecutionContext = {
		waitUntil(promise: Promise<unknown>) {
			waitUntilPromises.push(promise)
		},
		passThroughOnException() {},
		props: {}
	}

	// Get the test env
	const env = testEnvGetter()
	const scheduledEvent = createScheduledEvent(controller, env, ctx)

	try {
		// Call the handler
		await runWithEventContext(scheduledEvent, () => scheduledHandler(scheduledEvent))

		// Wait for all waitUntil promises
		await Promise.all(waitUntilPromises)

		return {
			success: true,
			cron,
			scheduledTime
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			cron,
			scheduledTime
		}
	}
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const scheduled = {
	trigger
}
