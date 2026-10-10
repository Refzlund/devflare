import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'

interface OrderWorkflowPayload {
	orderId: string
	total: number
}

export class OrderWorkflow extends WorkflowEntrypoint<DevflareEnv, OrderWorkflowPayload> {
	async run(event: WorkflowEvent<OrderWorkflowPayload>, step: WorkflowStep) {
		await step.do('record order', async () => ({
			orderId: event.payload.orderId,
			total: event.payload.total
		}))
	}
}
