// =============================================================================
// Case 6: Queues & Crons - Queue Consumer Handler
// =============================================================================
// Queue consumer - processes batched messages
// =============================================================================

import { env } from 'devflare'
import type { QueueEvent } from 'devflare/runtime'
import type { Task } from './lib/types'
import { processTask } from './lib/tasks'

/**
 * Queue consumer handler
 * Processes batched messages from TASK_QUEUE
 */
export default async function queue(
	event: QueueEvent<Task>
): Promise<void> {
	for (const message of event.messages) {
		const task = message.body

		try {
			const result = await processTask(task)

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
