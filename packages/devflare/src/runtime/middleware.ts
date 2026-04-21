// =============================================================================
// Middleware System — Composable request handling
// =============================================================================

import { runWithEventContext, type FetchEvent } from './context'

type AnyFunction = (...args: any[]) => any
type FetchModule = Record<string, unknown>

const FETCH_SEQUENCE_SYMBOL = Symbol.for('devflare.fetch-sequence')
const FETCH_RESOLVE_STYLE_SYMBOL = Symbol.for('devflare.fetch-resolve-style')

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
export type ResolveFetch<TEvent extends FetchEvent = FetchEvent> = (event?: TEvent) => Promise<Response>

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
 * Explicit escape hatch for declaring a handler's calling convention.
 *
 * - `options.style === 'resolve'` marks the handler so
 *   `isResolveStyleFunction` will recognise it regardless of minification.
 * - `options.style === 'worker'` (or omitted) returns the handler as-is;
 *   worker-style detection falls back to arity (`>= 2`).
 */
export function defineFetchHandler<T extends AnyFunction>(
	handler: T,
	options?: { style?: 'resolve' | 'worker' }
): T {
	if (options?.style === 'resolve') {
		return markResolveStyle(handler)
	}

	return handler
}

/**
 * Detect resolve-style `(event, resolve) => Response` handlers.
 *
 * Checks the symbol markers attached by `markResolveStyle` / `sequence()`
 * first (fully minification-safe). Falls back to a best-effort parameter
 * name inspection for inline handlers that were not wrapped — this
 * fallback is fragile under aggressive minification.
 *
 * When the parameter-name path decides the result, a one-time-per-source
 * `console.warn` is emitted. Setting the environment variable
 * `DEVFLARE_STRICT_MIDDLEWARE=1` upgrades that warn into a thrown error so
 * production builds can catch unmarked handlers in CI.
 */
function isResolveStyleFunction(handler: AnyFunction): boolean {
	const record = handler as unknown as Record<PropertyKey, unknown>
	if (record[FETCH_RESOLVE_STYLE_SYMBOL] || record[FETCH_SEQUENCE_SYMBOL]) {
		return true
	}

	if (handler.length !== 2) {
		return false
	}

	const parameterNames = getFunctionParameterNames(handler)
	const secondParameter = parameterNames[1]?.trim().toLowerCase() ?? ''
	const matched = secondParameter === 'resolve' || secondParameter.endsWith('resolve')

	if (matched) {
		notifyParameterSniff(handler, 'resolve')
	}

	return matched
}

function normalizeParameterName(parameterName: string | undefined): string {
	return parameterName?.trim().toLowerCase() ?? ''
}

/**
 * Detect method handlers written as `(event, params) => Response`.
 *
 * Best-effort only — `params`-style handlers are positional and rely on
 * parameter-name inspection. Authors shipping minified builds should prefer
 * 1-arg `(event) => event.params` access instead. When the parameter-name
 * match decides the result, a one-time-per-source `console.warn` is emitted
 * (or thrown under `DEVFLARE_STRICT_MIDDLEWARE=1`).
 */
function isParamsStyleFunction(handler: AnyFunction): boolean {
	if (handler.length !== 2) {
		return false
	}

	const parameterNames = getFunctionParameterNames(handler)
	const secondParameter = normalizeParameterName(parameterNames[1])
	const matched = secondParameter === 'params' || secondParameter.endsWith('params')

	if (matched) {
		notifyParameterSniff(handler, 'params')
	}

	return matched
}

function splitParameterList(source: string): string[] {
	const parameters: string[] = []
	let current = ''
	let depth = 0

	for (const char of source) {
		if (char === ',' && depth === 0) {
			if (current.trim()) {
				parameters.push(current.trim())
			}
			current = ''
			continue
		}

		if (char === '(' || char === '[' || char === '{' || char === '<') {
			depth += 1
		} else if (char === ')' || char === ']' || char === '}' || char === '>') {
			depth = Math.max(0, depth - 1)
		}

		current += char
	}

	if (current.trim()) {
		parameters.push(current.trim())
	}

	return parameters
}

const toStringWarnedOnce = new Set<string>()

/**
 * Reset the once-per-process warning tracker. Test-only hook.
 */
export function __resetToStringFallbackWarnings(): void {
	toStringWarnedOnce.clear()
}

function isStrictMiddlewareEnabled(): boolean {
	try {
		return typeof process !== 'undefined' && process.env?.DEVFLARE_STRICT_MIDDLEWARE === '1'
	} catch {
		return false
	}
}

function formatParamSniffMessage(kind: 'resolve' | 'params'): string {
	if (kind === 'params') {
		return (
			'[devflare] Detected a 2-argument method handler via parameter-name inspection (params-style). '
			+ 'This fallback is fragile under minification. Prefer the 1-arg signature '
			+ '`(event) => event.params` for minification-safe builds.'
		)
	}
	return (
		'[devflare] Detected a 2-argument fetch handler via parameter-name inspection (resolve-style). '
		+ 'This fallback is fragile under minification. Wrap resolve-style handlers with '
		+ "`defineFetchHandler(fn, { style: 'resolve' })` or `sequence(...)` to make detection minification-safe."
	)
}

function notifyParameterSniff(handler: AnyFunction, kind: 'resolve' | 'params'): void {
	let source: string
	try {
		source = handler.toString()
	} catch {
		source = `[unstringifiable ${kind}]`
	}

	const dedupKey = `${kind}\u0000${source}`
	const message = formatParamSniffMessage(kind)

	if (isStrictMiddlewareEnabled()) {
		throw new Error(`${message} Set DEVFLARE_STRICT_MIDDLEWARE=0 to downgrade this error to a warning.`)
	}

	if (!toStringWarnedOnce.has(dedupKey)) {
		toStringWarnedOnce.add(dedupKey)
		console.warn(message)
	}
}

function getFunctionParameterNames(handler: AnyFunction): string[] {
	let source: string
	try {
		source = handler.toString().trim()
	} catch (err) {
		// Minifiers, bound functions, or Proxy wrappers can throw on toString().
		// Default to worker-style detection (safer for minified handlers).
		console.debug('[devflare middleware] Function.prototype.toString() threw; defaulting to worker-style:', err)
		return []
	}

	const parenthesizedMatch = source.match(/^[^(]*\(([^)]*)\)/)
	if (parenthesizedMatch) {
		return splitParameterList(parenthesizedMatch[1])
	}

	const singleParameterArrowMatch = source.match(/^(?:async\s+)?([^=()\s]+)\s*=>/)
	if (singleParameterArrowMatch) {
		return [singleParameterArrowMatch[1].trim()]
	}

	return []
}

/**
 * Detect Cloudflare Worker-style `fetch(request, env, ctx)` handlers.
 *
 * Returns true when:
 * - arity is `>= 3` (unambiguous worker signature), or
 * - arity is `2` AND the handler is not marked resolve-style AND its
 *   second parameter name does not look like `resolve` or `params`.
 *
 * Name inspection is a best-effort fallback; for minified builds prefer
 * `defineFetchHandler(fn, { style: 'resolve' })` on resolve-style handlers.
 */
function isWorkerStyleFetchFunction(handler: AnyFunction): boolean {
	if (isResolveStyleFunction(handler)) {
		return false
	}

	if (handler.length >= 3) {
		return true
	}

	if (handler.length === 2) {
		return !isParamsStyleFunction(handler)
	}

	return false
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
	return isResolveStyleFunction(value)
		? markResolveStyle(boundHandler)
		: boundHandler
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
		`Ambiguous fetch entry module. Export exactly one primary fetch entry per module. `
		+ `Use either "fetch" or "handle" (or one default equivalent), not both. `
		+ `Found: ${foundEntries}`
	)
}

interface MethodResolution {
	handler: AnyFunction
	stripBody: boolean
}

function resolveMethodHandler(module: FetchModule, method: string): MethodResolution | null {
	const normalizedMethod = method.toUpperCase()
	const directHandler = (isFunction(module[normalizedMethod])
		? module[normalizedMethod]
		: bindMethod(module.default, normalizedMethod)) as AnyFunction | null

	if (directHandler) {
		return {
			handler: directHandler,
			stripBody: false
		}
	}

	if (normalizedMethod === 'HEAD') {
		const getHandler = (isFunction(module.GET)
			? module.GET
			: bindMethod(module.default, 'GET')) as AnyFunction | null

		if (getHandler) {
			return {
				handler: getHandler,
				stripBody: true
			}
		}
	}

	const allHandler = (isFunction(module.ALL)
		? module.ALL
		: bindMethod(module.default, 'ALL')) as AnyFunction | null

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

	if (isParamsStyleFunction(handler)) {
		return handler(event, (event as { params?: unknown }).params ?? {})
	}

	if (isWorkerStyleFetchFunction(handler)) {
		return invokeWorkerStyleFetchFunction(handler, event)
	}

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

	const response = await (isWorkerStyleFetchFunction(handler)
		? invokeWorkerStyleFetchFunction(handler, event)
		: handler(event))
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
