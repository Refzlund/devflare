// =============================================================================
// Unified Environment Proxy
// =============================================================================
// Smart proxy that tries request-scoped context first, then a test context
// installed by createTestContext, then finally the internal bridge proxy.
// This is the public Cloudflare-world portal — a single
// `import { env } from 'devflare'` works everywhere:
// - Inside request handlers: uses request-scoped context
// - In bun:test / Bun scripts: uses createTestContext state when present,
//   otherwise auto-connects through the internal bridge to Miniflare
// - In dev/production workers: resolved via the request context layer
//
// The underlying `bridgeEnv` from ./bridge/proxy is an internal helper and
// should not be imported by user code.
// =============================================================================

import { bridgeEnv } from './bridge/proxy'
import { getContextOrNull } from './runtime/context'

// DevflareEnv is declared globally by users in their project (env.d.ts)
// This declaration allows TypeScript to pick up the global interface
declare global {
	// Default empty interface - users augment this via env.d.ts
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface DevflareEnv {}
	// Default empty interface - users augment this via env.d.ts
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface DevflareVars {}
}

// -----------------------------------------------------------------------------
// Test Context State (set by createTestContext from devflare/test)
// -----------------------------------------------------------------------------

let testContextEnv: Record<string, unknown> | null = null
let testContextDispose: (() => Promise<void>) | null = null

/**
 * Called by createTestContext to set up the unified env
 * @internal
 */
export function __setTestContext(
	envBindings: Record<string, unknown>,
	dispose: () => Promise<void>
): void {
	testContextEnv = envBindings
	testContextDispose = dispose
}

/**
 * Called after dispose to clear the test context
 * @internal
 */
export function __clearTestContext(): void {
	testContextEnv = null
	testContextDispose = null
}

// -----------------------------------------------------------------------------
// Unified Env Proxy
// -----------------------------------------------------------------------------

/**
 * Unified environment bindings proxy
 *
 * Automatically selects the right source:
 * - Request context (if inside a request handler)
 * - Test context (if set up by createTestContext)
 * - Bridge to Miniflare (if outside, in dev mode)
 *
 * Includes `dispose()` method for cleanup in tests.
 *
 * @example
 * ```ts
 * import { env } from 'devflare'
 *
 * // Works in request handlers
 * export default {
 *   async fetch(request) {
 *     const value = await env.MY_KV.get('key')
 *     return new Response(value)
 *   }
 * }
 *
 * // Also works in tests (after createTestContext)
 * beforeAll(() => createTestContext())
 * afterAll(() => env.dispose())
 * test('works', async () => {
 *   const result = await env.MY_BINDING.method()
 * })
 * ```
 */
export const env: DevflareEnv & { dispose(): Promise<void> } = new Proxy(
	{} as DevflareEnv & { dispose(): Promise<void> },
	{
		get(_target, prop: string | symbol) {
			// Handle dispose() method
			if (prop === 'dispose') {
				return async () => {
					if (testContextDispose) {
						await testContextDispose()
						__clearTestContext()
					}
				}
			}

			// Try request-scoped context first
			const ctx = getContextOrNull()
			if (ctx?.env) {
				return (ctx.env as Record<string, unknown>)[prop as string]
			}

			// Try test context next
			if (testContextEnv) {
				return testContextEnv[prop as string]
			}

			// Fall back to bridge env (for standalone usage in dev mode)
			return (bridgeEnv as Record<string, unknown>)[prop as string]
		},

		has(_target, prop: string | symbol) {
			if (prop === 'dispose') return true

			const ctx = getContextOrNull()
			if (ctx?.env) {
				return prop in (ctx.env as object)
			}
			if (testContextEnv) {
				return prop in testContextEnv
			}
			return prop in bridgeEnv
		},

		ownKeys(_target) {
			const ctx = getContextOrNull()
			if (ctx?.env) {
				return Reflect.ownKeys(ctx.env as object)
			}
			if (testContextEnv) {
				return Reflect.ownKeys(testContextEnv)
			}
			return Reflect.ownKeys(bridgeEnv)
		},

		getOwnPropertyDescriptor(_target, prop) {
			if (prop === 'dispose') {
				return { configurable: true, enumerable: false, writable: false }
			}
			const ctx = getContextOrNull()
			const source = ctx?.env ?? testContextEnv ?? bridgeEnv
			return Reflect.getOwnPropertyDescriptor(source as object, prop)
		}
	}
)

/**
 * Unified runtime variables proxy.
 *
 * This reads from the same active environment object as {@link env}, but is
 * typed from config `vars` via generated `env.d.ts` declarations. It is useful
 * for nested typed values authored with `defineConfig({ vars })`.
 */
export const vars: Readonly<DevflareVars> = new Proxy({} as Readonly<DevflareVars>, {
	get(_target, prop: string | symbol) {
		const ctx = getContextOrNull()
		if (ctx?.env) {
			return (ctx.env as Record<string, unknown>)[prop as string]
		}

		if (testContextEnv) {
			return testContextEnv[prop as string]
		}

		return (bridgeEnv as Record<string, unknown>)[prop as string]
	},

	has(_target, prop: string | symbol) {
		const ctx = getContextOrNull()
		if (ctx?.env) {
			return prop in (ctx.env as object)
		}
		if (testContextEnv) {
			return prop in testContextEnv
		}
		return prop in bridgeEnv
	},

	ownKeys(_target) {
		const ctx = getContextOrNull()
		if (ctx?.env) {
			return Reflect.ownKeys(ctx.env as object)
		}
		if (testContextEnv) {
			return Reflect.ownKeys(testContextEnv)
		}
		return Reflect.ownKeys(bridgeEnv)
	},

	getOwnPropertyDescriptor(_target, prop) {
		const ctx = getContextOrNull()
		const source = ctx?.env ?? testContextEnv ?? bridgeEnv
		return Reflect.getOwnPropertyDescriptor(source as object, prop)
	},

	set(_target, prop) {
		throw new TypeError(`Cannot assign to '${String(prop)}' on 'vars' because it is read-only.`)
	},

	deleteProperty(_target, prop) {
		throw new TypeError(
			`Cannot delete property '${String(prop)}' from 'vars' because it is read-only.`
		)
	}
})
