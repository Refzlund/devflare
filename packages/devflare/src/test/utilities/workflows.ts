import type { Pipeline, PipelineRecord } from 'cloudflare:pipelines'

// =============================================================================
// Mock Workflow
// =============================================================================

type MockWorkflowStatus =
	| 'queued'
	| 'running'
	| 'paused'
	| 'errored'
	| 'terminated'
	| 'complete'
	| 'waiting'
	| 'waitingForPause'
	| 'unknown'

export interface MockWorkflowInstanceOptions {
	status?: MockWorkflowStatus
	output?: unknown
	error?: { name: string; message: string }
}

export interface MockWorkflowOptions {
	instances?: Record<string, MockWorkflowInstanceOptions>
}

function createMockWorkflowInstance(
	id: string,
	options: MockWorkflowInstanceOptions = {}
): WorkflowInstance {
	let status: MockWorkflowStatus = options.status ?? 'queued'
	let output = options.output
	let error = options.error

	return {
		id,
		async pause(): Promise<void> {
			status = 'paused'
		},
		async resume(): Promise<void> {
			status = 'running'
		},
		async terminate(): Promise<void> {
			status = 'terminated'
		},
		async restart(): Promise<void> {
			status = 'queued'
			error = undefined
			output = undefined
		},
		async status() {
			return {
				status,
				...(error && { error }),
				...(output !== undefined && { output })
			}
		},
		async sendEvent(_event: { type: string; payload: unknown }): Promise<void> {
			// No-op; pure unit tests can assert their own side effects around the mock.
		}
	} as WorkflowInstance
}

/**
 * Creates a Workflow binding for pure unit tests.
 */
export function createMockWorkflow<PARAMS = unknown>(
	options: MockWorkflowOptions = {}
): Workflow<PARAMS> {
	const instances = new Map<string, WorkflowInstance>()
	let sequence = 0

	for (const [id, instanceOptions] of Object.entries(options.instances ?? {})) {
		instances.set(id, createMockWorkflowInstance(id, instanceOptions))
	}

	const createInstance = (id: string): WorkflowInstance => {
		if (instances.has(id)) {
			throw new Error(`Mock Workflow already has an instance named "${id}".`)
		}

		const instance = createMockWorkflowInstance(id)
		instances.set(id, instance)
		return instance
	}

	return {
		async get(id: string): Promise<WorkflowInstance> {
			const instance = instances.get(id)
			if (!instance) {
				throw new Error(`Mock Workflow has no instance named "${id}".`)
			}
			return instance
		},
		async create(options?: WorkflowInstanceCreateOptions<PARAMS>): Promise<WorkflowInstance> {
			const id = options?.id ?? `mock-workflow-${++sequence}`
			return createInstance(id)
		},
		async createBatch(batch: WorkflowInstanceCreateOptions<PARAMS>[]): Promise<WorkflowInstance[]> {
			return batch.map((options) => {
				const id = options.id ?? `mock-workflow-${++sequence}`
				return createInstance(id)
			})
		}
	} as Workflow<PARAMS>
}

// =============================================================================
// Mock Pipeline
// =============================================================================

export type MockPipeline<T extends PipelineRecord = PipelineRecord> = Pipeline<T> & {
	_getRecords(): T[]
}

/**
 * Creates a Pipeline binding for pure unit tests.
 */
export function createMockPipeline<T extends PipelineRecord = PipelineRecord>(): MockPipeline<T> {
	const records: T[] = []

	return {
		async send(batch: T[]): Promise<void> {
			records.push(...batch)
		},
		_getRecords(): T[] {
			return [...records]
		}
	}
}
