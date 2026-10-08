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

export type { EventContext } from './context'
export {
	ctx,
	env,
	event,
	locals,
	vars
} from './exports'

// Context management

export type {
	AnyEvent,
	DurableObjectAlarmEvent,
	DurableObjectEvent,
	DurableObjectFetchEvent,
	DurableObjectWebSocketCloseEvent,
	DurableObjectWebSocketErrorEvent,
	DurableObjectWebSocketMessageEvent,
	EmailEvent,
	FetchEvent,
	QueueEvent,
	ScheduledEvent,
	TailEvent,
	WorkerEvent
} from './context'
export {
	createDurableObjectAlarmEvent,
	createDurableObjectFetchEvent,
	createDurableObjectWebSocketCloseEvent,
	createDurableObjectWebSocketErrorEvent,
	createDurableObjectWebSocketMessageEvent,
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
	getDurableObjectWebSocketCloseEvent,
	getDurableObjectWebSocketErrorEvent,
	getDurableObjectWebSocketMessageEvent,
	getEmailEvent,
	getEventContext,
	getEventContextOrNull,
	getFetchEvent,
	getQueueEvent,
	getScheduledEvent,
	getTailEvent,
	hasContext,
	type RequestContext,
	type RuntimeContextValue,
	type RuntimeEventType,
	runWithContext,
	runWithEventContext
} from './context'

// Validation utilities (safe for workers)

export { ContextAccessError, createContextProxy } from './validation'

// Middleware system (safe for workers)

export {
	type Awaitable,
	assertExplicit2ArgStyle,
	assertExplicitQueueHandlerStyle,
	assertExplicitScheduledHandlerStyle,
	createResolveFetch,
	defineFetchHandler,
	defineQueueHandler,
	defineScheduledHandler,
	type FetchMiddleware,
	invokeFetchHandler,
	invokeFetchModule,
	markResolveStyle,
	markWorkerStyle,
	type ResolveFetch,
	resolveFetchHandler,
	sequence
} from './middleware'

export {
	createRouteResolve,
	invokeRouteModules,
	matchFetchRoute
} from './router'

export type {
	RouteMatchResult,
	RouteModuleDefinition,
	RouteSegment
} from './router/types'

// Decorators (safe for workers)

export {
	type DurableObjectOptions,
	durableObject,
	getDurableObjectOptions
} from '../decorators'

// Local sendEmail bindings (worker-safe: pure in-worker state; no Node imports)
// Kept on the runtime barrel because the generated composed worker imports them
// here and the runtime entry is the reliable resolution path inside bundled workers.

export {
	clearLocalSendEmailBindings,
	type LocalSendEmailBindingConfig,
	setLocalSendEmailBindings
} from '../utils/send-email'

// Outbound-email delivery seam (worker-safe). The generated composed worker
// installs the HTTP sink so a send inside workerd reaches the dev server's host
// process, which is the only place an SMTP socket can be opened.

export {
	clearEmailDeliverySink,
	createHttpEmailDeliverySink,
	type EmailDelivery,
	type EmailDeliverySink,
	setEmailDeliverySink
} from '../utils/email-delivery'

export {
	type BuiltEmailMessage,
	buildEmailMessage,
	type ComposedEmailMessage,
	EMAIL_MAX_MESSAGE_BYTES,
	type EmailAddressInput,
	type EmailAttachmentSummary,
	type NormalizedEmailMessage
} from '../utils/email-message'

// R2 presigned URLs (worker-safe: WebCrypto + aws4fetch only)

export {
	type PresignedR2Request,
	presignR2Get,
	presignR2Put,
	type R2PresignBaseOptions,
	type R2PresignCredentials,
	type R2PresignGetOptions,
	type R2PresignPutOptions
} from './r2-presign'
