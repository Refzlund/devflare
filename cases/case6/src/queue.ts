// =============================================================================
// Case 6: Queues & Crons - Queue Consumer Handler
// =============================================================================
// Queue consumer - processes batched messages
// =============================================================================

import type { MessageBatch } from '@cloudflare/workers-types'
import type { Task, Env } from './lib/types'
import { processTask } from './lib/tasks'

/**
 * Queue consumer handler
 * Processes batched messages from TASK_QUEUE
 */
export default async function queue(
	batch: MessageBatch<Task>,
	env: Env,
	ctx: ExecutionContext
): Promise<void> {
	for (const message of batch.messages) {
		const task = message.body

		try {
			const result = await processTask(task, env)

			// Store result
			await env.RESULTS.put(`result:${task.id}`, JSON.stringify({
				status: 'completed',
				result,
				processedAt: Date.now()
			}))

			// Acknowledge message
			message.ack()
		} catch (error) {
			// Retry on failure
			message.retry()
		}
	}
}
