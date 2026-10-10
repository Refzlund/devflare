// =============================================================================
// Build/dev-time fetch handler style validation
// =============================================================================
// An unmarked 2-argument `fetch` export is ambiguous between Cloudflare
// worker-style `(request, env)` and devflare resolve-style `(event, resolve)`.
// At request time `assertExplicit2ArgStyle` already throws, but that means a
// worker deploys and only fails on its first request.
//
// This module moves that failure EARLIER: it imports the fetch surface module
// devflare already resolved (the same module the dev server / build composes)
// and runs the *identical* `assertExplicit2ArgStyle` check on the resolved
// handler — so the same actionable error fires at dev start / build instead of
// at first request.
//
// Zero false positives by construction:
// - It reuses `resolveFetchHandler` (devflare's own resolver) + the same
//   `assertExplicit2ArgStyle` (which inspects devflare's own style markers), so
//   it can only fire for the exact case the runtime check fires for.
// - It is a no-op for 1-arg handlers, 3-arg worker handlers, marked handlers,
//   `sequence(...)` compositions, and `export default { fetch }` worker objects.
// - It never invents a violation from source text: if the module cannot be
//   imported (e.g. a framework build-artifact path, or the user module throws
//   at import for an unrelated reason) it skips silently and the runtime check
//   remains the backstop.
// =============================================================================

import { assertExplicit2ArgStyle, resolveFetchHandler } from '../runtime'
import { looksLikeBuildArtifactPath } from './surface-paths'

/**
 * Validate the resolved fetch surface module's calling-convention style.
 *
 * `fetchSurfacePath` is the absolute, on-disk path devflare resolved for the
 * fetch surface (`WorkerSurfacePaths.fetch`). When it is `null` there is no
 * fetch surface to check.
 *
 * Throws the same `[devflare] Ambiguous 2-argument fetch handler …` error as
 * the request-time check when the export is an unmarked 2-arg handler.
 */
export async function validateFetchHandlerStyle(fetchSurfacePath: string | null): Promise<void> {
	if (!fetchSurfacePath) {
		return
	}

	// Framework build outputs are pre-bundled JS that does not exist at this
	// stage and is not devflare source — never inspect them.
	if (looksLikeBuildArtifactPath(fetchSurfacePath)) {
		return
	}

	let surfaceModule: Record<string, unknown>
	try {
		surfaceModule = (await import(fetchSurfacePath)) as Record<string, unknown>
	} catch {
		// If the module can't be imported here (unrelated import-time error, an
		// extension this loader can't handle, etc.) we do not turn that into a
		// style violation — the runtime check stays as the backstop.
		return
	}

	let handler: ReturnType<typeof resolveFetchHandler>
	try {
		handler = resolveFetchHandler(surfaceModule)
	} catch {
		// `resolveFetchHandler` throws on its own ambiguity (multiple primary
		// entries); that is a separate concern surfaced at request/compose time.
		return
	}

	if (!handler) {
		return
	}

	// Identical check + message as the request-time path — only fires for an
	// unmarked 2-arg handler.
	assertExplicit2ArgStyle(handler)
}
