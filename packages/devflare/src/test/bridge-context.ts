// =============================================================================
// Test Context — Real Miniflare-backed Testing
// =============================================================================
// Creates test contexts using actual Miniflare bindings for integration testing
// =============================================================================

import { loadConfig, type DevflareConfig } from '../config'
import { startMiniflare, startMiniflareFromConfig, stopMiniflare, type MiniflareInstance, type MiniflareOptions } from '../bridge/miniflare'
import { BridgeClient, getClient } from '../bridge/client'
import { setBindingHints, initEnv, type BindingHints } from '../bridge/proxy'
import { runWithContext } from '../runtime/context'
import { wrapEnvSendEmailBindings } from '../utils/send-email'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BridgeTestContextOptions {
	/** Path to devflare.config.ts */
	configPath?: string
	/** Direct config object (alternative to configPath) */
	config?: DevflareConfig
	/** Miniflare options override */
	miniflare?: Partial<MiniflareOptions>
	/** Port for Miniflare (default: 8787) */
	port?: number
	/** Persist data between tests */
	persist?: boolean
	/** Verbose logging */
	verbose?: boolean
}

export interface BridgeTestContext {
	/** The env object with real bindings */
	env: Record<string, unknown>
	/** The Miniflare instance */
	miniflare: MiniflareInstance
	/** Stop the test context */
	stop(): Promise<void>
	/** Reset currently supported test data (KV namespaces today) */
	reset(): Promise<void>
}

// -----------------------------------------------------------------------------
// Global State
// -----------------------------------------------------------------------------

let globalTestContext: BridgeTestContext | null = null

// -----------------------------------------------------------------------------
// Test Context Creation
// -----------------------------------------------------------------------------

/**
 * Create a test context with real Miniflare bindings
 * 
 * @example
 * ```ts
 * import { createBridgeTestContext } from 'devflare'
 * import { createEnvProxy } from 'devflare'
 *
 * const bridgeEnv = createEnvProxy({ lazy: true })
 * 
 * beforeAll(async () => {
 *   await createBridgeTestContext({ configPath: './devflare.config.ts' })
 * })
 * 
 * afterAll(async () => {
 *   await stopBridgeTestContext()
 * })
 * 
 * test('KV works', async () => {
 *   await bridgeEnv.MY_KV.put('key', 'value')
 *   expect(await bridgeEnv.MY_KV.get('key')).toBe('value')
 * })
 * ```
 */
export async function createBridgeTestContext(
	options: BridgeTestContextOptions = {}
): Promise<BridgeTestContext> {
	// Stop any existing context
	if (globalTestContext) {
		await globalTestContext.stop()
	}

	// Load config if path provided
	let config: DevflareConfig | undefined = options.config
	if (options.configPath && !config) {
		config = await loadConfig({ cwd: options.configPath.replace(/[/\\][^/\\]+$/, ''), configFile: options.configPath.split(/[/\\]/).pop() })
	}

	// Start Miniflare
	let miniflare: MiniflareInstance
	if (config) {
		miniflare = await startMiniflareFromConfig(config, {
			...options.miniflare,
			port: options.port ?? 8787,
			persist: options.persist ?? false,
			verbose: options.verbose ?? false
		})
	} else {
		miniflare = await startMiniflare({
			...options.miniflare,
			port: options.port ?? 8787,
			persist: options.persist ?? false,
			verbose: options.verbose ?? false
		})
	}

	// Get bindings directly from Miniflare
	const bindings = wrapEnvSendEmailBindings(await miniflare.getBindings())

	// Set binding hints based on config
	// bindings.kv is Record<string, string> where key is binding name
	if (config?.bindings) {
		const hints: BindingHints = {}
		if (config.bindings.kv) {
			Object.keys(config.bindings.kv).forEach((name) => { hints[name] = 'kv' })
		}
		if (config.bindings.r2) {
			Object.keys(config.bindings.r2).forEach((name) => { hints[name] = 'r2' })
		}
		if (config.bindings.d1) {
			Object.keys(config.bindings.d1).forEach((name) => { hints[name] = 'd1' })
		}
		if (config.bindings.durableObjects) {
			Object.keys(config.bindings.durableObjects).forEach((name) => { hints[name] = 'do' })
		}
		if (config.bindings.queues?.consumers) {
			config.bindings.queues.consumers.forEach((c) => { hints[c.queue] = 'queue' })
		}
		if (config.bindings.ai) hints[config.bindings.ai.binding] = 'ai'
		if (config.bindings.sendEmail) {
			Object.keys(config.bindings.sendEmail).forEach((name) => { hints[name] = 'sendEmail' })
		}
		setBindingHints(hints)
	}

	// Create the context
	const ctx: BridgeTestContext = {
		env: bindings,
		miniflare,

		async stop() {
			await miniflare.dispose()
			globalTestContext = null
		},

		async reset() {
			// Clear all KV namespaces
			for (const [name, binding] of Object.entries(bindings)) {
				if (isKVNamespace(binding)) {
					const kv = binding as KVNamespace
					const { keys } = await kv.list()
					for (const key of keys) {
						await kv.delete(key.name)
					}
				}
			}
			// Note: R2, D1, and DO reset logic is not implemented here yet.
		}
	}

	globalTestContext = ctx
	return ctx
}

/**
 * Stop the global test context
 */
export async function stopBridgeTestContext(): Promise<void> {
	if (globalTestContext) {
		await globalTestContext.stop()
	}
}

/**
 * Get the current test context (throws if not initialized)
 */
export function getBridgeTestContext(): BridgeTestContext {
	if (!globalTestContext) {
		throw new Error(
			'Bridge test context not initialized. Call createBridgeTestContext() in beforeAll().'
		)
	}
	return globalTestContext
}

// -----------------------------------------------------------------------------
// Convenience Export for Direct Binding Access
// -----------------------------------------------------------------------------

/**
 * Direct access to Miniflare bindings in tests
 * 
 * @example
 * ```ts
 * import { testEnv } from 'devflare/test'
 * 
 * test('KV works', async () => {
 *   const kv = testEnv.MY_KV as KVNamespace
 *   await kv.put('key', 'value')
 * })
 * ```
 */
export const testEnv: Record<string, unknown> = new Proxy({}, {
	get(target, prop: string | symbol) {
		if (typeof prop !== 'string') return undefined
		const ctx = getBridgeTestContext()
		return ctx.env[prop]
	}
})

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function isKVNamespace(binding: unknown): boolean {
	return (
		typeof binding === 'object' &&
		binding !== null &&
		'get' in binding &&
		'put' in binding &&
		'delete' in binding &&
		'list' in binding
	)
}

// -----------------------------------------------------------------------------
// Re-export for Convenience
// -----------------------------------------------------------------------------

export { runWithContext }
