// =============================================================================
// Runtime Exports — Type-safe request-scoped context access
// =============================================================================
// These proxies provide ergonomic access to Cloudflare Worker context
// with helpful error messages when accessed outside AsyncLocalStorage-backed
// handler trails
// =============================================================================

import { type EventContext, type RuntimeContextValue, getContextOrNull } from './context'
import { createContextProxy } from './validation'
// Side-effect import to ensure the canonical `declare global { interface
// DevflareEnv {} }` from `src/env.ts` is loaded so the type used below
// resolves to the same global users augment via their `env.d.ts`.
import '../env'

// =============================================================================
// Readonly Proxy Helper
// =============================================================================

/**
 * Creates a readonly proxy that throws on mutation attempts. Thin wrapper
 * over {@link createContextProxy} with `mutable: false`.
 */
function createReadonlyProxy<T extends object>(
	getter: () => T | null | undefined,
	name: string
): Readonly<T> {
	return createContextProxy(getter, name, { mutable: false }) as Readonly<T>
}

// =============================================================================
// Environment Bindings (env)
// =============================================================================

/**
 * Access environment bindings (KV, D1, R2, etc.) and variables
 *
 * @remarks
 * This is readonly - bindings cannot be reassigned at runtime.
 * Available only within an active Devflare-managed handler or middleware call trail.
 *
 * @example
 * ```ts
 * import { env, type FetchEvent } from 'devflare/runtime'
 *
 * export async function fetch(event: FetchEvent) {
 *   const value = await env.MY_KV.get('key')
 *   const dbResult = await env.DB.prepare('SELECT * FROM users').all()
 *   return new Response(JSON.stringify({
 *     path: event.url.pathname,
 *     value,
 *     dbResult
 *   }))
 * }
 * ```
 *
 * @throws {ContextAccessError} When accessed outside an active Devflare-managed handler trail
 */
export const env: Readonly<DevflareEnv> = createReadonlyProxy(
	() => getContextOrNull()?.env as Record<string, unknown> | undefined,
	'env'
)

// =============================================================================
// Runtime Variables (vars)
// =============================================================================

/**
 * Access typed runtime variables declared with `defineConfig({ vars })`.
 *
 * @remarks
 * This proxy reads from the active Worker environment object, just like
 * {@link env}, but its type is generated from the `vars` config lane. Nested
 * values are preserved, so `vars.mongo.database` works when config declares a
 * nested object.
 *
 * @example
 * ```ts
 * import { vars } from 'devflare/runtime'
 *
 * export async function fetch() {
 *   return Response.json({
 *     database: vars.mongo.database
 *   })
 * }
 * ```
 *
 * @throws {ContextAccessError} When accessed outside an active Devflare-managed handler trail
 */
export const vars: Readonly<DevflareVars> = createReadonlyProxy(
	() => getContextOrNull()?.env as Record<string, unknown> | undefined,
	'vars'
)

// =============================================================================
// Execution Context (ctx)
// =============================================================================

/**
 * Access the ExecutionContext for background tasks
 *
 * @remarks
 * Provides `waitUntil()` for background processing and
 * `passThroughOnException()` for error handling on worker surfaces.
 * When running inside a Durable Object, this proxy exposes the current
 * `DurableObjectState` instead.
 * This is readonly.
 *
 * @example
 * ```ts
 * import { ctx, type FetchEvent } from 'devflare/runtime'
 *
 * export async function fetch(event: FetchEvent) {
 *   const response = new Response('OK')
 *   ctx.waitUntil(analytics.track(event.url.pathname))
 *   return response
 * }
 * ```
 *
 * @throws {ContextAccessError} When accessed outside an active Devflare-managed handler trail
 */
export const ctx: Readonly<RuntimeContextValue> = createReadonlyProxy(
	() => getContextOrNull()?.ctx as RuntimeContextValue | undefined,
	'ctx'
)

// =============================================================================
// Event Context (event)
// =============================================================================

/**
 * Access the current event object.
 *
 * @remarks
 * This is the generic event proxy for the active AsyncLocalStorage context.
 *
 * For strong per-surface typing, prefer `getFetchEvent()`, `getQueueEvent()`,
 * `getScheduledEvent()`, `getEmailEvent()`, and the Durable Object getters
 * from `devflare/runtime`.
 *
 * @example
 * ```ts
 * import { event as runtimeEvent, type FetchEvent, type ScheduledEvent } from 'devflare/runtime'
 *
 * export async function fetch(event: FetchEvent) {
 *   console.log(runtimeEvent.type)
 *   console.log(event.url.pathname)
 * }
 *
 * export async function scheduled(event: ScheduledEvent) {
 *   console.log(runtimeEvent.type)
 *   console.log(event.cron)
 * }
 * ```
 *
 * @throws {ContextAccessError} When accessed outside an active Devflare-managed handler trail
 */
export const event: Readonly<EventContext> = createReadonlyProxy(
	() => getContextOrNull()?.event,
	'event'
)

// =============================================================================
// Request-Scoped Locals (locals)
// =============================================================================

/**
 * Mutable request-scoped storage for sharing data between middleware
 *
 * @remarks
 * Unlike `env` and `ctx`, locals can be mutated. Each request gets
 * a fresh locals object. Use this for:
 * - Authentication state
 * - Parsed request data
 * - Computed values shared across middleware
 *
 * @example
 * ```ts
 * import { locals, type FetchEvent } from 'devflare/runtime'
 *
 * // In auth middleware
 * const authMiddleware = async (event: FetchEvent, next: () => Promise<Response>) => {
 *   locals.user = await validateToken(event.request?.headers.get('Authorization'))
 *   return next()
 * }
 *
 * // In handler
 * export async function fetch(event: FetchEvent) {
 *   void event
 *   console.log(locals.user)
 * }
 * ```
 *
 * @throws {ContextAccessError} When accessed outside an active Devflare-managed handler trail
 */
export const locals: Record<string, unknown> = createContextProxy(
	() => getContextOrNull()?.locals,
	'locals'
)
