// =============================================================================
// Middleware System — Composable request handling
// =============================================================================

import { type FetchEvent, runWithEventContext } from './context'

type AnyFunction = (...args: any[]) => any
type FetchModule = Record<string, unknown>

const FETCH_SEQUENCE_SYMBOL = Symbol.for('devflare.fetch-sequence')
const FETCH_RESOLVE_STYLE_SYMBOL = Symbol.for('devflare.fetch-resolve-style')
const FETCH_WORKER_STYLE_SYMBOL = Symbol.for('devflare.fetch-worker-style')
const QUEUE_WORKER_STYLE_SYMBOL = Symbol.for('devflare.queue-worker-style')
const SCHEDULED_WORKER_STYLE_SYMBOL = Symbol.for('devflare.scheduled-worker-style')

/**
 * Promise-or-value helper used by worker-safe runtime APIs.
 */
export type Awaitable<T> = T | Promise<T>

/**
 * Resolve the next request-wide middleware or module-local leaf handler.
 *
 * Passing a new event mirrors SvelteKit's `resolve(event)` pattern and lets
 * middleware continue the chain with a modified request context.
 */
export type ResolveFetch<TEvent extends FetchEvent = FetchEvent> = (
	event?: TEvent
) => Promise<Response>

/**
 * Request-wide fetch middleware.
 *
 * These are intended for the single module-level fetch entry export such as:
 * - `export const fetch = sequence(corsHandle, appFetch)`
 * - `export const handle = sequence(corsHandle, appFetch)`
 *
 * `fetch` and `handle` are aliases for the same primary fetch entry, so a
 * module should export one or the other, not both.
 */
export type FetchMiddleware<TEvent extends FetchEvent = FetchEvent> = (
	event: TEvent,
	resolve: ResolveFetch<TEvent>
) => Awaitable<Response>

interface FetchResolveOptions<TEvent extends FetchEvent> {
	fallbackResolve?: ResolveFetch<TEvent>
}

function createNotFoundResponse(): Response {
	return new Response('Not Found', { status: 404 })
}

function isFunction(value: unknown): value is AnyFunction {
	return typeof value === 'function'
}

/**
 * Tag a handler as resolve-style: `(event, resolve) => Response`.
 *
 * Attaches `FETCH_RESOLVE_STYLE_SYMBOL` so detection survives minification
 * (which rewrites parameter names and function source output).
 */
export function markResolveStyle<T extends AnyFunction>(handler: T): T {
	Object.defineProperty(handler, FETCH_RESOLVE_STYLE_SYMBOL, {
		value: true,
		enumerable: false,
		configurable: true,
		writable: false
	})

	return handler
}

/**
 * Tag a handler as worker-style: `(request, env)` or `(request, env, ctx)`.
 *
 * Required for 2-argument worker-style handlers because devflare can no
 * longer disambiguate `(event, resolve)` vs `(request, env)` from arity
 * alone — the parameter-name fallback was removed in R1-strict.
 */
export function markWorkerStyle<T extends AnyFunction>(handler: T): T {
	Object.defineProperty(handler, FETCH_WORKER_STYLE_SYMBOL, {
		value: true,
		enumerable: false,
		configurable: true,
		writable: false
	})

	return handler
}

/**
 * Explicit escape hatch for declaring a handler's calling convention.
 *
 * - `options.style === 'resolve'` marks the handler so it is dispatched as
 *   `(event, resolve) => Response`.
 * - `options.style === 'worker'` marks the handler so it is dispatched as
 *   `(request, env[, ctx]) => Response`.
 *
 * The marker is required for 2-argument handlers; 1-arg `(event)` and
 * 3-arg `(request, env, ctx)` handlers do not need to be wrapped.
 */
export function defineFetchHandler<T extends AnyFunction>(
	handler: T,
	options?: { style?: 'resolve' | 'worker' }
): T {
	if (options?.style === 'resolve') {
		return markResolveStyle(handler)
	}

	if (options?.style === 'worker') {
		return markWorkerStyle(handler)
	}

	return handler
}

function hasResolveStyleMarker(handler: AnyFunction): boolean {
	const record = handler as unknown as Record<PropertyKey, unknown>
	return Boolean(record[FETCH_RESOLVE_STYLE_SYMBOL] || record[FETCH_SEQUENCE_SYMBOL])
}

function hasWorkerStyleMarker(handler: AnyFunction): boolean {
	const record = handler as unknown as Record<PropertyKey, unknown>
	return Boolean(record[FETCH_WORKER_STYLE_SYMBOL])
}

/**
 * Detect resolve-style `(event, resolve) => Response` handlers.
 *
 * Symbol-based only — the previous parameter-name fallback was removed in
 * R1-strict. Callers that rely on a 2-argument resolve-style handler must
 * wrap it with `markResolveStyle`, `defineFetchHandler({ style: 'resolve' })`,
 * or compose it via `sequence(...)`.
 */
function isResolveStyleFunction(handler: AnyFunction): boolean {
	return hasResolveStyleMarker(handler)
}

/**
 * Throw a clear error for ambiguous unmarked 2-argument fetch handlers.
 *
 * In R1-strict, devflare no longer guesses the calling convention from
 * parameter names. 2-arg handlers must be marked with
 * `defineFetchHandler(fn, { style: 'resolve' | 'worker' })` (or wrapped via
 * `markResolveStyle` / `markWorkerStyle` / `sequence(...)`) so dispatch is
 * unambiguous and minification-safe.
 */
export function assertExplicit2ArgStyle(handler: AnyFunction): void {
	if (handler.length !== 2) {
		return
	}

	if (hasResolveStyleMarker(handler) || hasWorkerStyleMarker(handler)) {
		return
	}

	throw new Error(
		'[devflare] Ambiguous 2-argument fetch handler. The calling convention must be declared explicitly via ' +
			"`defineFetchHandler(fn, { style: 'resolve' })` (for `(event, resolve) => Response`) or " +
			"`defineFetchHandler(fn, { style: 'worker' })` (for `(request, env) => Response`). " +
			'Single-arg `(event) => Response` and 3-arg worker-style `(request, env, ctx) => Response` ' +
			'handlers do not require wrapping.'
	)
}

/**
 * Tag a queue handler as worker-style: `(batch, env)` or `(batch, env, ctx)`.
 *
 * Required for 2-argument worker-style queue handlers because devflare can
 * no longer disambiguate `(event)` vs `(batch, env)` from arity alone in
 * R1-strict.
 */
export function defineQueueHandler<T extends AnyFunction>(handler: T): T {
	Object.defineProperty(handler, QUEUE_WORKER_STYLE_SYMBOL, {
		value: true,
		enumerable: false,
		configurable: true,
		writable: false
	})

	return handler
}

/**
 * Tag a scheduled handler as worker-style: `(controller, env)` or
 * `(controller, env, ctx)`.
 */
export function defineScheduledHandler<T extends AnyFunction>(handler: T): T {
	Object.defineProperty(handler, SCHEDULED_WORKER_STYLE_SYMBOL, {
		value: true,
		enumerable: false,
		configurable: true,
		writable: false
	})

	return handler
}

function hasQueueWorkerStyleMarker(handler: AnyFunction): boolean {
	const record = handler as unknown as Record<PropertyKey, unknown>
	return Boolean(record[QUEUE_WORKER_STYLE_SYMBOL])
}

function hasScheduledWorkerStyleMarker(handler: AnyFunction): boolean {
	const record = handler as unknown as Record<PropertyKey, unknown>
	return Boolean(record[SCHEDULED_WORKER_STYLE_SYMBOL])
}

/**
 * Throw a clear error for ambiguous unmarked 2-argument queue handlers.
 *
 * Mirrors `assertExplicit2ArgStyle` for the queue surface. 2-arg handlers
 * must be wrapped with `defineQueueHandler(fn)` so dispatch is unambiguous
 * and minification-safe; 1-arg `(event)` and 3-arg `(batch, env, ctx)` do
 * not require wrapping.
 */
export function assertExplicitQueueHandlerStyle(handler: AnyFunction): void {
	if (handler.length !== 2) {
		return
	}

	if (hasQueueWorkerStyleMarker(handler)) {
		return
	}

	throw new Error(
		'[devflare] Ambiguous 2-argument queue handler. The calling convention must be declared explicitly via ' +
			'`defineQueueHandler(fn)` for `(batch, env) => void` worker-style handlers. ' +
			'Single-arg `(event) => void` and 3-arg `(batch, env, ctx) => void` handlers do not require wrapping.'
	)
}

/**
 * Throw a clear error for ambiguous unmarked 2-argument scheduled handlers.
 */
export function assertExplicitScheduledHandlerStyle(handler: AnyFunction): void {
	if (handler.length !== 2) {
		return
	}

	if (hasScheduledWorkerStyleMarker(handler)) {
		return
	}

	throw new Error(
		'[devflare] Ambiguous 2-argument scheduled handler. The calling convention must be declared explicitly via ' +
			'`defineScheduledHandler(fn)` for `(controller, env) => void` worker-style handlers. ' +
			'Single-arg `(event) => void` and 3-arg `(controller, env, ctx) => void` handlers do not require wrapping.'
	)
}

/**
 * Detect Cloudflare Worker-style `fetch(request, env[, ctx])` handlers.
 *
 * Returns true when:
 * - arity is `>= 3` (unambiguous worker signature), or
 * - the handler is explicitly marked worker-style via `markWorkerStyle` or
 *   `defineFetchHandler({ style: 'worker' })`.
 *
 * In R1-strict, 2-argument worker-style handlers must be marked — there is
 * no parameter-name fallback. Unmarked 2-arg handlers throw via
 * `assertExplicit2ArgStyle` when invoked.
 */
function isWorkerStyleFetchFunction(handler: AnyFunction): boolean {
	if (isResolveStyleFunction(handler)) {
		return false
	}

	if (handler.length >= 3) {
		return true
	}

	return hasWorkerStyleMarker(handler)
}

function invokeWorkerStyleFetchFunction<TEvent extends FetchEvent>(
	handler: AnyFunction,
	event: TEvent
): Promise<Response | null> | Response | null {
	return handler(event.request, event.env, event.ctx)
}

function bindMethod(target: unknown, key: string): AnyFunction | null {
	if (!target || typeof target !== 'object') {
		return null
	}

	const value = (target as Record<string, unknown>)[key]
	if (!isFunction(value)) {
		return null
	}

	const boundHandler = value.bind(target)
	if (isResolveStyleFunction(value)) {
		markResolveStyle(boundHandler)
	}
	if (hasWorkerStyleMarker(value)) {
		markWorkerStyle(boundHandler)
	}
	return boundHandler
}

function createFetchSequence<TEvent extends FetchEvent>(
	middlewares: FetchMiddleware<TEvent>[]
): FetchMiddleware<TEvent> {
	return async (
		event: TEvent,
		resolve: ResolveFetch<TEvent> = async () => createNotFoundResponse()
	): Promise<Response> => {
		const executeMiddleware = async (index: number, activeEvent: TEvent): Promise<Response> => {
			if (index >= middlewares.length) {
				return resolve(activeEvent)
			}

			const middleware = middlewares[index]
			return middleware(activeEvent, async (nextEvent = activeEvent) => {
				return executeMiddleware(index + 1, nextEvent)
			})
		}

		return executeMiddleware(0, event)
	}
}

/**
 * Compose request-wide middleware into a single fetch surface.
 */
export function sequence<TEvent extends FetchEvent = FetchEvent>(
	...middlewares: FetchMiddleware<TEvent>[]
): FetchMiddleware<TEvent> {
	const composed = createFetchSequence(middlewares)

	Object.defineProperty(composed, FETCH_SEQUENCE_SYMBOL, {
		value: true,
		enumerable: false,
		configurable: false,
		writable: false
	})

	return markResolveStyle(composed)
}

function getDefaultHandleHandler(module: FetchModule): AnyFunction | null {
	return bindMethod(module.default, 'handle')
}

function getDefaultFetchHandler(module: FetchModule): AnyFunction | null {
	const defaultExport = module.default

	if (isFunction(defaultExport)) {
		return defaultExport
	}

	return bindMethod(defaultExport, 'fetch')
}

interface PrimaryFetchEntryCandidate {
	name: string
	handler: AnyFunction
}

function getPrimaryFetchEntryCandidates(module: FetchModule): PrimaryFetchEntryCandidate[] {
	const candidates: PrimaryFetchEntryCandidate[] = []

	const namedHandle = isFunction(module.handle) ? module.handle : null
	if (namedHandle) {
		candidates.push({
			name: 'handle',
			handler: namedHandle
		})
	}

	const namedFetch = isFunction(module.fetch) ? module.fetch : null
	if (namedFetch) {
		candidates.push({
			name: 'fetch',
			handler: namedFetch
		})
	}

	const defaultHandle = getDefaultHandleHandler(module)
	if (defaultHandle) {
		candidates.push({
			name: 'default.handle',
			handler: defaultHandle
		})
	}

	const defaultFetch = getDefaultFetchHandler(module)
	if (defaultFetch) {
		candidates.push({
			name: isFunction(module.default) ? 'default' : 'default.fetch',
			handler: defaultFetch
		})
	}

	return candidates
}

function assertSinglePrimaryFetchEntry(candidates: PrimaryFetchEntryCandidate[]): void {
	if (candidates.length <= 1) {
		return
	}

	const foundEntries = candidates.map(({ name }) => `"${name}"`).join(', ')
	throw new Error(
		`Ambiguous fetch entry module. Export exactly one primary fetch entry per module. ` +
			`Use either "fetch" or "handle" (or one default equivalent), not both. ` +
			`Found: ${foundEntries}`
	)
}

interface MethodResolution {
	handler: AnyFunction
	stripBody: boolean
}

function resolveMethodHandler(module: FetchModule, method: string): MethodResolution | null {
	const normalizedMethod = method.toUpperCase()
	const directHandler = (
		isFunction(module[normalizedMethod])
			? module[normalizedMethod]
			: bindMethod(module.default, normalizedMethod)
	) as AnyFunction | null

	if (directHandler) {
		return {
			handler: directHandler,
			stripBody: false
		}
	}

	if (normalizedMethod === 'HEAD') {
		const getHandler = (
			isFunction(module.GET) ? module.GET : bindMethod(module.default, 'GET')
		) as AnyFunction | null

		if (getHandler) {
			return {
				handler: getHandler,
				stripBody: true
			}
		}
	}

	const allHandler = (
		isFunction(module.ALL) ? module.ALL : bindMethod(module.default, 'ALL')
	) as AnyFunction | null

	if (allHandler) {
		return {
			handler: allHandler,
			stripBody: false
		}
	}

	return null
}

async function invokeResolvedFetchHandler<TEvent extends FetchEvent>(
	handler: AnyFunction,
	event: TEvent
): Promise<Response | null> {
	if (isResolveStyleFunction(handler)) {
		return handler(event, async () => createNotFoundResponse())
	}

	if (isWorkerStyleFetchFunction(handler)) {
		return invokeWorkerStyleFetchFunction(handler, event)
	}

	assertExplicit2ArgStyle(handler)
	return handler(event)
}

/**
 * Resolve the primary fetch surface for a module.
 *
 * `fetch` and `handle` are treated as aliases for the same primary fetch
 * entry. Exporting more than one primary entry from the same module is
 * rejected as ambiguous.
 */
export function resolveFetchHandler(module: FetchModule): AnyFunction | null {
	const candidates = getPrimaryFetchEntryCandidates(module)
	assertSinglePrimaryFetchEntry(candidates)
	return candidates[0]?.handler ?? null
}

/**
 * Invoke a fetch entry handler with the supported calling conventions.
 *
 * This supports:
 * - `fetch(request)`
 * - `fetch(request, env)`
 * - `fetch(request, env, ctx)`
 * - `fetch(event)`
 * - `fetch(event, resolve)` / `handle(event, resolve)`
 */
export async function invokeFetchHandler<TEvent extends FetchEvent>(
	handler: unknown,
	event: TEvent,
	resolve: ResolveFetch<TEvent> = async () => createNotFoundResponse()
): Promise<Response> {
	if (!isFunction(handler)) {
		return resolve(event)
	}

	if (isResolveStyleFunction(handler)) {
		const response = await handler(event, resolve)
		return response ?? createNotFoundResponse()
	}

	if (isWorkerStyleFetchFunction(handler)) {
		const response = await invokeWorkerStyleFetchFunction(handler, event)
		return response ?? createNotFoundResponse()
	}

	assertExplicit2ArgStyle(handler)
	const response = await handler(event)
	return response ?? createNotFoundResponse()
}

/**
 * Create a SvelteKit-style `resolve(event)` callback for a fetch module.
 *
 * Resolution order is:
 * - matching HTTP method export such as `GET()` / `POST()` / `ALL()`
 * - 404 response
 */
export function createResolveFetch<TEvent extends FetchEvent>(
	module: FetchModule,
	_currentEntry: unknown,
	initialEvent: TEvent,
	options: FetchResolveOptions<TEvent> = {}
): ResolveFetch<TEvent> {
	return async (nextEvent = initialEvent): Promise<Response> => {
		return runWithEventContext(nextEvent, async () => {
			const methodResolution = resolveMethodHandler(module, nextEvent.request.method)
			if (methodResolution) {
				const response = await invokeResolvedFetchHandler(methodResolution.handler, nextEvent)
				const finalResponse = response ?? createNotFoundResponse()

				if (methodResolution.stripBody) {
					return new Response(null, finalResponse)
				}

				return finalResponse
			}

			if (options.fallbackResolve) {
				return options.fallbackResolve(nextEvent)
			}

			return createNotFoundResponse()
		})
	}
}

/**
 * Invoke the resolved fetch surface for a module.
 *
 * This lets runtime wrappers support a single request-wide `handle` or
 * `fetch` export, default exports, and same-module method handlers such as
 * `GET()`.
 */
export async function invokeFetchModule<TEvent extends FetchEvent>(
	module: FetchModule,
	event: TEvent,
	fallbackResolve?: ResolveFetch<TEvent>
): Promise<Response> {
	const handler = resolveFetchHandler(module)

	if (!handler) {
		return createResolveFetch(module, null, event, { fallbackResolve })(event)
	}

	return invokeFetchHandler(
		handler,
		event,
		createResolveFetch(module, handler, event, { fallbackResolve })
	)
}
