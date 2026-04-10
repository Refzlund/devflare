// =============================================================================
// Middleware System — Composable request handling
// =============================================================================
// Supports both:
// - legacy zero-arg handler composition via handle()/sequence()(handler)
// - SvelteKit-style fetch middleware via sequence(m1, m2) and resolve(event)
// =============================================================================

import { runWithEventContext, type FetchEvent } from './context'

type AnyFunction = (...args: any[]) => any
type FetchModule = Record<string, unknown>

const FETCH_SEQUENCE_SYMBOL = Symbol.for('devflare.fetch-sequence')
const FETCH_INVOCATION_MODE_SYMBOL = Symbol.for('devflare.fetch-invocation-mode')

type FetchInvocationMode = 'legacy' | 'resolve'

/**
 * Promise-or-value helper used by worker-safe runtime APIs.
 */
export type Awaitable<T> = T | Promise<T>

/**
 * A legacy zero-arg handler that returns a Response.
 * Can return null to indicate "pass through" to the next handler.
 */
export type Handler = () => Awaitable<Response | null>

/**
 * Legacy middleware function that wraps a zero-arg handler.
 *
 * This remains supported for backwards compatibility.
 */
export type Middleware = (next: () => Promise<Response>) => Awaitable<Response>

/**
 * Resolve the next request-wide middleware or module-local leaf handler.
 *
 * Passing a new event mirrors SvelteKit's `resolve(event)` pattern and lets
 * middleware continue the chain with a modified request context.
 */
export type ResolveFetch<TEvent extends FetchEvent = FetchEvent> = (event?: TEvent) => Promise<Response>

/**
 * SvelteKit-style fetch middleware.
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

function markFetchInvocationMode<T extends AnyFunction>(
	handler: T,
	mode: FetchInvocationMode
): T {
	Object.defineProperty(handler, FETCH_INVOCATION_MODE_SYMBOL, {
		value: mode,
		enumerable: false,
		configurable: true,
		writable: false
	})

	return handler
}

function getFetchInvocationMode(handler: AnyFunction): FetchInvocationMode | null {
	return ((handler as unknown as Record<PropertyKey, unknown>)[FETCH_INVOCATION_MODE_SYMBOL] as FetchInvocationMode | undefined) ?? null
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

function getFunctionParameterNames(handler: AnyFunction): string[] {
	const source = handler.toString().trim()
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

function isResolveStyleFunction(handler: AnyFunction): boolean {
	const mode = getFetchInvocationMode(handler)
	if (mode) {
		return mode === 'resolve'
	}

	if ((handler as unknown as Record<PropertyKey, unknown>)[FETCH_SEQUENCE_SYMBOL]) {
		return true
	}

	if (handler.length !== 2) {
		return false
	}

	const parameterNames = getFunctionParameterNames(handler)
	const secondParameter = parameterNames[1]?.trim().toLowerCase() ?? ''
	return secondParameter === 'resolve' || secondParameter.endsWith('resolve')
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
		return markFetchInvocationMode(boundHandler, 'resolve')
	}

	return boundHandler
}

function createLegacySequence(middlewares: Middleware[]): (handler: Handler) => Handler {
	return (handler: Handler): Handler => {
		if (middlewares.length === 0) {
			return async () => {
				const response = await handler()
				return response ?? createNotFoundResponse()
			}
		}

		return async (): Promise<Response> => {
			let index = 0

			const executeMiddleware = async (): Promise<Response> => {
				if (index < middlewares.length) {
					const middleware = middlewares[index++]
					return middleware(executeMiddleware)
				}

				const response = await handler()
				return response ?? createNotFoundResponse()
			}

			return executeMiddleware()
		}
	}
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
 * Composes multiple middlewares.
 *
 * Supported forms:
 * - Legacy: `sequence(m1, m2)(handle(h1, h2))`
 * - Primary fetch entry: `export const fetch = sequence(m1, m2, appFetch)`
 * - SvelteKit-flavoured alias: `export const handle = sequence(m1, m2, appFetch)`
 */
export function sequence(...middlewares: Middleware[]): (handler: Handler) => Handler
export function sequence<TEvent extends FetchEvent = FetchEvent>(
	...middlewares: FetchMiddleware<TEvent>[]
): FetchMiddleware<TEvent>
export function sequence<TEvent extends FetchEvent = FetchEvent>(
	...middlewares: Array<Middleware | FetchMiddleware<TEvent>>
): ((handler: Handler) => Handler) & FetchMiddleware<TEvent> {
	const legacySequence = createLegacySequence(middlewares as Middleware[])
	const fetchSequence = createFetchSequence(middlewares as FetchMiddleware<TEvent>[])

	const composed = (...args: unknown[]) => {
		if (args.length === 1 && isFunction(args[0])) {
			return legacySequence(args[0] as Handler)
		}

		return fetchSequence(
			args[0] as TEvent,
			(args[1] as ResolveFetch<TEvent> | undefined) ?? (async () => createNotFoundResponse())
		)
	}

	Object.defineProperty(composed, FETCH_SEQUENCE_SYMBOL, {
		value: true,
		enumerable: false,
		configurable: false,
		writable: false
	})

	return composed as ((handler: Handler) => Handler) & FetchMiddleware<TEvent>
}

/**
 * Chains multiple handlers, trying each until one returns a Response.
 */
export function handle(...handlers: Handler[]): Handler {
	return async (): Promise<Response | null> => {
		for (const handler of handlers) {
			const response = await handler()
			if (response !== null) {
				return response
			}
		}

		return null
	}
}

/**
 * Backwards-compatible alias for handle().
 *
 * @deprecated Use handle() instead.
 */
export function resolve(...handlers: Handler[]): Handler {
	return handle(...handlers)
}

/**
 * Creates a handler that applies legacy middleware before running handle().
 */
export function pipe(
	middlewares: Middleware[],
	handlers: Handler[]
): Handler {
	return createLegacySequence(middlewares)(handle(...handlers))
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

	if (handler.length >= 4) {
		return handler(event, event.env, event.ctx, event.params)
	}

	if (handler.length === 3) {
		return handler(event, event.env, event.ctx)
	}

	if (handler.length === 2) {
		return handler(event, event.params)
	}

	if (handler.length === 0) {
		return handler()
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
 * Invoke a fetch entry handler with the correct calling convention.
 *
 * This supports:
 * - `fetch(event)`
 * - `fetch(event, resolve)` / `handle(event, resolve)`
 * - legacy `fetch(request, env, ctx)`
 * - legacy zero-arg handlers that rely on AsyncLocalStorage
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

	if (handler.length >= 4) {
		const response = await handler(event, event.env, event.ctx, event.params)
		return response ?? createNotFoundResponse()
	}

	if (handler.length === 3) {
		const response = await handler(event, event.env, event.ctx)
		return response ?? createNotFoundResponse()
	}

	if (handler.length === 2) {
		const response = await handler(event, event.env)
		return response ?? createNotFoundResponse()
	}

	if (handler.length === 0) {
		const response = await handler()
		return response ?? createNotFoundResponse()
	}

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
 * `fetch` export, legacy default exports, and compatibility fallbacks like
 * method exports such as `GET()`.
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
