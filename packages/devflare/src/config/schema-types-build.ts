import type { DevflareRolldownOptions } from './schema-build'

/**
 * Rolldown configuration for Devflare's Durable Object bundler.
 */
export interface RolldownConfigInput {
	/**
	 * Bundle target environment.
	 *
	 * @example
	 * ```ts
	 * target: 'es2022'
	 * ```
	 */
	target?: string

	/**
	 * Enable minification for emitted Durable Object bundles.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * minify: true
	 * ```
	 */
	minify?: boolean

	/**
	 * Generate source maps for emitted Durable Object bundles.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * sourcemap: true
	 * ```
	 */
	sourcemap?: boolean

	/**
	 * Additional raw Rolldown options.
	 *
	 * @default Devflare-managed Rolldown options.
	 *
	 * @example
	 * ```ts
	 * options: { external: ['node:fs'] }
	 * ```
	 */
	options?: DevflareRolldownOptions
}

/**
 * Devflare Vite configuration namespace.
 */
export interface ViteConfigInput {
	/**
	 * Devflare-level Vite plugin metadata.
	 *
	 * @default No Devflare plugin metadata.
	 *
	 * @example
	 * ```ts
	 * plugins: []
	 * ```
	 */
	plugins?: unknown[]

	/**
	 * Additional future Devflare Vite options.
	 */
	[key: string]: unknown
}

/**
 * Wrangler passthrough configuration.
 */
export interface WranglerConfigInput {
	/**
	 * Raw Wrangler options that Devflare should pass through without direct
	 * modeling.
	 *
	 * @default No passthrough options.
	 *
	 * @example
	 * ```ts
	 * passthrough: { main: '.svelte-kit/cloudflare/_worker.js' }
	 * ```
	 */
	passthrough?: Record<string, unknown>
}
