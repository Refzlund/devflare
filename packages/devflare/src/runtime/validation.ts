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

	constructor(contextName: string, propertyName: string) {
		super(
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
export function createContextProxy<T extends object>(
	getter: () => T | undefined,
	name: string
): T {
	return new Proxy({} as T, {
		get(_target, prop) {
			const ctx = getter()
			if (ctx === undefined) {
				throw new ContextAccessError(name, String(prop))
			}
			return ctx[prop as keyof T]
		},

		set(_target, prop, value) {
			const ctx = getter()
			if (ctx === undefined) {
				throw new ContextAccessError(name, String(prop))
			}
			; (ctx as Record<string | symbol, unknown>)[prop] = value
			return true
		},

		has(_target, prop) {
			const ctx = getter()
			if (ctx === undefined) {
				return false
			}
			return prop in ctx
		},

		ownKeys(_target) {
			const ctx = getter()
			if (ctx === undefined) {
				return []
			}
			return Reflect.ownKeys(ctx)
		},

		getOwnPropertyDescriptor(_target, prop) {
			const ctx = getter()
			if (ctx === undefined) {
				return undefined
			}
			return Reflect.getOwnPropertyDescriptor(ctx, prop)
		}
	})
}
