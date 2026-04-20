// =============================================================================
// Dev Server — startup-time helpers
// =============================================================================
// Pure helpers extracted from createDevServer().start(). All inputs are
// explicit so these can be unit-tested without spinning up Miniflare.
// =============================================================================

import type { ConsolaInstance } from 'consola'
import type { RouteDiscoveryResult } from '../worker-entry/routes'
import type { WorkerSurfacePaths } from './worker-surface-paths'
import type { checkRemoteBindingRequirements } from '../cli/wrangler-auth'

type RemoteBindingCheck = Awaited<ReturnType<typeof checkRemoteBindingRequirements>>

/**
 * Emit informational/warning lines about detected worker handlers in
 * worker-only (no-Vite) mode.
 */
export function logWorkerHandlerDetection(
	logger: ConsolaInstance | undefined,
	enableVite: boolean,
	hasSurface: boolean,
	mainWorkerSurfacePaths: WorkerSurfacePaths,
	mainWorkerRoutes: RouteDiscoveryResult | null
): void {
	if (enableVite) return

	if (hasSurface) {
		const detectedWorkerHandlers = Object.entries(mainWorkerSurfacePaths)
			.filter(([, surfacePath]) => !!surfacePath)
			.map(([surfaceName, surfacePath]) => `${surfaceName}=${surfacePath}`)
		const detectedRouteHandlers = mainWorkerRoutes?.routes.map(
			(route) => `route=${route.filePath}`
		) ?? []
		logger?.info(
			`Worker handlers detected: ${[...detectedWorkerHandlers, ...detectedRouteHandlers].join(', ')}`
		)
	} else {
		logger?.warn('No local worker handler entry was found for worker-only mode')
	}
}

/**
 * Emit warnings about remote-only bindings (AI, Vectorize) and any missing
 * prerequisites (accountId, wrangler login).
 */
export function logRemoteBindingRequirements(
	logger: ConsolaInstance | undefined,
	remoteCheck: RemoteBindingCheck
): void {
	if (!remoteCheck.hasRemoteBindings) return

	logger?.info('')
	logger?.warn('⚠️  Remote-only bindings detected:')
	for (const binding of remoteCheck.remoteBindings) {
		logger?.warn(`   • ${binding}`)
	}
	logger?.info('')

	if (remoteCheck.missingAccountId) {
		logger?.warn('⚠️  WARN: accountId is not set in devflare.config.ts')
		logger?.warn('   Remote bindings (AI, Vectorize) require accountId to charge the correct account.')
		logger?.warn('   Add: accountId: \'your-cloudflare-account-id\'')
		logger?.info('')
	}

	if (remoteCheck.notLoggedIn) {
		logger?.warn('⚠️  WARN: Not logged in to Wrangler')
		logger?.warn('   Remote bindings require authentication.')
		logger?.warn('   Run: bunx wrangler login')
		logger?.info('')
	}

	if (!remoteCheck.missingAccountId && !remoteCheck.notLoggedIn) {
		logger?.success('✓ Remote binding requirements met')
		logger?.info('')
	}
}

export function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
