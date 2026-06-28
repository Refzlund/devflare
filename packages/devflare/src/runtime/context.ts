// =============================================================================
// Runtime Context — ASL-based context management
// =============================================================================

import { AsyncLocalStorage } from 'node:async_hooks'
import {
	createDefaultEvent,
	createDurableObjectAlarmEvent,
	createDurableObjectFetchEvent,
	createDurableObjectWebSocketCloseEvent,
	createDurableObjectWebSocketErrorEvent,
	createDurableObjectWebSocketMessageEvent,
	createEmailEvent,
	createFetchEvent,
	createQueueEvent,
	createScheduledEvent,
	createTailEvent
} from './context-events'
import type {
	DurableObjectAlarmEvent,
	DurableObjectEvent,
	DurableObjectFetchEvent,
	DurableObjectWebSocketCloseEvent,
	DurableObjectWebSocketErrorEvent,
	DurableObjectWebSocketMessageEvent,
	EmailEvent,
	EventAccessor,
	EventContext,
	FetchEvent,
	QueueEvent,
	RequestContext,
	ScheduledEvent,
	TailEvent
} from './context-types'
import { ContextAccessError } from './validation'

export {
	createFetchEvent,
	createQueueEvent,
	createScheduledEvent,
	createEmailEvent,
	createTailEvent,
	createDurableObjectFetchEvent,
	createDurableObjectAlarmEvent,
	createDurableObjectWebSocketMessageEvent,
	createDurableObjectWebSocketCloseEvent,
	createDurableObjectWebSocketErrorEvent
} from './context-events'

export type {
	AnyEvent,
	DurableObjectAlarmEvent,
	DurableObjectEvent,
	DurableObjectEventContext,
	DurableObjectFetchEvent,
	DurableObjectWebSocketCloseEvent,
	DurableObjectWebSocketErrorEvent,
	DurableObjectWebSocketMessageEvent,
	EmailEvent,
	EventContext,
	EventInitOptions,
	FetchEvent,
	FetchEventInit,
	QueueEvent,
	RequestContext,
	RuntimeContextValue,
	RuntimeEventType,
	ScheduledEvent,
	TailEvent,
	WorkerEvent
} from './context-types'

const storage = new AsyncLocalStorage<RequestContext>()

function createLocals<TLocals extends Record<string, unknown>>(): TLocals {
	return {} as TLocals
}

export function runWithContext<T, TEnv = unknown>(
	env: TEnv,
	ctx: ExecutionContext | DurableObjectState | null,
	request: Request | null,
	fn: () => T,
	type: RequestContext['type'] = 'fetch'
): T {
	const locals = createLocals<Record<string, unknown>>()
	const event = createDefaultEvent(env, ctx, request, type, locals)

	return runWithEventContext(event as EventContext<TEnv>, fn)
}

export function runWithEventContext<
	T,
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(event: EventContext<TEnv, TLocals>, fn: () => T): T {
	const context: RequestContext<TEnv, TLocals> = {
		env: event.env,
		ctx: event.ctx,
		request: event.request ?? null,
		locals: event.locals,
		type: event.type,
		event
	}

	return storage.run(context, fn)
}

export function getContext<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(): RequestContext<TEnv, TLocals> {
	const context = storage.getStore()
	if (!context) {
		throw ContextAccessError.contextUnavailable()
	}

	return context as RequestContext<TEnv, TLocals>
}

export function getContextOrNull<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(): RequestContext<TEnv, TLocals> | null {
	const context = storage.getStore()
	return (context ?? null) as RequestContext<TEnv, TLocals> | null
}

export function getEventContext<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(): EventContext<TEnv, TLocals> {
	return getContext<TEnv, TLocals>().event
}

export function getEventContextOrNull<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(): EventContext<TEnv, TLocals> | null {
	return getContextOrNull<TEnv, TLocals>()?.event ?? null
}

export function hasContext(): boolean {
	return storage.getStore() !== undefined
}

function createEventAccessor<TEvent extends EventContext>(
	name: string,
	matcher: (event: EventContext) => event is TEvent
): EventAccessor<TEvent> {
	const accessor = (() => {
		const currentEvent = getEventContextOrNull()

		if (!currentEvent) {
			throw ContextAccessError.contextUnavailable()
		}

		if (!matcher(currentEvent)) {
			throw ContextAccessError.contextUnavailable(
				`${name} is not available in the current '${currentEvent.type}' context.

Devflare stores event objects in AsyncLocalStorage so helpers called within a handler can reach the active event.
Use ${name}.safe() to return null instead of throwing, or call the getter that matches the active surface.`
			)
		}

		return currentEvent
	}) as EventAccessor<TEvent>

	accessor.safe = () => {
		const currentEvent = getEventContextOrNull()
		return currentEvent && matcher(currentEvent) ? currentEvent : null
	}

	return accessor
}

function isFetchEvent(event: EventContext): event is FetchEvent {
	return event.type === 'fetch' && event.request instanceof Request
}

function isQueueEvent(event: EventContext): event is QueueEvent {
	return event.type === 'queue' && 'batch' in event
}

function isScheduledEvent(event: EventContext): event is ScheduledEvent {
	return event.type === 'scheduled' && 'controller' in event
}

function isEmailEvent(event: EventContext): event is EmailEvent {
	return event.type === 'email' && 'message' in event
}

function isTailEvent(event: EventContext): event is TailEvent {
	return event.type === 'tail' && Array.isArray(event) && 'events' in event
}

function isDurableObjectEvent(event: EventContext): event is DurableObjectEvent {
	return event.type.startsWith('durable-object-') && 'state' in event
}

function isDurableObjectFetchEvent(event: EventContext): event is DurableObjectFetchEvent {
	return event.type === 'durable-object-fetch' && event.request instanceof Request
}

function isDurableObjectAlarmEvent(event: EventContext): event is DurableObjectAlarmEvent {
	return event.type === 'durable-object-alarm' && 'state' in event
}

function isDurableObjectWebSocketMessageEvent(
	event: EventContext
): event is DurableObjectWebSocketMessageEvent {
	return event.type === 'durable-object-websocket-message' && 'ws' in event && 'message' in event
}

function isDurableObjectWebSocketCloseEvent(
	event: EventContext
): event is DurableObjectWebSocketCloseEvent {
	return event.type === 'durable-object-websocket-close' && 'ws' in event && 'code' in event
}

function isDurableObjectWebSocketErrorEvent(
	event: EventContext
): event is DurableObjectWebSocketErrorEvent {
	return event.type === 'durable-object-websocket-error' && 'ws' in event && 'error' in event
}

export const getFetchEvent = createEventAccessor<FetchEvent>('getFetchEvent()', isFetchEvent)
export const getQueueEvent = createEventAccessor<QueueEvent>('getQueueEvent()', isQueueEvent)
export const getScheduledEvent = createEventAccessor<ScheduledEvent>(
	'getScheduledEvent()',
	isScheduledEvent
)
export const getEmailEvent = createEventAccessor<EmailEvent>('getEmailEvent()', isEmailEvent)
export const getTailEvent = createEventAccessor<TailEvent>('getTailEvent()', isTailEvent)
export const getDurableObjectEvent = createEventAccessor<DurableObjectEvent>(
	'getDurableObjectEvent()',
	isDurableObjectEvent
)
export const getDurableObjectFetchEvent = createEventAccessor<DurableObjectFetchEvent>(
	'getDurableObjectFetchEvent()',
	isDurableObjectFetchEvent
)
export const getDurableObjectAlarmEvent = createEventAccessor<DurableObjectAlarmEvent>(
	'getDurableObjectAlarmEvent()',
	isDurableObjectAlarmEvent
)
export const getDurableObjectWebSocketMessageEvent =
	createEventAccessor<DurableObjectWebSocketMessageEvent>(
		'getDurableObjectWebSocketMessageEvent()',
		isDurableObjectWebSocketMessageEvent
	)
export const getDurableObjectWebSocketCloseEvent =
	createEventAccessor<DurableObjectWebSocketCloseEvent>(
		'getDurableObjectWebSocketCloseEvent()',
		isDurableObjectWebSocketCloseEvent
	)
export const getDurableObjectWebSocketErrorEvent =
	createEventAccessor<DurableObjectWebSocketErrorEvent>(
		'getDurableObjectWebSocketErrorEvent()',
		isDurableObjectWebSocketErrorEvent
	)
