// =============================================================================
// Case 6: Queues & Crons - Fetch Handler
// =============================================================================
// Demonstrates devflare's file-based patterns:
// - src/fetch.ts for HTTP handler
// - src/queue.ts for queue consumer
// - src/scheduled.ts for cron handlers
// =============================================================================

import { env } from 'devflare'
import type { Task } from './lib/types'

/**
 * HTTP handler - accepts tasks and sends to queue
 */
export default async function fetch(
	request: Request
): Promise<Response> {
	const url = new URL(request.url)

	// Route: GET /
	if (url.pathname === '/') {
		return Response.json({
			name: 'Case 6: Queues & Crons',
			endpoints: ['POST /tasks', 'GET /results/:id']
		})
	}

	// Route: POST /tasks - Add task to queue
	if (url.pathname === '/tasks' && request.method === 'POST') {
		const body = await request.json<{ type: Task['type']; data: Record<string, unknown> }>()

		const task: Task = {
			id: crypto.randomUUID(),
			type: body.type,
			data: body.data,
			createdAt: Date.now()
		}

		await env.TASK_QUEUE.send(task)

		return Response.json({ queued: true, taskId: task.id }, { status: 202 })
	}

	// Route: GET /results/:id - Get task result
	if (url.pathname.startsWith('/results/')) {
		const taskId = url.pathname.slice(9)
		const result = await env.RESULTS.get(`result:${taskId}`, 'json')

		if (!result) {
			return Response.json({ status: 'pending' })
		}

		return Response.json(result)
	}

	return new Response('Not found', { status: 404 })
}
