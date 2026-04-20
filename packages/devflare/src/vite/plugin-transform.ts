// =============================================================================
// Devflare Vite Plugin — Transform hook
// =============================================================================
// Pure helper extracted from devflarePlugin().transform(). Decides which
// devflare-side source-level rewrites apply to a given module: worker
// entrypoint instrumentation and (optional) Durable Object class transforms.
// =============================================================================

interface TransformResult {
	code: string
	map?: any
}

export interface RunDevflareTransformOptions {
	doTransforms: boolean
}

/**
 * Apply devflare's source-level transforms to a single module.
 *
 * Skips:
 * - anything under `node_modules`
 * - non-`.ts`/`.tsx`/`.js` files
 *
 * Order:
 * 1. `worker.ts` / `worker.js` entrypoints get the worker-entrypoint
 *    instrumentation when `shouldTransformWorker` accepts them.
 * 2. Otherwise, when `doTransforms` is enabled and the source mentions
 *    `DurableObject` (import or `@durableObject` decorator), the Durable
 *    Object class transform runs.
 *
 * Returns `null` when no transform applies, mirroring Vite's transform-hook
 * contract.
 */
export async function runDevflareTransform(
	code: string,
	id: string,
	options: RunDevflareTransformOptions
): Promise<TransformResult | null> {
	if (id.includes('node_modules')) return null

	if (!id.endsWith('.ts') && !id.endsWith('.tsx') && !id.endsWith('.js')) {
		return null
	}

	if (id.endsWith('worker.ts') || id.endsWith('worker.js')) {
		const {
			shouldTransformWorker,
			transformWorkerEntrypoint
		} = await import('../transform/worker-entrypoint')

		if (shouldTransformWorker(code, id)) {
			const result = transformWorkerEntrypoint(code, id)
			if (result) {
				return {
					code: result.code,
					map: result.map
				}
			}
		}
	}

	if (options.doTransforms) {
		if (code.includes('DurableObject') || code.includes('@durableObject')) {
			const { transformDurableObject } = await import('../transform/durable-object')
			return transformDurableObject(code, id)
		}
	}

	return null
}
