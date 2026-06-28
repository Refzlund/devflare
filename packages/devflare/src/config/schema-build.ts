import type { OutputOptions, RolldownOptions } from 'rolldown'
import { z } from 'zod'

export type DevflareRolldownOutputOptions = Omit<
	OutputOptions,
	'codeSplitting' | 'dir' | 'file' | 'format' | 'inlineDynamicImports'
>

export interface DevflareRolldownOptions
	extends Omit<RolldownOptions, 'cwd' | 'input' | 'output' | 'platform' | 'watch'> {
	output?: DevflareRolldownOutputOptions
}

export const rolldownOptionsSchema = z.custom<DevflareRolldownOptions>(
	(value) => {
		return typeof value === 'object' && value !== null && !Array.isArray(value)
	},
	{
		message: 'Expected Rolldown options object'
	}
)

/**
 * Rolldown configuration for Durable Object bundling.
 * Controls Devflare's Rolldown-based DO bundler in local development.
 */
export const rolldownConfigSchema = z
	.object({
		/**
		 * Bundle target environment.
		 * @example 'es2022'
		 */
		target: z.string().optional(),
		/** Enable minification for emitted DO bundles */
		minify: z.boolean().optional(),
		/** Generate source maps for emitted DO bundles */
		sourcemap: z.boolean().optional(),
		/**
		 * Additional raw Rolldown options.
		 * @see https://rolldown.rs/
		 */
		options: rolldownOptionsSchema.optional()
	})
	.optional()

/**
 * Vite-related configuration namespace.
 * This keeps Vite-specific configuration distinct from Rolldown/DO bundling.
 *
 * Note: raw Vite build/server configuration still belongs in `vite.config.*`.
 * Devflare currently models `plugins` here and leaves room for future Vite-side
 * config without overloading the root config shape.
 */
export const viteConfigSchema = z
	.object({
		/**
		 * Devflare-level Vite plugin metadata sourced from devflare.config.ts.
		 * Raw Vite plugin wiring still belongs in `vite.config.*`.
		 */
		plugins: z.array(z.unknown()).optional()
	})
	.catchall(z.unknown())
	.optional()

export type RolldownConfig = z.output<typeof rolldownConfigSchema>
export type ViteConfig = z.output<typeof viteConfigSchema>
