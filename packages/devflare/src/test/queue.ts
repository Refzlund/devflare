// =============================================================================
// Queue Test Helper — Trigger queue handlers in Bun tests
// =============================================================================
// Usage:
//   import { cf } from 'devflare/test'
//
//   // Trigger the queue handler with messages
//   await cf.queue.trigger([
//     { id: 'msg-1', body: { type: 'process', data: { x: 1 } } },
//     { id: 'msg-2', body: { type: 'cleanup', data: {} } }
//   ])
//
//   // Or use the convenience method for single messages
//   await cf.queue.send({ type: 'process', data: { x: 1 } })
// =============================================================================

import { join } from 'path'
import type { Message, MessageBatch } from '@cloudflare/workers-types'
import { createQueueEvent, runWithEventContext } from '../runtime'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface QueueMessageOptions<T = unknown> {
	/** Unique message ID (auto-generated if not provided) */
	id?: string
	/** Message body */
	body: T
	/** Timestamp when message was enqueued (defaults to now) */
	timestamp?: Date
	/** Number of times this message has been retried */
	attempts?: number
}

export interface QueueTriggerResult {
	/** Messages that were acknowledged */
	acked: string[]
	/** Messages that were retried */
	retried: string[]
	/** Messages that were explicitly failed with noRetry */
	failed: string[]
	/** Total messages processed */
	total: number
}

// -----------------------------------------------------------------------------
// Global State (set by createTestContext)
// -----------------------------------------------------------------------------

let queueHandlerPath: string | null = null
let configDir: string | null = null
let testEnvGetter: (() => Record<string, unknown>) | null = null

// -----------------------------------------------------------------------------
// Configuration (called by createTestContext)
// -----------------------------------------------------------------------------

/**
 * Configure the queue test helper
 * @internal Called by createTestContext to set up handler path and env
 */
export function configureQueue(options: {
	handlerPath: string | null
	configDir: string
	getEnv: () => Record<string, unknown>
}): void {
	queueHandlerPath = options.handlerPath
	configDir = options.configDir
	testEnvGetter = options.getEnv
}

/**
 * Reset queue helper state
 * @internal Called when test context is disposed
 */
export function resetQueueState(): void {
	queueHandlerPath = null
	configDir = null
	testEnvGetter = null
}

// -----------------------------------------------------------------------------
// Message Builder
// -----------------------------------------------------------------------------

const EMPTY_QUEUE_METADATA: MessageBatchMetadata = {
	metrics: {
		backlogCount: 0,
		backlogBytes: 0
	}
}

/**
 * Create a mock Message object that tracks ack/retry/noRetry calls
 */
function createMessage<T>(options: QueueMessageOptions<T>): Message<T> & {
	_state: 'pending' | 'acked' | 'retried' | 'failed'
} {
	const id = options.id ?? crypto.randomUUID()
	const timestamp = options.timestamp ?? new Date()
	const attempts = options.attempts ?? 1

	let state: 'pending' | 'acked' | 'retried' | 'failed' = 'pending'

	return {
		id,
		timestamp,
		body: options.body,
		attempts,
		ack() {
			state = 'acked'
		},
		retry(opts?: { delaySeconds?: number }) {
			state = 'retried'
		},
		retryAll() {
			state = 'retried'
		},
		// Undocumented but exists — marks as failed with no retry
		get _state() {
			return state
		}
	} as Message<T> & { _state: 'pending' | 'acked' | 'retried' | 'failed' }
}

/**
 * Create a mock MessageBatch from an array of messages
 */
function createMessageBatch<T>(messages: Array<Message<T> & { _state: string }>): MessageBatch<T> {
	return {
		queue: 'test-queue',
		metadata: EMPTY_QUEUE_METADATA,
		messages,
		ackAll() {
			for (const msg of messages) {
				msg.ack()
			}
		},
		retryAll() {
			for (const msg of messages) {
				msg.retry()
			}
		}
	}
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Trigger the queue handler with a batch of messages.
 * This directly invokes the queue handler function from your config.
 *
 * @param messages - Array of message options or bodies
 * @returns Result object with acked/retried/failed message IDs
 *
 * @example
 * ```ts
 * // Trigger with message bodies (IDs auto-generated)
 * const result = await cf.queue.trigger([
 *   { type: 'process', data: { x: 1 } },
 *   { type: 'cleanup', data: {} }
 * ])
 *
 * // Trigger with full message options
 * const result = await cf.queue.trigger([
 *   { id: 'msg-1', body: { type: 'process' }, attempts: 2 }
 * ])
 * ```
 */
async function trigger<T = unknown>(
	messages: Array<QueueMessageOptions<T> | T>
): Promise<QueueTriggerResult> {
	if (!queueHandlerPath) {
		throw new Error(
			'Queue handler not configured. Make sure your devflare.config.ts has files.queue set, ' +
				'and the file exists at the specified path (default: src/queue.ts)'
		)
	}

	if (!configDir || !testEnvGetter) {
		throw new Error(
			'Queue helper not initialized. Call createTestContext() before using cf.queue.trigger()'
		)
	}

	// Import the queue handler
	const absolutePath = join(configDir, queueHandlerPath)
	const handlerModule = await import(absolutePath)

	// Get the default export (the queue handler function)
	const queueHandler = handlerModule.default ?? handlerModule.queue
	if (typeof queueHandler !== 'function') {
		throw new Error(
			`Queue handler at "${queueHandlerPath}" must export a default function or named "queue" export.\n` +
				+`Expected: export async function queue(event) { ... }`
		)
	}

	// Normalize messages to QueueMessageOptions
	const normalizedMessages = messages.map((msg) => {
		if (typeof msg === 'object' && msg !== null && 'body' in msg) {
			return msg as QueueMessageOptions<T>
		}
		return { body: msg as T }
	})

	// Create mock messages with state tracking
	const mockMessages = normalizedMessages.map((opts) => createMessage(opts))

	// Create the batch
	const batch = createMessageBatch(mockMessages)

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
	const queueEvent = createQueueEvent(batch, env, ctx)

	// Call the handler
	await runWithEventContext(queueEvent, () => queueHandler(queueEvent))

	// Wait for all waitUntil promises
	await Promise.all(waitUntilPromises)

	// Collect results
	const acked: string[] = []
	const retried: string[] = []
	const failed: string[] = []

	for (const msg of mockMessages) {
		switch (msg._state) {
			case 'acked':
				acked.push(msg.id)
				break
			case 'retried':
				retried.push(msg.id)
				break
			case 'failed':
				failed.push(msg.id)
				break
			// 'pending' means neither ack nor retry was called
		}
	}

	return {
		acked,
		retried,
		failed,
		total: mockMessages.length
	}
}

/**
 * Convenience method to trigger the queue handler with a single message.
 *
 * @param message - Message body or options
 * @returns Result object
 *
 * @example
 * ```ts
 * await cf.queue.send({ type: 'process', data: { x: 1 } })
 * ```
 */
async function send<T = unknown>(message: QueueMessageOptions<T> | T): Promise<QueueTriggerResult> {
	return trigger([message])
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export const queue = {
	trigger,
	send
}
