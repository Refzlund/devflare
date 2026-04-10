// =============================================================================
// Case 16: Workflows — Tests
// =============================================================================
// Tests for models and transport encoding/decoding.
// These are PURE LOGIC tests — no mocks, no bindings, just testing the code.
//
// Workflow INTEGRATION tests are skipped since Workflows require deployment.
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'
import {
	Order,
	StepResult,
	WorkflowInstance,
	type OrderData,
	type StepResultData,
	type WorkflowInstanceData
} from '../src/models'
import { transport } from '../src/transport'
import { OrderProcessingWorkflow } from '../src/wf.order-processor'
import { DataPipelineWorkflow } from '../src/wf.data-pipeline'

// -----------------------------------------------------------------------------
// Test Setup
// -----------------------------------------------------------------------------

beforeAll(async () => {
	await createTestContext()
})

afterAll(async () => {
	await env.dispose()
})

// -----------------------------------------------------------------------------
// Order Model — Pure Logic Tests
// -----------------------------------------------------------------------------

describe('Order Model', () => {
	const orderData: OrderData = {
		id: 'order-123',
		customerId: 'cust-456',
		items: [
			{ productId: 'prod-1', name: 'Widget', quantity: 2, price: 10.00 },
			{ productId: 'prod-2', name: 'Gadget', quantity: 1, price: 25.00 }
		],
		status: 'pending',
		createdAt: '2025-01-01T00:00:00Z',
		updatedAt: '2025-01-01T00:00:00Z'
	}

	test('creates Order from data', () => {
		const order = new Order(orderData)

		expect(order.id).toBe('order-123')
		expect(order.customerId).toBe('cust-456')
		expect(order.items).toHaveLength(2)
		expect(order.status).toBe('pending')
	})

	test('calculates total correctly', () => {
		const order = new Order(orderData)
		// 2 * 10 + 1 * 25 = 45
		expect(order.total).toBe(45)
	})

	test('calculates item count correctly', () => {
		const order = new Order(orderData)
		// 2 + 1 = 3
		expect(order.itemCount).toBe(3)
	})

	test('checks if cancellable', () => {
		const pendingOrder = new Order({ ...orderData, status: 'pending' })
		const shippedOrder = new Order({ ...orderData, status: 'shipped' })

		expect(pendingOrder.canCancel()).toBe(true)
		expect(shippedOrder.canCancel()).toBe(false)
	})

	test('updates status', () => {
		const order = new Order(orderData)
		order.updateStatus('shipped')

		expect(order.status).toBe('shipped')
		expect(order.updatedAt.getTime()).toBeGreaterThan(order.createdAt.getTime())
	})

	test('converts to data', () => {
		const order = new Order(orderData)
		const data = order.toData()

		expect(data.id).toBe(orderData.id)
		expect(data.customerId).toBe(orderData.customerId)
		expect(data.items).toEqual(orderData.items)
	})
})

// -----------------------------------------------------------------------------
// StepResult Model — Pure Logic Tests
// -----------------------------------------------------------------------------

describe('StepResult Model', () => {
	test('calculates duration', () => {
		const result = new StepResult({
			stepName: 'test-step',
			success: true,
			startedAt: '2025-01-01T00:00:00.000Z',
			completedAt: '2025-01-01T00:00:01.500Z',
			retryCount: 0
		})

		expect(result.durationMs).toBe(1500)
	})

	test('detects retries', () => {
		const noRetry = new StepResult({
			stepName: 'test',
			success: true,
			startedAt: new Date().toISOString(),
			completedAt: new Date().toISOString(),
			retryCount: 0
		})

		const withRetry = new StepResult({
			stepName: 'test',
			success: true,
			startedAt: new Date().toISOString(),
			completedAt: new Date().toISOString(),
			retryCount: 2
		})

		expect(noRetry.hadRetries).toBe(false)
		expect(withRetry.hadRetries).toBe(true)
	})
})

// -----------------------------------------------------------------------------
// WorkflowInstance Model — Pure Logic Tests
// -----------------------------------------------------------------------------

describe('WorkflowInstance Model', () => {
	test('tracks successful and failed steps', () => {
		const now = new Date().toISOString()
		const instance = new WorkflowInstance({
			id: 'wf-1',
			workflowName: 'TestWorkflow',
			status: 'running',
			currentStep: 'step3',
			steps: [
				{ stepName: 'step1', success: true, startedAt: now, completedAt: now, retryCount: 0 },
				{ stepName: 'step2', success: true, startedAt: now, completedAt: now, retryCount: 0 },
				{ stepName: 'step3', success: false, error: 'Failed', startedAt: now, completedAt: now, retryCount: 1 }
			],
			input: {},
			startedAt: now
		})

		expect(instance.successfulSteps).toBe(2)
		expect(instance.failedSteps).toBe(1)
	})

	test('completes workflow', () => {
		const instance = new WorkflowInstance({
			id: 'wf-1',
			workflowName: 'TestWorkflow',
			status: 'running',
			currentStep: 'final',
			steps: [],
			input: {},
			startedAt: new Date().toISOString()
		})

		instance.complete({ result: 'success' })

		expect(instance.status).toBe('completed')
		expect(instance.output).toEqual({ result: 'success' })
		expect(instance.completedAt).toBeDefined()
	})

	test('fails workflow', () => {
		const instance = new WorkflowInstance({
			id: 'wf-1',
			workflowName: 'TestWorkflow',
			status: 'running',
			currentStep: 'failing',
			steps: [],
			input: {},
			startedAt: new Date().toISOString()
		})

		instance.fail('Something went wrong')

		expect(instance.status).toBe('failed')
		expect(instance.error).toBe('Something went wrong')
		expect(instance.completedAt).toBeDefined()
	})
})

// -----------------------------------------------------------------------------
// Transport Encoding/Decoding — Pure Logic Tests
// -----------------------------------------------------------------------------

describe('Transport Encoding/Decoding', () => {
	describe('Order Transport', () => {
		const orderData: OrderData = {
			id: 'order-789',
			customerId: 'cust-123',
			items: [{ productId: 'p1', name: 'Test', quantity: 1, price: 50 }],
			status: 'pending',
			createdAt: '2025-01-01T00:00:00Z',
			updatedAt: '2025-01-01T00:00:00Z'
		}

		test('encodes Order instance', () => {
			const order = new Order(orderData)
			const encoded = transport.Order.encode(order)

			expect(encoded).not.toBe(false)
			expect((encoded as OrderData).id).toBe('order-789')
		})

		test('returns false for non-Order', () => {
			const result = transport.Order.encode({ notAnOrder: true })
			expect(result).toBe(false)
		})

		test('decodes to Order instance', () => {
			const decoded = transport.Order.decode(orderData)

			expect(decoded).toBeInstanceOf(Order)
			expect(decoded.id).toBe('order-789')
			expect(decoded.total).toBe(50) // Method works
		})

		test('roundtrips Order', () => {
			const original = new Order(orderData)
			const encoded = transport.Order.encode(original)
			const decoded = transport.Order.decode(encoded as OrderData)

			expect(decoded.id).toBe(original.id)
			expect(decoded.total).toBe(original.total)
			expect(decoded.canCancel()).toBe(original.canCancel())
		})
	})

	describe('StepResult Transport', () => {
		test('encodes and decodes StepResult', () => {
			const original = new StepResult({
				stepName: 'test-step',
				success: true,
				output: { data: 'test' },
				startedAt: '2025-01-01T00:00:00Z',
				completedAt: '2025-01-01T00:00:01Z',
				retryCount: 2
			})

			const encoded = transport.StepResult.encode(original)
			expect(encoded).not.toBe(false)

			const decoded = transport.StepResult.decode(encoded as StepResultData)
			expect(decoded).toBeInstanceOf(StepResult)
			expect(decoded.stepName).toBe('test-step')
			expect(decoded.durationMs).toBe(1000) // Method works
			expect(decoded.hadRetries).toBe(true) // Method works
		})
	})

	describe('WorkflowInstance Transport', () => {
		test('encodes and decodes WorkflowInstance', () => {
			const now = new Date().toISOString()
			const original = new WorkflowInstance({
				id: 'wf-test',
				workflowName: 'TestWorkflow',
				status: 'completed',
				currentStep: 'done',
				steps: [
					{ stepName: 's1', success: true, startedAt: now, completedAt: now, retryCount: 0 }
				],
				input: { key: 'value' },
				output: { result: 'ok' },
				startedAt: '2025-01-01T00:00:00Z',
				completedAt: '2025-01-01T00:00:05Z'
			})

			const encoded = transport.WorkflowInstance.encode(original)
			expect(encoded).not.toBe(false)

			const decoded = transport.WorkflowInstance.decode(encoded as WorkflowInstanceData)

			expect(decoded).toBeInstanceOf(WorkflowInstance)
			expect(decoded.id).toBe('wf-test')
			expect(decoded.successfulSteps).toBe(1) // Method works
			expect(decoded.durationMs).toBe(5000) // Method works
		})
	})
})

// -----------------------------------------------------------------------------
// Workflow Logic Tests with Real KV
// -----------------------------------------------------------------------------

describe('OrderProcessingWorkflow with Real KV', () => {
	// Step tracker that actually records calls
	function createStepTracker() {
		const stepsCalled: string[] = []
		return {
			stepsCalled,
			async do<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
				stepsCalled.push(name)
				return fn()
			},
			async sleep(name: string, _duration: string): Promise<void> {
				stepsCalled.push(`sleep:${name}`)
			},
			async sleepUntil(name: string, _timestamp: Date | string): Promise<void> {
				stepsCalled.push(`sleepUntil:${name}`)
			},
			async waitForEvent<T>(name: string, _options: { event: string; timeout: string }): Promise<T> {
				stepsCalled.push(`waitForEvent:${name}`)
				return {} as T
			}
		}
	}

	test('processes valid order successfully', async () => {
		const workflow = new OrderProcessingWorkflow(env)
		const step = createStepTracker()

		const result = await workflow.run(
			{
				params: {
					orderId: 'order-test-1',
					order: {
						id: 'order-test-1',
						customerId: 'cust-1',
						items: [
							{ productId: 'p1', name: 'Widget', quantity: 2, price: 10 }
						],
						status: 'pending',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				},
				timestamp: new Date()
			},
			step
		)

		expect(result.success).toBe(true)
		expect(result.orderId).toBe('order-test-1')
		expect(result.trackingNumber).toBeDefined()

		// Verify workflow steps were executed
		expect(step.stepsCalled).toContain('validate-order')
		expect(step.stepsCalled).toContain('reserve-inventory')
		expect(step.stepsCalled).toContain('process-payment')
	})

	test('fails for empty order', async () => {
		const workflow = new OrderProcessingWorkflow(env)
		const step = createStepTracker()

		const result = await workflow.run(
			{
				params: {
					orderId: 'order-empty',
					order: {
						id: 'order-empty',
						customerId: 'cust-1',
						items: [], // Empty!
						status: 'pending',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				},
				timestamp: new Date()
			},
			step
		)

		expect(result.success).toBe(false)
		expect(result.error).toContain('no items')
	})

	test('persists workflow state to real KV', async () => {
		const workflow = new OrderProcessingWorkflow(env)
		const step = createStepTracker()

		await workflow.run(
			{
				params: {
					orderId: 'order-persist-test',
					order: {
						id: 'order-persist-test',
						customerId: 'cust-1',
						items: [{ productId: 'p1', name: 'Test', quantity: 1, price: 10 }],
						status: 'pending',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				},
				timestamp: new Date()
			},
			step
		)

		// Check state was persisted in REAL KV
		const list = await env.WORKFLOW_STATE.list({ prefix: 'workflow:' })
		expect(list.keys.length).toBeGreaterThan(0)

		const stateKey = list.keys.find((k) => k.name.includes('order-persist-test'))
		expect(stateKey).toBeDefined()

		const state = JSON.parse(await env.WORKFLOW_STATE.get(stateKey!.name) ?? '{}')
		expect(state.status).toBe('completed')
	})
})

describe('DataPipelineWorkflow with Real KV', () => {
	function createStepTracker() {
		const stepsCalled: string[] = []
		return {
			stepsCalled,
			async do<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
				stepsCalled.push(name)
				return fn()
			},
			async sleep(name: string, _duration: string): Promise<void> {
				stepsCalled.push(`sleep:${name}`)
			},
			async sleepUntil(name: string, _timestamp: Date | string): Promise<void> {
				stepsCalled.push(`sleepUntil:${name}`)
			},
			async waitForEvent<T>(name: string, _options: { event: string; timeout: string }): Promise<T> {
				stepsCalled.push(`waitForEvent:${name}`)
				return {} as T
			}
		}
	}

	test('processes data pipeline successfully', async () => {
		const workflow = new DataPipelineWorkflow(env)
		const step = createStepTracker()

		const result = await workflow.run(
			{
				params: {
					sourceId: 'source-1',
					sourcePath: '/data/input',
					destinationPath: '/data/output',
					transformations: ['normalize', 'filter']
				},
				timestamp: new Date()
			},
			step
		)

		expect(result.recordsProcessed).toBeGreaterThan(0)
		expect(result.outputPath).toBe('/data/output')

		// Verify steps were called
		expect(step.stepsCalled).toContain('extract-data')
		expect(step.stepsCalled).toContain('transform-normalize')
		expect(step.stepsCalled).toContain('transform-filter')
		expect(step.stepsCalled).toContain('validate-data')
		expect(step.stepsCalled).toContain('load-data')
	})

	test('applies multiple transformations', async () => {
		const workflow = new DataPipelineWorkflow(env)
		const step = createStepTracker()

		const result = await workflow.run(
			{
				params: {
					sourceId: 'source-2',
					sourcePath: '/data/in',
					destinationPath: '/data/out',
					transformations: ['normalize', 'filter', 'enrich']
				},
				timestamp: new Date()
			},
			step
		)

		expect(result.recordsProcessed).toBeGreaterThan(0)

		// All transformations should be called
		expect(step.stepsCalled).toContain('transform-normalize')
		expect(step.stepsCalled).toContain('transform-filter')
		expect(step.stepsCalled).toContain('transform-enrich')
	})
})
