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
	vars,
	ctx,
	event,
	locals
} from './exports'

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
	resolveFetchHandler,
	invokeFetchHandler,
	createResolveFetch,
	invokeFetchModule,
	defineFetchHandler,
	defineQueueHandler,
	defineScheduledHandler,
	markResolveStyle,
	markWorkerStyle,
	assertExplicitQueueHandlerStyle,
	assertExplicitScheduledHandlerStyle,
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
} from './router/types'

// Decorators (safe for workers)
export {
	durableObject,
	getDurableObjectOptions,
	type DurableObjectOptions
} from '../decorators'

// Local sendEmail bindings (worker-safe: pure in-worker state; no Node imports)
// Kept on the runtime barrel because the generated composed worker imports them
// here and the runtime entry is the reliable resolution path inside bundled workers.
export {
	setLocalSendEmailBindings,
	clearLocalSendEmailBindings,
	type LocalSendEmailBindingConfig
} from '../utils/send-email'
