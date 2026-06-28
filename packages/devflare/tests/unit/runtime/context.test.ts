// =============================================================================
// Runtime Context Tests — ASL-based context management
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	createDurableObjectAlarmEvent,
	createDurableObjectFetchEvent,
	createEmailEvent,
	createFetchEvent,
	createQueueEvent,
	createScheduledEvent,
	createTailEvent,
	getContext,
	getContextOrNull,
	getDurableObjectAlarmEvent,
	getDurableObjectEvent,
	getDurableObjectFetchEvent,
	getEmailEvent,
	getFetchEvent,
	getQueueEvent,
	getScheduledEvent,
	getTailEvent,
	runWithContext,
	runWithEventContext
} from '../../../src/runtime/context'
import { ContextAccessError } from '../../../src/runtime/validation'

/** Helper to create a mock ExecutionContext */
function createMockCtx(): ExecutionContext {
	return {
		waitUntil: () => {},
		passThroughOnException: () => {},
		props: {}
	} as ExecutionContext
}

function createMockState(): DurableObjectState {
	return {
		storage: {} as DurableObjectStorage,
		waitUntil: () => {},
		blockConcurrencyWhile: async <T>(callback: () => Promise<T>) => callback()
	} as unknown as DurableObjectState
}

function createMockQueueBatch(): MessageBatch<{ value: string }> {
	return {
		queue: 'test-queue',
		metadata: {
			metrics: {
				backlogCount: 0,
				backlogBytes: 0
			}
		},
		messages: [
			{
				id: 'msg-1',
				timestamp: new Date('2026-03-17T00:00:00.000Z'),
				body: { value: 'queued' },
				attempts: 1,
				ack() {},
				retry() {}
			} as Message<{ value: string }>
		],
		ackAll() {},
		retryAll() {}
	} as MessageBatch<{ value: string }>
}

function createMockEmailMessage(): ForwardableEmailMessage {
	return {
		from: 'sender@example.com',
		to: 'worker@example.com',
		headers: new Headers(),
		raw: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.close()
			}
		}),
		rawSize: 0,
		setReject() {},
		forward: async () => {},
		reply: async () => {}
	} as unknown as ForwardableEmailMessage
}

describe('runWithContext', () => {
	test('runs function with context available', () => {
		const mockEnv = { KV: {} }
		const mockCtx = createMockCtx()

		const result = runWithContext(mockEnv, mockCtx, null, () => {
			const ctx = getContext()
			return ctx.env
		})

		expect(result).toBe(mockEnv)
	})

	test('provides request in context', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()
		const mockRequest = new Request('https://example.com')

		runWithContext(mockEnv, mockCtx, mockRequest, () => {
			const ctx = getContext()
			expect(ctx.request).toBe(mockRequest)
		})
	})

	test('establishes Durable Object alarm events automatically when using runWithContext', () => {
		const mockEnv = { TEST: true }
		const mockState = createMockState()

		runWithContext(
			mockEnv,
			mockState,
			null,
			() => {
				expect(getDurableObjectEvent().type).toBe('durable-object-alarm')
				expect(getDurableObjectAlarmEvent().state).toBe(mockState)
			},
			'durable-object-alarm'
		)
	})

	test('initializes empty locals', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			const ctx = getContext()
			expect(ctx.locals).toEqual({})
		})
	})

	test('preserves context through async operations', async () => {
		const mockEnv = { value: 42 }
		const mockCtx = createMockCtx()

		const result = await runWithContext(mockEnv, mockCtx, null, async () => {
			await Promise.resolve()
			const ctx = getContext()
			return (ctx.env as { value: number }).value
		})

		expect(result).toBe(42)
	})

	test('nested contexts use inner context', () => {
		const outerEnv = { level: 'outer' }
		const innerEnv = { level: 'inner' }
		const mockCtx = createMockCtx()

		runWithContext(outerEnv, mockCtx, null, () => {
			expect((getContext().env as { level: string }).level).toBe('outer')

			runWithContext(innerEnv, mockCtx, null, () => {
				expect((getContext().env as { level: string }).level).toBe('inner')
			})

			expect((getContext().env as { level: string }).level).toBe('outer')
		})
	})
})

describe('getContext', () => {
	test('throws when called outside context', () => {
		expect(() => getContext()).toThrow(ContextAccessError)
	})

	test('error message is helpful', () => {
		try {
			getContext()
		} catch (e) {
			expect(e).toBeInstanceOf(ContextAccessError)
			const error = e as ContextAccessError
			expect(error.message).toContain('Context not available')
			expect(error.message).toContain('nodejs_compat')
		}
	})
})

describe('getContextOrNull', () => {
	test('returns null when called outside context', () => {
		const result = getContextOrNull()
		expect(result).toBeNull()
	})

	test('returns context when available', () => {
		const mockEnv = { test: true }
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			const result = getContextOrNull()
			expect(result).not.toBeNull()
			expect((result?.env as { test: boolean }).test).toBe(true)
		})
	})
})

describe('event-first context accessors', () => {
	test('establishes fetch events through AsyncLocalStorage', () => {
		const mockEnv = { CACHE: true }
		const mockCtx = createMockCtx()
		const request = new Request('https://example.com/users/123')
		const fetchEvent = createFetchEvent(request, mockEnv, mockCtx, {
			params: { id: '123' }
		})

		runWithEventContext(fetchEvent, () => {
			expect(getFetchEvent()).toBe(fetchEvent)
			expect(getFetchEvent().request).toBe(request)
			expect(getFetchEvent().params.id).toBe('123')
			expect(fetchEvent.url).toBeInstanceOf(URL)
			expect(fetchEvent.url.href).toBe('https://example.com/users/123')
			expect(fetchEvent.url.pathname).toBe('/users/123')
			expect(fetchEvent.request.url).toBe('https://example.com/users/123')
			expect(Object.keys(fetchEvent)).toContain('url')
			expect(Reflect.getOwnPropertyDescriptor(fetchEvent, 'url')?.value).toBeInstanceOf(URL)
			expect(
				(Reflect.getOwnPropertyDescriptor(fetchEvent, 'url')?.value as URL | undefined)?.href
			).toBe('https://example.com/users/123')
		})
	})

	test('exposes queue, scheduled, email, tail, and Durable Object getters', () => {
		const mockEnv = { TEST: true }
		const mockCtx = createMockCtx()
		const mockState = createMockState()
		const batch = createMockQueueBatch()
		const controller = {
			cron: '0 * * * *',
			scheduledTime: Date.now(),
			noRetry() {}
		} as ScheduledController
		const emailMessage = createMockEmailMessage()
		const traceItems = [
			{ scriptName: 'worker', outcome: 'ok', eventTimestamp: Date.now() } as TraceItem
		]
		const doRequest = new Request('https://example.com/do')

		runWithEventContext(createQueueEvent(batch, mockEnv, mockCtx), () => {
			expect(getQueueEvent().batch).toBe(batch)
			expect(getQueueEvent().messages).toHaveLength(1)
		})

		runWithEventContext(createScheduledEvent(controller, mockEnv, mockCtx), () => {
			expect(getScheduledEvent().controller.cron).toBe('0 * * * *')
		})

		runWithEventContext(createEmailEvent(emailMessage, mockEnv, mockCtx), () => {
			expect(getEmailEvent().message.from).toBe('sender@example.com')
			expect(getEmailEvent().from).toBe('sender@example.com')
		})

		runWithEventContext(createTailEvent(traceItems, mockEnv, mockCtx), () => {
			expect(getTailEvent().events).toBe(traceItems)
			expect(getTailEvent()).toHaveLength(1)
		})

		runWithEventContext(createDurableObjectFetchEvent(doRequest, mockEnv, mockState), () => {
			expect(getDurableObjectEvent().type).toBe('durable-object-fetch')
			expect(getDurableObjectFetchEvent().request).toBe(doRequest)
			expect(getDurableObjectFetchEvent().state).toBe(mockState)
		})

		runWithEventContext(createDurableObjectAlarmEvent(mockEnv, mockState), () => {
			expect(getDurableObjectEvent().type).toBe('durable-object-alarm')
			expect(getDurableObjectAlarmEvent().state).toBe(mockState)
		})
	})

	test('safe accessors return null outside the matching surface', () => {
		expect(getFetchEvent.safe()).toBeNull()
		expect(getQueueEvent.safe()).toBeNull()
		expect(getScheduledEvent.safe()).toBeNull()
		expect(getEmailEvent.safe()).toBeNull()
		expect(getTailEvent.safe()).toBeNull()
		expect(getDurableObjectEvent.safe()).toBeNull()

		const mockEnv = { TEST: true }
		const mockCtx = createMockCtx()
		const batch = createMockQueueBatch()

		runWithEventContext(createQueueEvent(batch, mockEnv, mockCtx), () => {
			expect(getFetchEvent.safe()).toBeNull()
			expect(() => getFetchEvent()).toThrow(ContextAccessError)
		})
	})
})

describe('locals mutation', () => {
	test('allows setting locals', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			const ctx = getContext()
			ctx.locals.userId = '123'
			ctx.locals.role = 'admin'

			expect(ctx.locals.userId).toBe('123')
			expect(ctx.locals.role).toBe('admin')
		})
	})

	test('locals persist within same context', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			const ctx1 = getContext()
			ctx1.locals.value = 'set'

			const ctx2 = getContext()
			expect(ctx2.locals.value).toBe('set')
		})
	})

	test('locals are isolated between contexts', () => {
		const mockEnv = {}
		const mockCtx = createMockCtx()

		runWithContext(mockEnv, mockCtx, null, () => {
			getContext().locals.outer = true

			runWithContext(mockEnv, mockCtx, null, () => {
				expect(getContext().locals.outer).toBeUndefined()
				getContext().locals.inner = true
			})

			expect(getContext().locals.outer).toBe(true)
			expect(getContext().locals.inner).toBeUndefined()
		})
	})
})
