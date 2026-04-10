// =============================================================================
// Unified Environment Proxy
// =============================================================================
// Smart proxy that tries request-scoped context first, falls back to bridge
// This allows a single `import { env } from 'devflare'` to work everywhere:
// - Inside request handlers: uses request-scoped context
// - Outside request handlers: uses bridge to Miniflare (dev mode)
// - In tests: uses test context set up by createTestContext()
// =============================================================================

import { getContextOrNull } from './runtime/context'
import { bridgeEnv } from './bridge/proxy'

// DevflareEnv is declared globally by users in their project (env.d.ts)
// This declaration allows TypeScript to pick up the global interface
declare global {
	// Default empty interface - users augment this via env.d.ts
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface DevflareEnv {}
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
