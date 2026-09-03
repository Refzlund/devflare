// =============================================================================
// Case 16: Workflows — Order Processing Workflow
// =============================================================================
// Demonstrates a multi-step workflow for order processing.
// Uses wf.*.ts naming convention (like do.*.ts for Durable Objects).
// =============================================================================

import { Order, StepResult, WorkflowInstance, type OrderData } from './models'

/**
 * Workflow event containing input parameters
 */
export interface WorkflowEvent<T = unknown> {
	params: T
	timestamp: Date
}

/**
 * Workflow step interface for durable execution
 */
export interface WorkflowStep {
	do<T>(name: string, fn: () => T | Promise<T>): Promise<T>
	sleep(name: string, duration: string): Promise<void>
	sleepUntil(name: string, timestamp: Date | string): Promise<void>
	waitForEvent<T>(name: string, options: { event: string; timeout: string }): Promise<T>
}

/**
 * Order processing workflow input
 */
export interface OrderProcessingInput {
	orderId: string
	order: OrderData
}

/**
 * Order processing workflow output
 */
export interface OrderProcessingOutput {
	orderId: string
	success: boolean
	shippingLabel?: string
	trackingNumber?: string
	error?: string
}

/**
 * Order Processing Workflow
 * 
 * Steps:
 * 1. Validate order
 * 2. Reserve inventory
 * 3. Process payment
 * 4. Generate shipping label
 * 5. Send confirmation email
 */
export class OrderProcessingWorkflow {
	protected env: DevflareEnv

	constructor(env: DevflareEnv) {
		this.env = env
	}

	/**
	 * Main workflow execution
	 */
	async run(
		event: WorkflowEvent<OrderProcessingInput>,
		step: WorkflowStep
	): Promise<OrderProcessingOutput> {
		const { orderId, order: orderData } = event.params
		const order = new Order(orderData)

		// Create workflow instance for tracking
		const instance = new WorkflowInstance({
			id: `wf-${orderId}-${Date.now()}`,
			workflowName: 'OrderProcessingWorkflow',
			status: 'running',
			currentStep: 'validate',
			steps: [],
			input: event.params,
			startedAt: new Date().toISOString()
		})

		try {
			// Step 1: Validate order
			const validation = await step.do('validate-order', async () => {
				const start = Date.now()
				
				// Validation logic
				if (order.items.length === 0) {
					throw new Error('Order has no items')
				}
				if (order.total <= 0) {
					throw new Error('Order total must be positive')
				}
				if (!order.customerId) {
					throw new Error('Customer ID is required')
				}

				return {
					valid: true,
					total: order.total,
					itemCount: order.itemCount,
					duration: Date.now() - start
				}
			})

			instance.addStep(new StepResult({
				stepName: 'validate-order',
				success: true,
				output: validation,
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				retryCount: 0
			}))

			// Step 2: Reserve inventory
			instance.currentStep = 'reserve-inventory'
			const inventory = await step.do('reserve-inventory', async () => {
				// Simulate inventory reservation
				const reserved = order.items.map((item) => ({
					productId: item.productId,
					quantity: item.quantity,
					reserved: true
				}))

				return { reserved, allAvailable: true }
			})

			instance.addStep(new StepResult({
				stepName: 'reserve-inventory',
				success: true,
				output: inventory,
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				retryCount: 0
			}))

			// Step 3: Process payment
			instance.currentStep = 'process-payment'
			const payment = await step.do('process-payment', async () => {
				// Simulate payment processing
				return {
					transactionId: `txn-${Date.now()}`,
					amount: order.total,
					status: 'completed'
				}
			})

			instance.addStep(new StepResult({
				stepName: 'process-payment',
				success: true,
				output: payment,
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				retryCount: 0
			}))

			// Step 4: Generate shipping label
			instance.currentStep = 'generate-shipping'
			const shipping = await step.do('generate-shipping-label', async () => {
				// Simulate shipping label generation
				const trackingNumber = `TRK${Date.now()}`
				const label = `LABEL-${orderId}-${trackingNumber}`

				return { trackingNumber, shippingLabel: label }
			})

			instance.addStep(new StepResult({
				stepName: 'generate-shipping-label',
				success: true,
				output: shipping,
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				retryCount: 0
			}))

			// Step 5: Send confirmation (with small delay)
			instance.currentStep = 'send-confirmation'
			await step.sleep('confirmation-delay', '100ms')

			const confirmation = await step.do('send-confirmation', async () => {
				// Simulate sending email
				return {
					emailSent: true,
					recipient: order.customerId,
					template: 'order-confirmation'
				}
			})

			instance.addStep(new StepResult({
				stepName: 'send-confirmation',
				success: true,
				output: confirmation,
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				retryCount: 0
			}))

			// Update order status
			order.updateStatus('shipped')

			// Complete workflow
			const output: OrderProcessingOutput = {
				orderId,
				success: true,
				shippingLabel: shipping.shippingLabel,
				trackingNumber: shipping.trackingNumber
			}

			instance.complete(output)

			// Store final state
			await this.env.WORKFLOW_STATE.put(
				`workflow:${instance.id}`,
				JSON.stringify(instance.toData())
			)

			return output

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			
			instance.fail(errorMessage)

			await this.env.WORKFLOW_STATE.put(
				`workflow:${instance.id}`,
				JSON.stringify(instance.toData())
			)

			return {
				orderId,
				success: false,
				error: errorMessage
			}
		}
	}
}

export default OrderProcessingWorkflow
