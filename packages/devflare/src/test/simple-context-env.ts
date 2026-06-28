// =============================================================================
// Test Context — Handler wiring + env-accessor proxies
// =============================================================================
// Pure helpers extracted from createTestContext(). These wire up the per-
// surface handler helpers (queue / scheduled / worker fetch / tail / email)
// and build the `env` proxies returned to user code.
// =============================================================================

import type { BindingHints } from '../bridge/proxy'
import { configureEmail } from './email'
import { configureQueue } from './queue'
import { configureScheduled } from './scheduled'
import type { ResolvedHandlerPaths } from './simple-context-handlers'
import { configureTail } from './tail'
import { configureWorker } from './worker'

interface TestStateView {
	envProxy: Record<string, unknown> | null
	remoteBindings: Record<string, unknown> | null
	miniflareBindings: Record<string, unknown> | null
}

/**
 * Wire up every per-surface handler helper (queue / scheduled / worker /
 * tail / email) with the same `configDir` + `getEnv` accessor.
 */
export function configureSurfaceHandlers(input: {
	handlerPaths: ResolvedHandlerPaths
	configDir: string
	activePort: number
	getEnv: () => Record<string, unknown>
}): void {
	const { handlerPaths, configDir, activePort, getEnv } = input

	configureQueue({
		handlerPath: handlerPaths.queue,
		configDir,
		getEnv
	})
	configureScheduled({
		handlerPath: handlerPaths.scheduled,
		configDir,
		getEnv
	})
	configureWorker({
		handlerPath: handlerPaths.fetch,
		routes:
			handlerPaths.routes?.routes.map((route) => ({
				filePath: route.filePath,
				routePath: route.routePath,
				segments: route.segments
			})) ?? [],
		configDir,
		getEnv
	})
	configureTail({
		handlerPath: handlerPaths.tail,
		configDir,
		getEnv
	})
	configureEmail({
		port: activePort,
		handlerPath: handlerPaths.email,
		configDir,
		getEnv
	})
}

/**
 * Build the bridge-backed env accessor used by single-worker test contexts.
 *
 * Resolution order, given a property access:
 * 1. Remote bindings (AI/Vectorize/vars/sendEmail) registered up-front.
 * 2. For non-DO/non-service hints: Miniflare binding (raw KV/D1/R2/etc).
 * 3. Bridge env proxy (for everything else, including DOs and services).
 * 4. Final fallback: Miniflare binding (when the hint preferred bridge but
 *    the proxy did not surface it).
 */
export function createBridgeEnvAccessor(
	state: TestStateView,
	hints: BindingHints,
	shouldPreferBridgeBinding: (hint: BindingHints[string] | undefined) => boolean
): Record<string, unknown> {
	return new Proxy(
		{},
		{
			get(_, prop: string) {
				const hint = hints[prop]
				const prefersBridgeBinding = shouldPreferBridgeBinding(hint)

				if (state.remoteBindings && prop in state.remoteBindings) {
					return state.remoteBindings[prop]
				}
				if (!prefersBridgeBinding && state.miniflareBindings && prop in state.miniflareBindings) {
					return state.miniflareBindings[prop]
				}
				if (state.envProxy) {
					return state.envProxy[prop]
				}
				if (prefersBridgeBinding && state.miniflareBindings && prop in state.miniflareBindings) {
					return state.miniflareBindings[prop]
				}
				return undefined
			},
			has(_, prop: string) {
				return Boolean(
					(state.remoteBindings && prop in state.remoteBindings) ||
						(state.miniflareBindings && prop in state.miniflareBindings) ||
						state.envProxy !== null
				)
			}
		}
	) as Record<string, unknown>
}

/**
 * Build the simpler env accessor used by multi-worker test contexts (no
 * bridge-backed proxy: services + DOs go through Miniflare's own bindings).
 */
export function createMultiWorkerEnvAccessor(state: TestStateView): Record<string, unknown> {
	return new Proxy(
		{},
		{
			get(_, prop: string) {
				if (state.remoteBindings && prop in state.remoteBindings) {
					return state.remoteBindings[prop]
				}
				if (state.miniflareBindings && prop in state.miniflareBindings) {
					return state.miniflareBindings[prop]
				}
				return undefined
			},
			has(_, prop: string) {
				return Boolean(
					(state.remoteBindings && prop in state.remoteBindings) ||
						(state.miniflareBindings && prop in state.miniflareBindings)
				)
			}
		}
	) as Record<string, unknown>
}
