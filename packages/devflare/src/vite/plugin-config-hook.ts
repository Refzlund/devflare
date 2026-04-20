// =============================================================================
// Vite plugin — `config()` hook helpers
// =============================================================================
// Pure helpers used by the devflare Vite plugin's `config(config, { command })`
// hook to derive the additional Vite settings to merge in:
// - `define` injection for `__DEVFLARE_WORKER_NAME__`
// - `server.proxy` entries for WebSocket routes (DO connections)
// =============================================================================

import { loadConfig } from '../config/loader'
import type { DevflareConfig } from '../config/schema'

/**
 * Try to load the devflare config without throwing. Returns `null` if the
 * config does not exist (the plugin still works without one).
 */
export async function tryLoadDevflareConfig(
	cwd: string,
	configPath: string | undefined,
	command: 'serve' | 'build'
): Promise<DevflareConfig | null> {
	try {
		return await loadConfig({ cwd, configFile: configPath })
	} catch (error) {
		if (command === 'build') {
			console.warn('[devflare] Could not load config:', error)
		}
		return null
	}
}

/**
 * Build the `define` map injecting `__DEVFLARE_WORKER_NAME__` as a build-time
 * constant. Caller is responsible for merging this into any existing `define`.
 */
export function buildWorkerNameDefine(
	lfConfig: DevflareConfig,
	existing: Record<string, unknown>
): Record<string, unknown> {
	const workerNameValue = lfConfig.name ?? 'unknown'
	return {
		...existing,
		'__DEVFLARE_WORKER_NAME__': JSON.stringify(workerNameValue)
	}
}

/**
 * Build the `server.proxy` config that forwards WebSocket upgrades to the
 * Miniflare bridge. Returns `null` when no patterns are configured.
 */
export function buildWebSocketProxyConfig(
	lfConfig: DevflareConfig,
	bridgePort: number,
	wsProxyPatterns: string[]
): Record<string, unknown> | null {
	const patterns: string[] = [...wsProxyPatterns]

	if (lfConfig.wsRoutes && lfConfig.wsRoutes.length > 0) {
		for (const route of lfConfig.wsRoutes) {
			if (!patterns.includes(route.pattern)) {
				patterns.push(route.pattern)
			}
		}
	}

	if (patterns.length === 0) return null

	const proxyConfig: Record<string, unknown> = {}

	for (const pattern of patterns) {
		proxyConfig[pattern] = {
			target: `http://127.0.0.1:${bridgePort}`,
			changeOrigin: true,
			ws: true,
			configure: (proxy: unknown) => {
				; (proxy as { on: (event: string, handler: (err: Error) => void) => void })
					.on('error', (err: Error) => {
						console.error(`[devflare] Proxy error: ${err.message}`)
					})
			}
		}
	}

	if (Object.keys(proxyConfig).length === 0) return null

	console.log(`[devflare] WebSocket proxy configured for: ${patterns.join(', ')}`)
	return proxyConfig
}

/**
 * Build the additional Vite config returned by the plugin's `config()` hook.
 * Loads the devflare config, derives `define` and (in dev under
 * `DEVFLARE_DEV`) `server.proxy`. Returns `undefined` when there is nothing
 * to merge.
 */
export async function buildPluginConfigHookResult(
	cwd: string,
	options: {
		configPath: string | undefined
		bridgePort: number | undefined
		wsProxyPatterns: string[]
	},
	command: 'serve' | 'build',
	existingDefine: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> {
	const lfConfig = await tryLoadDevflareConfig(cwd, options.configPath, command)

	const returnConfig: Record<string, unknown> = {}

	if (lfConfig) {
		returnConfig.define = buildWorkerNameDefine(lfConfig, existingDefine)
	}

	if (command === 'serve' && process.env.DEVFLARE_DEV && lfConfig) {
		const port = options.bridgePort ?? 8787
		const proxyConfig = buildWebSocketProxyConfig(lfConfig, port, options.wsProxyPatterns)
		if (proxyConfig) {
			returnConfig.server = { proxy: proxyConfig }
		}
	}

	return Object.keys(returnConfig).length > 0 ? returnConfig : undefined
}
