import { wrapEnvSendEmailBindings } from '../utils/send-email'
import type {
	DurableObjectAlarmEvent,
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
	RuntimeContextValue,
	RuntimeEventType,
	ScheduledEvent,
	TailEvent
} from './context-types'

function createLocals<TLocals extends Record<string, unknown>>(locals?: TLocals): TLocals {
	return (locals ?? ({} as TLocals)) as TLocals
}

/**
 * Builds the shared scaffold used by every event builder: a wrapped runtime env
 * (with SendEmail bindings proxied) plus a locals bag. Every event type layers
 * its specific fields on top of this shell.
 */
function prepareEventShell<
	TEnv,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	env: TEnv,
	options: { locals?: TLocals } = {}
): { env: TEnv; locals: TLocals } {
	return {
		env: wrapEnvSendEmailBindings(env),
		locals: createLocals(options.locals)
	}
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
	const shell = prepareEventShell(env, { locals: options.locals })

	return {
		type,
		ctx,
		...shell,
		request: options.request ?? null,
		params: options.params
	}
}

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
	const shell = prepareEventShell(env, { locals: options.locals })

	return createAugmentedTarget(request, {
		type: 'fetch' as const,
		ctx,
		...shell,
		url: new URL(request.url),
		request,
		params: (options.params ?? {}) as TParams
	}) as FetchEvent<TEnv, TParams, TLocals>
}

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
	const shell = prepareEventShell(env, { locals: options.locals })

	return createAugmentedTarget(batch, {
		type: 'queue' as const,
		ctx,
		...shell,
		batch
	}) as QueueEvent<TMessage, TEnv, TLocals>
}

export function createScheduledEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	controller: ScheduledController,
	env: TEnv,
	ctx: ExecutionContext,
	options: EventInitOptions<TLocals> = {}
): ScheduledEvent<TEnv, TLocals> {
	const shell = prepareEventShell(env, { locals: options.locals })

	return createAugmentedTarget(controller, {
		type: 'scheduled' as const,
		ctx,
		...shell,
		controller
	}) as ScheduledEvent<TEnv, TLocals>
}

export function createEmailEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	message: ForwardableEmailMessage,
	env: TEnv,
	ctx: ExecutionContext,
	options: EventInitOptions<TLocals> = {}
): EmailEvent<TEnv, TLocals> {
	const shell = prepareEventShell(env, { locals: options.locals })

	return createAugmentedTarget(message, {
		type: 'email' as const,
		ctx,
		...shell,
		message
	}) as EmailEvent<TEnv, TLocals>
}

export function createTailEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	events: TraceItem[],
	env: TEnv,
	ctx: ExecutionContext,
	options: EventInitOptions<TLocals> = {}
): TailEvent<TEnv, TLocals> {
	const shell = prepareEventShell(env, { locals: options.locals })

	return createAugmentedTarget(events, {
		type: 'tail' as const,
		ctx,
		...shell,
		events
	}) as TailEvent<TEnv, TLocals>
}

export function createDurableObjectFetchEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	request: Request,
	env: TEnv,
	state: DurableObjectState,
	options: EventInitOptions<TLocals> = {}
): DurableObjectFetchEvent<TEnv, TLocals> {
	const shell = prepareEventShell(env, { locals: options.locals })

	return createAugmentedTarget(request, {
		type: 'durable-object-fetch' as const,
		ctx: state,
		state,
		...shell,
		request
	}) as DurableObjectFetchEvent<TEnv, TLocals>
}

export function createDurableObjectAlarmEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	env: TEnv,
	state: DurableObjectState,
	options: EventInitOptions<TLocals> = {}
): DurableObjectAlarmEvent<TEnv, TLocals> {
	const shell = prepareEventShell(env, { locals: options.locals })

	return {
		type: 'durable-object-alarm',
		ctx: state,
		state,
		...shell
	} as DurableObjectAlarmEvent<TEnv, TLocals>
}

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
	const shell = prepareEventShell(env, { locals: options.locals })

	return createAugmentedTarget(ws, {
		type: 'durable-object-websocket-message' as const,
		ctx: state,
		state,
		...shell,
		ws,
		message
	}) as DurableObjectWebSocketMessageEvent<TEnv, TLocals>
}

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
	const shell = prepareEventShell(env, { locals: options.locals })

	return createAugmentedTarget(ws, {
		type: 'durable-object-websocket-close' as const,
		ctx: state,
		state,
		...shell,
		ws,
		code,
		reason,
		wasClean
	}) as DurableObjectWebSocketCloseEvent<TEnv, TLocals>
}

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
	const shell = prepareEventShell(env, { locals: options.locals })

	return createAugmentedTarget(ws, {
		type: 'durable-object-websocket-error' as const,
		ctx: state,
		state,
		...shell,
		ws,
		error
	}) as DurableObjectWebSocketErrorEvent<TEnv, TLocals>
}

export function createDefaultEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
>(
	env: TEnv,
	ctx: RuntimeContextValue,
	request: Request | null,
	type: RuntimeEventType,
	locals: TLocals
): EventContext<TEnv, TLocals> {
	switch (type) {
		case 'fetch': {
			if (request && ctx) {
				return createFetchEvent(request, env, ctx as ExecutionContext, { locals })
			}
			return createBaseEvent(type, env, ctx, { locals, request })
		}
		case 'durable-object-fetch': {
			if (request && ctx) {
				return createDurableObjectFetchEvent(request, env, ctx as DurableObjectState, { locals })
			}
			return createBaseEvent(type, env, ctx, { locals, request })
		}
		case 'durable-object-alarm': {
			if (ctx) {
				return createDurableObjectAlarmEvent(env, ctx as DurableObjectState, { locals })
			}
			return createBaseEvent(type, env, ctx, { locals })
		}
		case 'queue':
		case 'scheduled':
		case 'email':
		case 'tail':
		case 'durable-object-websocket-message':
		case 'durable-object-websocket-close':
		case 'durable-object-websocket-error':
			// These kinds require a specific payload (batch/controller/message/events/ws)
			// that isn't available here — fall back to the minimal base shell.
			return createBaseEvent(type, env, ctx, { locals, request })
		default: {
			const exhaustive: never = type
			throw new Error(`createDefaultEvent: unknown event type ${String(exhaustive)}`)
		}
	}
}
