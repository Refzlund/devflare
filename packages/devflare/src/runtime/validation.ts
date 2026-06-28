// =============================================================================
// Validation Proxy — Type-safe runtime validation for context access
// =============================================================================
// Creates proxies that provide helpful error messages when accessed outside
// of an active Devflare-managed handler trail, preventing cryptic
// "cannot read property of undefined"
// =============================================================================

/**
 * Error thrown when accessing context properties outside an active handler trail
 */
export class ContextAccessError extends Error {
	public readonly contextName: string
	public readonly propertyName: string

	constructor(contextName: string, propertyName: string, message?: string) {
		super(
			message ??
			`Cannot access ${contextName}.${propertyName} outside of an active Devflare handler trail.\n\n` +
			`This typically happens when:\n` +
			`  1. Accessing ${contextName} at module top-level (during import)\n` +
			`  2. Accessing ${contextName} in a callback that runs after the handler ends\n` +
			`  3. Accessing ${contextName} in a setTimeout/setInterval callback\n\n` +
			`Move the access inside your handler function or middleware.`
		)
		this.name = 'ContextAccessError'
		this.contextName = contextName
		this.propertyName = propertyName
	}

	/**
	 * Builds a `ContextAccessError` for the "no active handler trail" failure mode
	 * (no AsyncLocalStorage store), with guidance toward the most common causes.
	 * Pass `message` to override the default `nodejs_compat`-mentioning guidance.
	 */
	static contextUnavailable(message?: string): ContextAccessError {
		return new ContextAccessError(
			'context',
			'<unavailable>',
			message ??
			`Context not available. Devflare uses AsyncLocalStorage to carry the active event through fetch, queue, scheduled, email, tail, and Durable Object handler call chains.\n\n` +
			`This usually means one of:\n\n` +
			`1. Accessing context at module top-level (runs at cold start, not per-request)\n` +
			`2. Accessing context in setTimeout/setInterval callbacks\n` +
			`3. Missing 'nodejs_compat' compatibility flag in your worker config\n\n` +
			`Fix: Move the access inside your handler, middleware, or a helper called from that handler trail.\n` +
			`Learn more: https://devflare.dev/docs/context-errors`
		)
	}
}

/**
 * Creates a proxy that validates context is available before access
 *
 * @param getter - Function that returns the actual context object (or undefined if unavailable)
 * @param name - Name of the context (for error messages)
 * @returns Proxy that throws ContextAccessError when accessed outside context
 *
 * @example
 * ```ts
 * import { getContextOrNull } from './context'
 *
 * export const env = createContextProxy(
 *   () => getContextOrNull()?.env,
 *   'env'
 * )
 *
 * // In handler: works fine
 * export default {
 *   fetch(request, env) {
 *     console.log(env.DB) // ✅ Works
 *   }
 * }
 *
 * // At top level: throws helpful error
 * const db = env.DB // ❌ ContextAccessError with guidance
 * ```
 */
export interface CreateContextProxyOptions {
	/**
	 * When `false`, the proxy throws a `TypeError` on `set` / `deleteProperty`
	 * (read-only semantics) and reports descriptors as non-writable. Defaults
	 * to `true` (mutable; mutations forwarded to the underlying object).
	 */
	mutable?: boolean
}

export function createContextProxy<T extends object>(
	getter: () => T | null | undefined,
	name: string,
	options: CreateContextProxyOptions = {}
): T {
	const mutable = options.mutable ?? true
	return new Proxy({} as T, {
		get(_target, prop) {
			const ctx = getter()
			if (ctx === undefined || ctx === null) {
				throw new ContextAccessError(name, String(prop))
			}
			return ctx[prop as keyof T]
		},

		set(_target, prop, value) {
			if (!mutable) {
				throw new TypeError(
					`Cannot assign to '${String(prop)}' on '${name}' because it is read-only.\n` +
					`Use 'locals' for mutable request-scoped data.`
				)
			}
			const ctx = getter()
			if (ctx === undefined || ctx === null) {
				throw new ContextAccessError(name, String(prop))
			}
			; (ctx as Record<string | symbol, unknown>)[prop] = value
			return true
		},

		deleteProperty(_target, prop) {
			if (!mutable) {
				throw new TypeError(
					`Cannot delete property '${String(prop)}' from '${name}' because it is read-only.`
				)
			}
			const ctx = getter()
			if (ctx === undefined || ctx === null) {
				return true
			}
			return Reflect.deleteProperty(ctx, prop)
		},

		has(_target, prop) {
			const ctx = getter()
			if (ctx === undefined || ctx === null) {
				return false
			}
			return prop in ctx
		},

		ownKeys(_target) {
			const ctx = getter()
			if (ctx === undefined || ctx === null) {
				return []
			}
			return Reflect.ownKeys(ctx)
		},

		getOwnPropertyDescriptor(_target, prop) {
			const ctx = getter()
			if (ctx === undefined || ctx === null) {
				return undefined
			}
			const descriptor = Reflect.getOwnPropertyDescriptor(ctx, prop)
			if (!descriptor) {
				return undefined
			}
			if (!mutable) {
				return { ...descriptor, writable: false }
			}
			return descriptor
		}
	})
}
