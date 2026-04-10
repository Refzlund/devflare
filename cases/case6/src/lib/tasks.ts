// =============================================================================
// Case 6: Queues & Crons - Task Processing Logic
// =============================================================================
// Business logic for processing tasks, can be tested independently
// =============================================================================

import type { Task, Env } from './types'

/**
 * Process a task based on its type
 */
export async function processTask(task: Task, env: Env): Promise<unknown> {
	switch (task.type) {
		case 'process':
			return { processed: true, data: task.data }

		case 'cleanup':
			return { cleaned: true, items: 0 }

		case 'notify':
			return { notified: true, recipients: task.data.recipients }

		default:
			throw new Error(`Unknown task type: ${(task as Task).type}`)
	}
}

/**
 * Cleanup old results from KV
 */
export async function cleanupOldResults(env: Env): Promise<void> {
	const list = await env.RESULTS.list({ prefix: 'result:' })

	// In real implementation, check timestamps and delete old entries
	// For demo purposes, we just list the keys
	for (const key of list.keys) {
		// Could check timestamp metadata and delete if old
		// await env.RESULTS.delete(key.name)
	}
}

/**
 * Generate weekly report
 */
export async function generateWeeklyReport(env: Env): Promise<void> {
	const list = await env.RESULTS.list({ prefix: 'result:' })

	await env.RESULTS.put('report:weekly', JSON.stringify({
		totalTasks: list.keys.length,
		generatedAt: Date.now()
	}))
}
