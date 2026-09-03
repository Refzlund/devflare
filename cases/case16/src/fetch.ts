// =============================================================================
// Case 16: Workflows — Fetch Handler
// =============================================================================
// HTTP handler for triggering and managing workflows.
// =============================================================================

import { env } from 'devflare'
import { OrderProcessingWorkflow, type OrderProcessingInput } from './wf.order-processor'
import { DataPipelineWorkflow, type DataPipelineInput } from './wf.data-pipeline'
import type { WorkflowStep } from './wf.order-processor'

/**
 * Create a mock workflow step for testing
 */
function createMockStep(): WorkflowStep {
	return {
		async do<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
			return fn()
		},
		async sleep(name: string, duration: string): Promise<void> {
			// Parse duration and sleep
			const ms = parseDuration(duration)
			await new Promise((resolve) => setTimeout(resolve, Math.min(ms, 100)))
		},
		async sleepUntil(name: string, timestamp: Date | string): Promise<void> {
			// No-op for testing
		},
		async waitForEvent<T>(name: string, options: { event: string; timeout: string }): Promise<T> {
			return {} as T
		}
	}
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(duration: string): number {
	const match = duration.match(/^(\d+)(ms|s|m|h)$/)
	if (!match) return 0

	const value = parseInt(match[1], 10)
	const unit = match[2]

	switch (unit) {
		case 'ms': return value
		case 's': return value * 1000
		case 'm': return value * 60 * 1000
		case 'h': return value * 60 * 60 * 1000
		default: return 0
	}
}

/**
 * Fetch handler for workflow management
 */
export default async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)

	// Trigger order processing workflow
	if (url.pathname === '/workflows/order' && request.method === 'POST') {
		const input = await request.json() as OrderProcessingInput

		const workflow = new OrderProcessingWorkflow(env as unknown as DevflareEnv)
		const step = createMockStep()

		const result = await workflow.run(
			{ params: input, timestamp: new Date() },
			step
		)

		return Response.json(result)
	}

	// Trigger data pipeline workflow
	if (url.pathname === '/workflows/pipeline' && request.method === 'POST') {
		const input = await request.json() as DataPipelineInput

		const workflow = new DataPipelineWorkflow(env as unknown as DevflareEnv)
		const step = createMockStep()

		const result = await workflow.run(
			{ params: input, timestamp: new Date() },
			step
		)

		return Response.json(result)
	}

	// Get workflow status
	if (url.pathname.startsWith('/workflows/status/')) {
		const workflowId = url.pathname.replace('/workflows/status/', '')
		const state = await env.WORKFLOW_STATE.get(`workflow:${workflowId}`)

		if (!state) {
			return Response.json({ error: 'Workflow not found' }, { status: 404 })
		}

		return Response.json(JSON.parse(state))
	}

	// List recent workflows
	if (url.pathname === '/workflows') {
		const list = await env.WORKFLOW_STATE.list({ prefix: 'workflow:' })
		const workflows = []

		for (const key of list.keys.slice(0, 10)) {
			const state = await env.WORKFLOW_STATE.get(key.name)
			if (state) {
				workflows.push(JSON.parse(state))
			}
		}

		return Response.json({ workflows })
	}

	return Response.json({
		endpoints: [
			'POST /workflows/order - Trigger order processing',
			'POST /workflows/pipeline - Trigger data pipeline',
			'GET /workflows/status/:id - Get workflow status',
			'GET /workflows - List recent workflows'
		]
	})
}
