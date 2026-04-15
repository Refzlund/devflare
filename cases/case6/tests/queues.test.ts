// =============================================================================
// Case 6: Queues & Crons - Tests with Real Miniflare
// =============================================================================
// Demonstrates testing with REAL KV bindings via createTestContext.
// Pure logic tests don't need bindings.
// Queue handler is tested via cf.queue.trigger() for direct handler invocation.
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'
import { processTask } from '../src/lib/tasks'
import type { Task } from '../src/lib/types'

// -----------------------------------------------------------------------------
// Test Setup
// -----------------------------------------------------------------------------

beforeAll(async () => {
	await createTestContext()
})

afterAll(async () => {
	await env.dispose()
})

describe('Case 6: Queues & Crons', () => {
	// -------------------------------------------------------------------------
	// Pure Logic Tests (no bindings needed)
	// -------------------------------------------------------------------------
	describe('processTask (pure logic)', () => {
		test('processes "process" task type', async () => {
			const task: Task = {
				id: 'task-1',
				type: 'process',
				data: { value: 42 },
				createdAt: Date.now()
			}

			const result = await processTask(task)

			expect(result).toEqual({ processed: true, data: { value: 42 } })
		})

		test('processes "cleanup" task type', async () => {
			const task: Task = {
				id: 'task-2',
				type: 'cleanup',
				data: {},
				createdAt: Date.now()
			}

			const result = await processTask(task)

			expect(result).toEqual({ cleaned: true, items: 0 })
		})

		test('processes "notify" task type', async () => {
			const task: Task = {
				id: 'task-3',
				type: 'notify',
				data: { recipients: ['user@example.com'] },
				createdAt: Date.now()
			}

			const result = await processTask(task)

			expect(result).toEqual({
				notified: true,
				recipients: ['user@example.com']
			})
		})

		test('throws for unknown task type', async () => {
			const task = {
				id: 'task-4',
				type: 'unknown' as Task['type'],
				data: {},
				createdAt: Date.now()
			}

			await expect(processTask(task)).rejects.toThrow(
				'Unknown task type: unknown'
			)
		})
	})

	// -------------------------------------------------------------------------
	// Queue Handler Tests with cf.queue.trigger()
	// Uses the real queue handler + real KV bindings
	// -------------------------------------------------------------------------
	describe('queue handler with cf.queue.trigger()', () => {
		test('processes task and stores result in real KV', async () => {
			const task: Task = {
				id: 'queue-test-1',
				type: 'process',
				data: { value: 100 },
				createdAt: Date.now()
			}

			const result = await cf.queue.trigger<Task>([
				{ id: 'msg-1', body: task }
			])

			// Verify message was acknowledged
			expect(result.acked).toContain('msg-1')
			expect(result.total).toBe(1)

			// Verify result was stored in REAL KV
			const stored = await env.RESULTS.get('result:queue-test-1', 'json') as {
				status: string
				result: { processed: boolean; data: { value: number } }
			} | null
			expect(stored).toBeDefined()
			expect(stored?.status).toBe('completed')
			expect(stored?.result?.processed).toBe(true)
		})

		test('processes multiple tasks in batch', async () => {
			const tasks: Task[] = [
				{ id: 'batch-1', type: 'process', data: { x: 1 }, createdAt: Date.now() },
				{ id: 'batch-2', type: 'cleanup', data: {}, createdAt: Date.now() },
				{ id: 'batch-3', type: 'notify', data: { recipients: ['a@b.com'] }, createdAt: Date.now() }
			]

			const result = await cf.queue.trigger<Task>(
				tasks.map((task, i) => ({ id: `batch-msg-${i}`, body: task }))
			)

			expect(result.acked).toHaveLength(3)
			expect(result.total).toBe(3)

			// Verify all results stored
			for (const task of tasks) {
				const stored = await env.RESULTS.get(`result:${task.id}`, 'json')
				expect(stored).toBeDefined()
			}
		})

		test('retries task on processing error', async () => {
			const task = {
				id: 'error-task',
				type: 'unknown' as Task['type'],
				data: {},
				createdAt: Date.now()
			}

			const result = await cf.queue.trigger<Task>([
				{ id: 'error-msg', body: task }
			])

			// Unknown task type throws, so message should be retried
			expect(result.retried).toContain('error-msg')
		})
	})

	// -------------------------------------------------------------------------
	// Integration Tests with Real Miniflare KV
	// -------------------------------------------------------------------------
	describe('fetch handler with Real Miniflare', () => {
		test('POST /tasks queues task', async () => {
			// Use cf.worker.post to call the fetch handler
			const response = await cf.worker.post('/tasks', {
				type: 'process',
				data: { x: 1 }
			})

			expect(response.status).toBe(202)

			const data = await response.json() as { queued: boolean; taskId: string }
			expect(data.queued).toBe(true)
			expect(data.taskId).toBeDefined()
		})

		test('GET /results/:id returns result from REAL KV', async () => {
			// Pre-populate REAL KV
			await env.RESULTS.put(
				'result:task-123',
				JSON.stringify({ status: 'completed', result: { done: true } })
			)

			const response = await cf.worker.get('/results/task-123')

			expect(response.status).toBe(200)
			const data = await response.json() as { status: string }
			expect(data.status).toBe('completed')
		})

		test('GET /results/:id returns pending for unknown task', async () => {
			const response = await cf.worker.get('/results/unknown')

			expect(response.status).toBe(200)
			const data = await response.json() as { status: string }
			expect(data.status).toBe('pending')
		})
	})

	// -------------------------------------------------------------------------
	// Real KV operations via unified env
	// -------------------------------------------------------------------------
	describe('Real KV operations', () => {
		test('put/get/delete work with real KV', async () => {
			await env.RESULTS.put('key1', 'value1')
			expect(await env.RESULTS.get('key1')).toBe('value1')

			await env.RESULTS.delete('key1')
			expect(await env.RESULTS.get('key1')).toBeNull()
		})

		test('JSON storage works with real KV', async () => {
			await env.RESULTS.put('json-key', JSON.stringify({ foo: 'bar' }))
			const obj = await env.RESULTS.get('json-key', 'json')

			expect(obj).toEqual({ foo: 'bar' })
		})
	})
})
