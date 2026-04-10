// =============================================================================
// Runtime Context — ASL-based context management
// =============================================================================

import { AsyncLocalStorage } from 'node:async_hooks'
import { wrapEnvSendEmailBindings } from '../utils/send-email'

/**
 * All event surfaces that Devflare exposes through AsyncLocalStorage.
 */
export type RuntimeEventType =
	| 'fetch'
	| 'scheduled'
	| 'queue'
	| 'email'
	| 'tail'
	| 'durable-object-fetch'
	| 'durable-object-alarm'
	| 'durable-object-websocket-message'
	| 'durable-object-websocket-close'
	| 'durable-object-websocket-error'

/**
 * Shared base shape for all Devflare event objects.
 */
export interface EventContext<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> {
	readonly type: RuntimeEventType
	readonly env: TEnv
	readonly ctx: RuntimeContextValue
	readonly locals: TLocals
	readonly request?: Request | null
	readonly params?: Record<string, string>
}

/**
 * Execution context shape exposed through `ctx`.
 *
 * Fetch/queue/scheduled/email/tail handlers receive the standard Cloudflare
 * `ExecutionContext`. Durable Object handlers receive `DurableObjectState`.
 */
export type RuntimeContextValue = ExecutionContext | DurableObjectState | null

/**
 * Event-first fetch handler input.
 *
 * This intentionally behaves like both:
 * - a real `Request`
 * - an object with `{ request, env, ctx, params, locals }`
 *
 * That means old `fetch(request, env, ctx)` handlers keep working while new
 * `fetch(event)` / `GET({ request, params })` handlers can destructure the
 * richer event object.
 */
export interface FetchEvent<
	TEnv = unknown,
	TParams extends Record<string, string> = Record<string, string>,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends Request, EventContext<TEnv, TLocals> {
	readonly type: 'fetch'
	readonly request: Request
	readonly ctx: ExecutionContext
	readonly params: TParams
}

/**
 * Event-first queue handler input.
 */
export interface QueueEvent<
	TMessage = unknown,
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends MessageBatch<TMessage>, EventContext<TEnv, TLocals> {
	readonly type: 'queue'
	readonly batch: MessageBatch<TMessage>
	readonly ctx: ExecutionContext
}

/**
 * Event-first scheduled handler input.
 */
export interface ScheduledEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends ScheduledController, EventContext<TEnv, TLocals> {
	readonly type: 'scheduled'
	readonly controller: ScheduledController
	readonly ctx: ExecutionContext
}

/**
 * Event-first email handler input.
 */
export interface EmailEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends ForwardableEmailMessage, EventContext<TEnv, TLocals> {
	readonly type: 'email'
	readonly message: ForwardableEmailMessage
	readonly ctx: ExecutionContext
}

/**
 * Event-first tail handler input.
 */
export interface TailEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends Array<TraceItem>, EventContext<TEnv, TLocals> {
	readonly type: 'tail'
	readonly events: TraceItem[]
	readonly ctx: ExecutionContext
}

/**
 * Shared base shape for Durable Object events.
 */
export interface DurableObjectEventContext<
	TType extends Extract<RuntimeEventType, `durable-object-${string}`>,
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends EventContext<TEnv, TLocals> {
	readonly type: TType
	readonly ctx: DurableObjectState
	readonly state: DurableObjectState
}

/**
 * Event-first Durable Object fetch handler input.
 */
export interface DurableObjectFetchEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends Request, DurableObjectEventContext<'durable-object-fetch', TEnv, TLocals> {
	readonly request: Request
}

/**
 * Event-first Durable Object alarm handler input.
 */
export interface DurableObjectAlarmEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends DurableObjectEventContext<'durable-object-alarm', TEnv, TLocals> { }

/**
 * Event-first Durable Object websocket message handler input.
 */
export interface DurableObjectWebSocketMessageEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends WebSocket, DurableObjectEventContext<'durable-object-websocket-message', TEnv, TLocals> {
	readonly ws: WebSocket
	readonly message: string | ArrayBuffer
}

/**
 * Event-first Durable Object websocket close handler input.
 */
export interface DurableObjectWebSocketCloseEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends WebSocket, DurableObjectEventContext<'durable-object-websocket-close', TEnv, TLocals> {
	readonly ws: WebSocket
	readonly code: number
	readonly reason: string
	readonly wasClean: boolean
}

/**
 * Event-first Durable Object websocket error handler input.
 */
export interface DurableObjectWebSocketErrorEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends WebSocket, DurableObjectEventContext<'durable-object-websocket-error', TEnv, TLocals> {
	readonly ws: WebSocket
	readonly error: unknown
}

/**
 * Union of all Durable Object event surfaces.
 */
export type DurableObjectEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> =
	| DurableObjectFetchEvent<TEnv, TLocals>
	| DurableObjectAlarmEvent<TEnv, TLocals>
	| DurableObjectWebSocketMessageEvent<TEnv, TLocals>
	| DurableObjectWebSocketCloseEvent<TEnv, TLocals>
	| DurableObjectWebSocketErrorEvent<TEnv, TLocals>

/**
 * Union of all non-DO worker surfaces.
 */
export type WorkerEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> =
	| FetchEvent<TEnv, Record<string, string>, TLocals>
	| QueueEvent<unknown, TEnv, TLocals>
	| ScheduledEvent<TEnv, TLocals>
	| EmailEvent<TEnv, TLocals>
	| TailEvent<TEnv, TLocals>

/**
 * Union of all concrete Devflare event objects.
 */
export type AnyEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> = WorkerEvent<TEnv, TLocals> | DurableObjectEvent<TEnv, TLocals>

/**
 * Context shape stored in AsyncLocalStorage
 */
export interface RequestContext<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> {
	env: TEnv
	ctx: RuntimeContextValue
	request: Request | null
	locals: TLocals
	type: RuntimeEventType
	event: EventContext<TEnv, TLocals>
}

/**
 * AsyncLocalStorage instance for context
 */
const storage = new AsyncLocalStorage<RequestContext>()

type EventAccessor<TEvent> = (() => TEvent) & {
	safe: () => TEvent | null
}

interface EventInitOptions<TLocals extends Record<string, unknown> = Record<string, unknown>> {
	locals?: TLocals
}

interface FetchEventInit<
	TParams extends Record<string, string> = Record<string, string>,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends EventInitOptions<TLocals> {
	params?: TParams
}

function createLocals<TLocals extends Record<string, unknown>>(locals?: TLocals): TLocals {
	return (locals ?? ({} as TLocals)) as TLocals
}

function createAugmentedTarget<TTarget extends object, TExtra extends object>(
	target: TTarget,
	extra: TExtra
): TTarget & TExtra {
	return new Proxy(target, {
		get(target, prop) {
			if (prop in extra) {
				return extra[prop as keyof TExtra]
			}

			const value = Reflect.get(target, prop, target)
			return typeof value === 'function' ? value.bind(target) : value
		},

		has(target, prop) {
			return prop in extra || prop in target
		},

		ownKeys(target) {
			return Array.from(new Set([
				...Reflect.ownKeys(target),
				...Reflect.ownKeys(extra)
			]))
		},

		getOwnPropertyDescriptor(target, prop) {
			if (prop in extra) {
				return {
					configurable: true,
					enumerable: true,
					writable: false,
					value: extra[prop as keyof TExtra]
				}
			}

			return Reflect.getOwnPropertyDescriptor(target, prop)
		}
	}) as TTarget & TExtra
}

function createBaseEvent<
	TType extends RuntimeEventType,
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	type: TType,
	env: TEnv,
	ctx: RuntimeContextValue,
	options: {
		locals?: TLocals
		request?: Request | null
		params?: Record<string, string>
	} = {}
): EventContext<TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return {
		type,
		env: runtimeEnv,
		ctx,
		locals,
		request: options.request ?? null,
		params: options.params
	}
}

/**
 * Create a Devflare fetch event object.
 */
export function createFetchEvent<
	TEnv = unknown,
	TParams extends Record<string, string> = Record<string, string>,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	request: Request,
	env: TEnv,
	ctx: ExecutionContext,
	options: FetchEventInit<TParams, TLocals> = {}
): FetchEvent<TEnv, TParams, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return createAugmentedTarget(request, {
		type: 'fetch' as const,
		env: runtimeEnv,
		ctx,
		locals,
		request,
		params: (options.params ?? {}) as TParams
	}) as FetchEvent<TEnv, TParams, TLocals>
}

/**
 * Create a Devflare queue event object.
 */
export function createQueueEvent<
	TMessage = unknown,
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	batch: MessageBatch<TMessage>,
	env: TEnv,
	ctx: ExecutionContext,
	options: EventInitOptions<TLocals> = {}
): QueueEvent<TMessage, TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return createAugmentedTarget(batch, {
		type: 'queue' as const,
		env: runtimeEnv,
		ctx,
		locals,
		batch
	}) as QueueEvent<TMessage, TEnv, TLocals>
}

/**
 * Create a Devflare scheduled event object.
 */
export function createScheduledEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	controller: ScheduledController,
	env: TEnv,
	ctx: ExecutionContext,
	options: EventInitOptions<TLocals> = {}
): ScheduledEvent<TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return createAugmentedTarget(controller, {
		type: 'scheduled' as const,
		env: runtimeEnv,
		ctx,
		locals,
		controller
	}) as ScheduledEvent<TEnv, TLocals>
}

/**
 * Create a Devflare email event object.
 */
export function createEmailEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	message: ForwardableEmailMessage,
	env: TEnv,
	ctx: ExecutionContext,
	options: EventInitOptions<TLocals> = {}
): EmailEvent<TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return createAugmentedTarget(message, {
		type: 'email' as const,
		env: runtimeEnv,
		ctx,
		locals,
		message
	}) as EmailEvent<TEnv, TLocals>
}

/**
 * Create a Devflare tail event object.
 */
export function createTailEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	events: TraceItem[],
	env: TEnv,
	ctx: ExecutionContext,
	options: EventInitOptions<TLocals> = {}
): TailEvent<TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return createAugmentedTarget(events, {
		type: 'tail' as const,
		env: runtimeEnv,
		ctx,
		locals,
		events
	}) as TailEvent<TEnv, TLocals>
}

/**
 * Create a Devflare Durable Object fetch event object.
 */
export function createDurableObjectFetchEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	request: Request,
	env: TEnv,
	state: DurableObjectState,
	options: EventInitOptions<TLocals> = {}
): DurableObjectFetchEvent<TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return createAugmentedTarget(request, {
		type: 'durable-object-fetch' as const,
		env: runtimeEnv,
		ctx: state,
		state,
		locals,
		request
	}) as DurableObjectFetchEvent<TEnv, TLocals>
}

/**
 * Create a Devflare Durable Object alarm event object.
 */
export function createDurableObjectAlarmEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	env: TEnv,
	state: DurableObjectState,
	options: EventInitOptions<TLocals> = {}
): DurableObjectAlarmEvent<TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return {
		type: 'durable-object-alarm',
		env: runtimeEnv,
		ctx: state,
		state,
		locals
	} as DurableObjectAlarmEvent<TEnv, TLocals>
}

/**
 * Create a Devflare Durable Object websocket message event object.
 */
export function createDurableObjectWebSocketMessageEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	ws: WebSocket,
	message: string | ArrayBuffer,
	env: TEnv,
	state: DurableObjectState,
	options: EventInitOptions<TLocals> = {}
): DurableObjectWebSocketMessageEvent<TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return createAugmentedTarget(ws, {
		type: 'durable-object-websocket-message' as const,
		env: runtimeEnv,
		ctx: state,
		state,
		locals,
		ws,
		message
	}) as DurableObjectWebSocketMessageEvent<TEnv, TLocals>
}

/**
 * Create a Devflare Durable Object websocket close event object.
 */
export function createDurableObjectWebSocketCloseEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	ws: WebSocket,
	code: number,
	reason: string,
	wasClean: boolean,
	env: TEnv,
	state: DurableObjectState,
	options: EventInitOptions<TLocals> = {}
): DurableObjectWebSocketCloseEvent<TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return createAugmentedTarget(ws, {
		type: 'durable-object-websocket-close' as const,
		env: runtimeEnv,
		ctx: state,
		state,
		locals,
		ws,
		code,
		reason,
		wasClean
	}) as DurableObjectWebSocketCloseEvent<TEnv, TLocals>
}

/**
 * Create a Devflare Durable Object websocket error event object.
 */
export function createDurableObjectWebSocketErrorEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	ws: WebSocket,
	error: unknown,
	env: TEnv,
	state: DurableObjectState,
	options: EventInitOptions<TLocals> = {}
): DurableObjectWebSocketErrorEvent<TEnv, TLocals> {
	const runtimeEnv = wrapEnvSendEmailBindings(env)
	const locals = createLocals(options.locals)

	return createAugmentedTarget(ws, {
		type: 'durable-object-websocket-error' as const,
		env: runtimeEnv,
		ctx: state,
		state,
		locals,
		ws,
		error
	}) as DurableObjectWebSocketErrorEvent<TEnv, TLocals>
}

function createDefaultEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	env: TEnv,
	ctx: RuntimeContextValue,
	request: Request | null,
	type: RuntimeEventType,
	locals: TLocals
): EventContext<TEnv, TLocals> {
	if (type === 'fetch' && request && ctx) {
		return createFetchEvent(request, env, ctx as ExecutionContext, { locals })
	}

	if (type === 'durable-object-fetch' && request && ctx) {
		return createDurableObjectFetchEvent(request, env, ctx as DurableObjectState, { locals })
	}

	return createBaseEvent(type, env, ctx, {
		locals,
		request
	})
}

/**
 * Advanced: run a function with a compatibility context established.
 *
 * Normal Devflare application code should not need this directly.
 * Generated worker wrappers, dev-server dispatch, router/middleware resolution,
 * and `createTestContext()` helpers already establish context before invoking
 * user handlers.
 *
 * @param env - Worker environment bindings
 * @param ctx - Execution context (null for DO methods)
 * @param request - Request object (null for non-HTTP handlers)
 * @param fn - Function to execute
 * @param type - Handler type
 * @returns Result of function
 */
export function runWithContext<T, TEnv = unknown>(
	env: TEnv,
	ctx: RuntimeContextValue,
	request: Request | null,
	fn: () => T,
	type: RequestContext['type'] = 'fetch'
): T {
	const locals = createLocals<Record<string, unknown>>()
	const event = createDefaultEvent(env, ctx, request, type, locals)

	return runWithEventContext(event as EventContext<TEnv>, fn)
}

/**
 * Advanced: run a function with a fully constructed event object established.
 *
 * Normal Devflare application code should not need this directly.
 * Devflare uses it internally so getters like `getQueueEvent()` and
 * `getEmailEvent()` work automatically inside user handlers.
 */
export function runWithEventContext<
	T,
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	event: EventContext<TEnv, TLocals>,
	fn: () => T
): T {
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

/**
 * Get the current context
 *
 * @throws {ContextUnavailableError} When called outside of a request context
 * @returns Current context
 */
export function getContext<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(): RequestContext<TEnv, TLocals> {
	const context = storage.getStore()
	if (!context) {
		throw new ContextUnavailableError()
	}
	return context as RequestContext<TEnv, TLocals>
}

/**
 * Get the current context, or null if not available
 *
 * @returns Current context or null
 */
export function getContextOrNull<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(): RequestContext<TEnv, TLocals> | null {
	const context = storage.getStore()
	return (context ?? null) as RequestContext<TEnv, TLocals> | null
}

/**
 * Get the current event object.
 */
export function getEventContext<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(): EventContext<TEnv, TLocals> {
	return getContext<TEnv, TLocals>().event
}

/**
 * Get the current event object, or null if not available.
 */
export function getEventContextOrNull<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(): EventContext<TEnv, TLocals> | null {
	return getContextOrNull<TEnv, TLocals>()?.event ?? null
}

/**
 * Check if currently running within a context
 */
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
			throw new ContextUnavailableError()
		}

		if (!matcher(currentEvent)) {
			throw new ContextUnavailableError(
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
	return event.type === 'durable-object-alarm'
}

function isDurableObjectWebSocketMessageEvent(event: EventContext): event is DurableObjectWebSocketMessageEvent {
	return event.type === 'durable-object-websocket-message' && 'ws' in event && 'message' in event
}

function isDurableObjectWebSocketCloseEvent(event: EventContext): event is DurableObjectWebSocketCloseEvent {
	return event.type === 'durable-object-websocket-close' && 'ws' in event && 'code' in event
}

function isDurableObjectWebSocketErrorEvent(event: EventContext): event is DurableObjectWebSocketErrorEvent {
	return event.type === 'durable-object-websocket-error' && 'ws' in event && 'error' in event
}

/**
 * Get the current fetch event.
 */
export const getFetchEvent = createEventAccessor<FetchEvent>('getFetchEvent()', isFetchEvent)

/**
 * Get the current queue event.
 */
export const getQueueEvent = createEventAccessor<QueueEvent>('getQueueEvent()', isQueueEvent)

/**
 * Get the current scheduled event.
 */
export const getScheduledEvent = createEventAccessor<ScheduledEvent>('getScheduledEvent()', isScheduledEvent)

/**
 * Get the current email event.
 */
export const getEmailEvent = createEventAccessor<EmailEvent>('getEmailEvent()', isEmailEvent)

/**
 * Get the current tail event.
 */
export const getTailEvent = createEventAccessor<TailEvent>('getTailEvent()', isTailEvent)

/**
 * Get the current Durable Object event, regardless of surface.
 */
export const getDurableObjectEvent = createEventAccessor<DurableObjectEvent>('getDurableObjectEvent()', isDurableObjectEvent)

/**
 * Get the current Durable Object fetch event.
 */
export const getDurableObjectFetchEvent = createEventAccessor<DurableObjectFetchEvent>('getDurableObjectFetchEvent()', isDurableObjectFetchEvent)

/**
 * Get the current Durable Object alarm event.
 */
export const getDurableObjectAlarmEvent = createEventAccessor<DurableObjectAlarmEvent>('getDurableObjectAlarmEvent()', isDurableObjectAlarmEvent)

/**
 * Get the current Durable Object websocket message event.
 */
export const getDurableObjectWebSocketMessageEvent = createEventAccessor<DurableObjectWebSocketMessageEvent>('getDurableObjectWebSocketMessageEvent()', isDurableObjectWebSocketMessageEvent)

/**
 * Get the current Durable Object websocket close event.
 */
export const getDurableObjectWebSocketCloseEvent = createEventAccessor<DurableObjectWebSocketCloseEvent>('getDurableObjectWebSocketCloseEvent()', isDurableObjectWebSocketCloseEvent)

/**
 * Get the current Durable Object websocket error event.
 */
export const getDurableObjectWebSocketErrorEvent = createEventAccessor<DurableObjectWebSocketErrorEvent>('getDurableObjectWebSocketErrorEvent()', isDurableObjectWebSocketErrorEvent)

/**
 * Error thrown when context is accessed outside of a request handler
 */
export class ContextUnavailableError extends Error {
	readonly code = 'CONTEXT_UNAVAILABLE'

	constructor(message?: string) {
		super(
			message
			?? (
				`Context not available. Devflare uses AsyncLocalStorage to carry the active event through fetch, queue, scheduled, email, tail, and Durable Object handler call chains.\n\n` +
				`This usually means one of:\n\n` +
				`1. Accessing context at module top-level (runs at cold start, not per-request)\n` +
				`2. Accessing context in setTimeout/setInterval callbacks\n` +
				`3. Missing 'nodejs_compat' compatibility flag in your worker config\n\n` +
				`Fix: Move the access inside your handler, middleware, or a helper called from that handler trail.\n` +
				`Learn more: https://devflare.dev/docs/context-errors`
			)
		)
		this.name = 'ContextUnavailableError'
	}
}
