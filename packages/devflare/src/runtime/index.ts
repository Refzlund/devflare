// =============================================================================
// Runtime Module — Public Exports
// =============================================================================
// This module is safe to import in worker code and is the preferred runtime
// entry for request-scoped helpers such as env/ctx/event/locals.
//
// It intentionally excludes CLI, Miniflare orchestration, build/deploy, and
// other Node-side tooling exports.
// =============================================================================

// Request-scoped runtime proxies
export {
	env,
	ctx,
	event,
	locals
} from './exports'
export {
	setLocalSendEmailBindings,
	clearLocalSendEmailBindings
} from '../utils/send-email'

export type { EventContext } from './context'

// Context management
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
	createDurableObjectWebSocketErrorEvent,
	runWithContext,
	runWithEventContext,
	getContext,
	getContextOrNull,
	getEventContext,
	getEventContextOrNull,
	getFetchEvent,
	getQueueEvent,
	getScheduledEvent,
	getEmailEvent,
	getTailEvent,
	getDurableObjectEvent,
	getDurableObjectFetchEvent,
	getDurableObjectAlarmEvent,
	getDurableObjectWebSocketMessageEvent,
	getDurableObjectWebSocketCloseEvent,
	getDurableObjectWebSocketErrorEvent,
	hasContext,
	ContextUnavailableError,
	type RuntimeEventType,
	type RuntimeContextValue,
	type RequestContext
} from './context'

export type {
	FetchEvent,
	QueueEvent,
	ScheduledEvent,
	EmailEvent,
	TailEvent,
	DurableObjectEvent,
	DurableObjectFetchEvent,
	DurableObjectAlarmEvent,
	DurableObjectWebSocketMessageEvent,
	DurableObjectWebSocketCloseEvent,
	DurableObjectWebSocketErrorEvent,
	WorkerEvent,
	AnyEvent
} from './context'

// Validation utilities (safe for workers)
export { createContextProxy, ContextAccessError } from './validation'

// Middleware system (safe for workers)
export {
	sequence,
	handle,
	resolve,
	pipe,
	resolveFetchHandler,
	invokeFetchHandler,
	createResolveFetch,
	invokeFetchModule,
	type Middleware,
	type Handler,
	type Awaitable,
	type ResolveFetch,
	type FetchMiddleware
} from './middleware'

export {
	matchFetchRoute,
	invokeRouteModules,
	createRouteResolve
} from './router'

export type {
	RouteSegment,
	RouteModuleDefinition,
	RouteMatchResult
} from '../router/types'

// Decorators (safe for workers)
export {
	durableObject,
	getDurableObjectOptions,
	type DurableObjectOptions
} from '../decorators'
