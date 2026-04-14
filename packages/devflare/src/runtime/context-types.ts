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

export type RuntimeContextValue = ExecutionContext | DurableObjectState | null

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

export type FetchEvent<
	TEnv = unknown,
	TParams extends Record<string, string> = Record<string, string>,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> = Omit<Request, 'url'> & EventContext<TEnv, TLocals> & {
	readonly type: 'fetch'
	readonly url: URL
	readonly request: Request
	readonly ctx: ExecutionContext
	readonly params: TParams
}

export interface QueueEvent<
	TMessage = unknown,
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends MessageBatch<TMessage>, EventContext<TEnv, TLocals> {
	readonly type: 'queue'
	readonly batch: MessageBatch<TMessage>
	readonly ctx: ExecutionContext
}

export interface ScheduledEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends ScheduledController, EventContext<TEnv, TLocals> {
	readonly type: 'scheduled'
	readonly controller: ScheduledController
	readonly ctx: ExecutionContext
}

export interface EmailEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends ForwardableEmailMessage, EventContext<TEnv, TLocals> {
	readonly type: 'email'
	readonly message: ForwardableEmailMessage
	readonly ctx: ExecutionContext
}

export interface TailEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends Array<TraceItem>, EventContext<TEnv, TLocals> {
	readonly type: 'tail'
	readonly events: TraceItem[]
	readonly ctx: ExecutionContext
}

export interface DurableObjectEventContext<
	TType extends Extract<RuntimeEventType, `durable-object-${string}`>,
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends EventContext<TEnv, TLocals> {
	readonly type: TType
	readonly ctx: DurableObjectState
	readonly state: DurableObjectState
}

export interface DurableObjectFetchEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends Request, DurableObjectEventContext<'durable-object-fetch', TEnv, TLocals> {
	readonly request: Request
}

export interface DurableObjectAlarmEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends DurableObjectEventContext<'durable-object-alarm', TEnv, TLocals> { }

export interface DurableObjectWebSocketMessageEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends WebSocket, DurableObjectEventContext<'durable-object-websocket-message', TEnv, TLocals> {
	readonly ws: WebSocket
	readonly message: string | ArrayBuffer
}

export interface DurableObjectWebSocketCloseEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends WebSocket, DurableObjectEventContext<'durable-object-websocket-close', TEnv, TLocals> {
	readonly ws: WebSocket
	readonly code: number
	readonly reason: string
	readonly wasClean: boolean
}

export interface DurableObjectWebSocketErrorEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends WebSocket, DurableObjectEventContext<'durable-object-websocket-error', TEnv, TLocals> {
	readonly ws: WebSocket
	readonly error: unknown
}

export type DurableObjectEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> =
	| DurableObjectFetchEvent<TEnv, TLocals>
	| DurableObjectAlarmEvent<TEnv, TLocals>
	| DurableObjectWebSocketMessageEvent<TEnv, TLocals>
	| DurableObjectWebSocketCloseEvent<TEnv, TLocals>
	| DurableObjectWebSocketErrorEvent<TEnv, TLocals>

export type WorkerEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> =
	| FetchEvent<TEnv, Record<string, string>, TLocals>
	| QueueEvent<unknown, TEnv, TLocals>
	| ScheduledEvent<TEnv, TLocals>
	| EmailEvent<TEnv, TLocals>
	| TailEvent<TEnv, TLocals>

export type AnyEvent<
	TEnv = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> = WorkerEvent<TEnv, TLocals> | DurableObjectEvent<TEnv, TLocals>

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

export type EventAccessor<TEvent> = (() => TEvent) & {
	safe: () => TEvent | null
}

export interface EventInitOptions<TLocals extends Record<string, unknown> = Record<string, unknown>> {
	locals?: TLocals
}

export interface FetchEventInit<
	TParams extends Record<string, string> = Record<string, string>,
	TLocals extends Record<string, unknown> = Record<string, unknown>
> extends EventInitOptions<TLocals> {
	params?: TParams
}
