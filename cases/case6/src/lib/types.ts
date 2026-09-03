// =============================================================================
// Case 6: Queues & Crons - Shared Types
// =============================================================================

export interface Task {
	id: string
	type: 'process' | 'cleanup' | 'notify'
	data: Record<string, unknown>
	createdAt: number
}

export interface Env {
	TASK_QUEUE: Queue<Task>
	RESULTS: KVNamespace
}
