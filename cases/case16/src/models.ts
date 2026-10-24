// =============================================================================
// Case 16: Workflows — Models
// =============================================================================
// Domain models for workflow data that require transport encoding/decoding.
// These classes have methods and behavior beyond plain data.
// =============================================================================

/**
 * Order item data structure
 */
export interface OrderItemData {
	productId: string
	name: string
	quantity: number
	price: number
}

/**
 * Order data structure for serialization
 */
export interface OrderData {
	id: string
	customerId: string
	items: OrderItemData[]
	status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
	createdAt: string
	updatedAt: string
}

/**
 * Order class with business logic
 */
export class Order {
	readonly id: string
	readonly customerId: string
	readonly items: OrderItemData[]
	status: OrderData['status']
	readonly createdAt: Date
	updatedAt: Date

	constructor(data: OrderData) {
		this.id = data.id
		this.customerId = data.customerId
		this.items = data.items
		this.status = data.status
		this.createdAt = new Date(data.createdAt)
		this.updatedAt = new Date(data.updatedAt)
	}

	/**
	 * Calculate total order value
	 */
	get total(): number {
		return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
	}

	/**
	 * Get item count
	 */
	get itemCount(): number {
		return this.items.reduce((sum, item) => sum + item.quantity, 0)
	}

	/**
	 * Check if order can be cancelled
	 */
	canCancel(): boolean {
		return this.status === 'pending' || this.status === 'processing'
	}

	/**
	 * Update order status
	 */
	updateStatus(newStatus: OrderData['status']): void {
		this.status = newStatus
		this.updatedAt = new Date()
	}

	/**
	 * Convert to plain data for serialization
	 */
	toData(): OrderData {
		return {
			id: this.id,
			customerId: this.customerId,
			items: this.items,
			status: this.status,
			createdAt: this.createdAt.toISOString(),
			updatedAt: this.updatedAt.toISOString()
		}
	}
}

/**
 * Workflow step result data
 */
export interface StepResultData {
	stepName: string
	success: boolean
	output?: unknown
	error?: string
	startedAt: string
	completedAt: string
	retryCount: number
}

/**
 * Workflow step result with computed properties
 */
export class StepResult {
	readonly stepName: string
	readonly success: boolean
	readonly output?: unknown
	readonly error?: string
	readonly startedAt: Date
	readonly completedAt: Date
	readonly retryCount: number

	constructor(data: StepResultData) {
		this.stepName = data.stepName
		this.success = data.success
		this.output = data.output
		this.error = data.error
		this.startedAt = new Date(data.startedAt)
		this.completedAt = new Date(data.completedAt)
		this.retryCount = data.retryCount
	}

	/**
	 * Get step duration in milliseconds
	 */
	get durationMs(): number {
		return this.completedAt.getTime() - this.startedAt.getTime()
	}

	/**
	 * Check if step had to retry
	 */
	get hadRetries(): boolean {
		return this.retryCount > 0
	}

	/**
	 * Convert to plain data
	 */
	toData(): StepResultData {
		return {
			stepName: this.stepName,
			success: this.success,
			output: this.output,
			error: this.error,
			startedAt: this.startedAt.toISOString(),
			completedAt: this.completedAt.toISOString(),
			retryCount: this.retryCount
		}
	}
}

/**
 * Workflow instance data
 */
export interface WorkflowInstanceData {
	id: string
	workflowName: string
	status: 'running' | 'completed' | 'failed' | 'paused'
	currentStep: string
	steps: StepResultData[]
	input: unknown
	output?: unknown
	error?: string
	startedAt: string
	completedAt?: string
}

/**
 * Workflow instance with tracking
 */
export class WorkflowInstance {
	readonly id: string
	readonly workflowName: string
	status: WorkflowInstanceData['status']
	currentStep: string
	readonly steps: StepResult[]
	readonly input: unknown
	output?: unknown
	error?: string
	readonly startedAt: Date
	completedAt?: Date

	constructor(data: WorkflowInstanceData) {
		this.id = data.id
		this.workflowName = data.workflowName
		this.status = data.status
		this.currentStep = data.currentStep
		this.steps = data.steps.map((s) => new StepResult(s))
		this.input = data.input
		this.output = data.output
		this.error = data.error
		this.startedAt = new Date(data.startedAt)
		this.completedAt = data.completedAt ? new Date(data.completedAt) : undefined
	}

	/**
	 * Get total workflow duration
	 */
	get durationMs(): number | undefined {
		if (!this.completedAt) return undefined
		return this.completedAt.getTime() - this.startedAt.getTime()
	}

	/**
	 * Get successful step count
	 */
	get successfulSteps(): number {
		return this.steps.filter((s) => s.success).length
	}

	/**
	 * Get failed step count
	 */
	get failedSteps(): number {
		return this.steps.filter((s) => !s.success).length
	}

	/**
	 * Add step result
	 */
	addStep(step: StepResult): void {
		this.steps.push(step)
	}

	/**
	 * Mark as completed
	 */
	complete(output: unknown): void {
		this.status = 'completed'
		this.output = output
		this.completedAt = new Date()
	}

	/**
	 * Mark as failed
	 */
	fail(error: string): void {
		this.status = 'failed'
		this.error = error
		this.completedAt = new Date()
	}

	/**
	 * Convert to plain data
	 */
	toData(): WorkflowInstanceData {
		return {
			id: this.id,
			workflowName: this.workflowName,
			status: this.status,
			currentStep: this.currentStep,
			steps: this.steps.map((s) => s.toData()),
			input: this.input,
			output: this.output,
			error: this.error,
			startedAt: this.startedAt.toISOString(),
			completedAt: this.completedAt?.toISOString()
		}
	}
}
