import { WorkflowEntrypoint } from 'cloudflare:workers'

interface OrderWorkflowPayload {
	orderId: string
	total: number
}

export class OrderWorkflow extends WorkflowEntrypoint<DevflareEnv, OrderWorkflowPayload> {
	async run(event, step) {
		await step.do('record order', async () => ({
			orderId: event.payload.orderId,
			total: event.payload.total
		}))
	}
}
