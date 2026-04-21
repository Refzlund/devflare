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

const TRANSFORMABLE_EXTENSIONS = ['.ts', '.tsx', '.js'] as const

/**
 * Returns `true` when devflare may rewrite the given module. Skips
 * `node_modules` and any file that isn't a `.ts`/`.tsx`/`.js`.
 */
export function isTransformCandidate(id: string): boolean {
	if (id.includes('node_modules')) return false
	return TRANSFORMABLE_EXTENSIONS.some((ext) => id.endsWith(ext))
}

/**
 * Worker-entrypoint instrumentation step.
 *
 * Only handles `worker.ts` / `worker.js` files and only when
 * `shouldTransformWorker` accepts them. Returns `null` when this step does
 * not apply, so the caller can fall through to other transforms.
 */
export async function runWorkerEntryTransform(
	code: string,
	id: string
): Promise<TransformResult | null> {
	if (!id.endsWith('worker.ts') && !id.endsWith('worker.js')) {
		return null
	}

	const {
		shouldTransformWorker,
		transformWorkerEntrypoint
	} = await import('../transform/worker-entrypoint')

	if (!shouldTransformWorker(code, id)) {
		return null
	}

	const result = transformWorkerEntrypoint(code, id)
	if (!result) return null

	return {
		code: result.code,
		map: result.map
	}
}

/**
 * Durable Object class transform step.
 *
 * Only runs when the user opted in via `doTransforms` and the source mentions
 * `DurableObject` or the `@durableObject` decorator. Returns `null` when this
 * step does not apply.
 */
export async function runDurableObjectTransform(
	code: string,
	id: string,
	options: RunDevflareTransformOptions
): Promise<TransformResult | null> {
	if (!options.doTransforms) return null
	if (!code.includes('DurableObject') && !code.includes('@durableObject')) {
		return null
	}

	const { transformDurableObject } = await import('../transform/durable-object')
	return transformDurableObject(code, id)
}

/**
 * Apply devflare's source-level transforms to a single module.
 *
 * Order:
 * 1. Worker-entrypoint instrumentation (`runWorkerEntryTransform`)
 * 2. Durable Object class transform (`runDurableObjectTransform`)
 *
 * Returns `null` when no transform applies, mirroring Vite's transform-hook
 * contract.
 */
export async function runDevflareTransform(
	code: string,
	id: string,
	options: RunDevflareTransformOptions
): Promise<TransformResult | null> {
	if (!isTransformCandidate(id)) return null

	const workerResult = await runWorkerEntryTransform(code, id)
	if (workerResult) return workerResult

	return await runDurableObjectTransform(code, id, options)
}
