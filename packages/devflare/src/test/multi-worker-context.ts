// =============================================================================
// Multi-Worker Test Context — For testing RPC between workers
// =============================================================================
// This module provides helpers for testing multi-worker scenarios with
// service bindings and WorkerEntrypoint RPC.
//
// Usage:
//   import { createMultiWorkerContext, type WorkerConfig } from 'devflare/test'
//
//   const ctx = await createMultiWorkerContext({
//     workers: [
//       { name: 'gateway', script: gatewayCode, serviceBindings: { MATH: 'math' } },
//       { name: 'math', script: mathServiceCode }
//     ],
//     primary: 'gateway'
//   })
//
//   const result = await ctx.env.MATH.add(1, 2)
//   await ctx.dispose()
// =============================================================================

import type { Miniflare } from 'miniflare'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Configuration for a worker in a multi-worker test
 */
export interface WorkerConfig {
	/** Worker name (used for service binding references) */
	name: string

	/** Worker script code as string */
	script: string

	/** Whether the script uses ES modules (default: true) */
	modules?: boolean

	/** Compatibility date (default: '2025-01-01') */
	compatibilityDate?: string

	/**
	 * Service bindings to other workers
	 * Key: binding name, Value: worker name or { name, entrypoint }
	 */
	serviceBindings?: Record<string, string | { name: string; entrypoint: string }>
}

/**
 * Options for creating a multi-worker test context
 */
export interface MultiWorkerContextOptions {
	/** Array of worker configurations */
	workers: WorkerConfig[]

	/**
	 * Name of the primary worker (receives HTTP requests)
	 * Defaults to first worker in the array
	 */
	primary?: string
}

/**
 * Result of creating a multi-worker test context
 */
export interface MultiWorkerContext<TEnv = Record<string, unknown>> {
	/** Miniflare instance */
	mf: Miniflare

	/** Environment bindings from the primary worker */
	env: TEnv

	/** Dispatch a fetch request to the primary worker */
	fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>

	/** Dispose of the context (cleanup) */
	dispose: () => Promise<void>
}

// -----------------------------------------------------------------------------
// Main API
// -----------------------------------------------------------------------------

/**
 * @deprecated Use `createTestContext()` instead. It now automatically detects service bindings
 * from `ref()` metadata in your devflare.config.ts and sets up multi-worker Miniflare.
 *
 * Create a multi-worker test context for testing RPC between workers.
 *
 * @example
 * ```ts
 * const gatewayScript = `
 * export default {
 *   async fetch(request, env) {
 *     const sum = await env.MATH.add(1, 2)
 *     return Response.json({ sum })
 *   }
 * }
 * `
 *
 * const mathScript = `
 * import { WorkerEntrypoint } from 'cloudflare:workers'
 * export class MathService extends WorkerEntrypoint {
 *   add(a, b) { return a + b }
 * }
 * `
 *
 * const ctx = await createMultiWorkerContext({
 *   workers: [
 *     { name: 'gateway', script: gatewayScript, serviceBindings: { MATH: { name: 'math', entrypoint: 'MathService' } } },
 *     { name: 'math', script: mathScript }
 *   ],
 *   primary: 'gateway'
 * })
 *
 * // Direct RPC test
 * const sum = await ctx.env.MATH.add(1, 2)
 * expect(sum).toBe(3)
 *
 * // HTTP test (gateway using RPC internally)
 * const response = await ctx.fetch('http://localhost/')
 * const data = await response.json()
 * expect(data.sum).toBe(3)
 *
 * await ctx.dispose()
 * ```
 */
export async function createMultiWorkerContext<TEnv = Record<string, unknown>>(
	options: MultiWorkerContextOptions
): Promise<MultiWorkerContext<TEnv>> {
	const { workers, primary } = options
	const primaryName = primary ?? workers[0]?.name

	if (!primaryName) {
		throw new Error('At least one worker must be configured')
	}

	// Import Miniflare dynamically
	const { Miniflare } = await import('miniflare')

	// Convert our config format to Miniflare's workers array format
	const mfWorkers = workers.map((worker) => {
		const serviceBindings: Record<string, { name: string; entrypoint?: string }> = {}

		if (worker.serviceBindings) {
			for (const [bindingName, target] of Object.entries(worker.serviceBindings)) {
				if (typeof target === 'string') {
					serviceBindings[bindingName] = { name: target }
				} else {
					serviceBindings[bindingName] = target
				}
			}
		}

		return {
			name: worker.name,
			modules: worker.modules ?? true,
			script: worker.script,
			compatibilityDate: worker.compatibilityDate ?? '2025-01-01',
			...(Object.keys(serviceBindings).length > 0 ? { serviceBindings } : {})
		}
	})

	// Create Miniflare with multiple workers
	const mf = new Miniflare({
		workers: mfWorkers
	})

	// Get bindings from the primary worker
	const env = (await mf.getBindings()) as TEnv

	// Create fetch helper - cast to work around Miniflare type differences
	const fetch = async (
		input: string | URL | Request,
		init?: RequestInit
	): Promise<Response> => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const response = await mf.dispatchFetch(input as any, init as any)
		return response as unknown as Response
	}

	// Create dispose helper
	const dispose = async () => {
		// Small delay to allow cleanup
		await new Promise((r) => setTimeout(r, 50))
		await mf.dispose()
	}

	return {
		mf,
		env,
		fetch,
		dispose
	}
}

/**
 * @deprecated Use `worker.ts` files with exported functions instead. devflare automatically
 * transforms these into WorkerEntrypoint classes during bundling.
 *
 * Helper to create a WorkerEntrypoint class script from exported functions.
 * Use this when you want to test against the transformed version of a worker.ts file.
 *
 * @example
 * ```ts
 * const script = createEntrypointScript('MathService', {
 *   add: '(a, b) { return a + b }',
 *   multiply: '(a, b) { return a * b }'
 * })
 * // Result: import { WorkerEntrypoint } from 'cloudflare:workers'
 * //         export class MathService extends WorkerEntrypoint {
 * //           add(a, b) { return a + b }
 * //           multiply(a, b) { return a * b }
 * //         }
 * ```
 */
export function createEntrypointScript(
	className: string,
	methods: Record<string, string>
): string {
	const methodDefs = Object.entries(methods)
		.map(([name, body]) => `\t${name}${body}`)
		.join('\n\n')

	return `import { WorkerEntrypoint } from 'cloudflare:workers'

export class ${className} extends WorkerEntrypoint {
${methodDefs}
}
`
}
