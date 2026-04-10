// =============================================================================
// defineConfig — Type-safe config definition helper
// =============================================================================

import type { DevflareConfigInput } from './schema'

/**
 * Input type for defineConfig - can be object, function, or async function
 * Uses the Zod input type so optional fields with defaults are truly optional
 */
export type DefineConfigInput =
	| DevflareConfigInput
	| (() => DevflareConfigInput)
	| (() => Promise<DevflareConfigInput>)

/**
 * Configuration with entrypoints type attached for ref() type inference.
 * This is used by ref() to provide autocomplete for entrypoint names.
 */
export interface TypedConfig<TEntrypoints extends string = string> extends DevflareConfigInput {
	/** @internal Type marker for entrypoint names - used by ref() for autocomplete */
	readonly __entrypoints?: TEntrypoints
}

/**
 * Type-safe helper for defining devflare configuration.
 * 
 * @typeParam TEntrypoints - Union of valid entrypoint names (from generated types)
 * 
 * @example
 * // Basic usage (entrypoints default to string)
 * export default defineConfig({
 *   name: 'my-worker'
 * })
 *
 * @example
 * // With generated entrypoints type (after `devflare types`)
 * // env.d.ts exports: type Entrypoints = 'AdminEntrypoint' | 'OtherEntrypoint'
 * export default defineConfig<import('./env').Entrypoints>({
 *   name: 'my-worker',
 *   files: { fetch: 'worker.ts' }
 * })
 *
 * @example
 * // Function config
 * export default defineConfig(() => ({
 *   name: process.env.WORKER_NAME ?? 'my-worker',
 *   compatibilityDate: '2025-01-07'
 * }))
 */
export function defineConfig<TEntrypoints extends string = string>(
	config: DevflareConfigInput
): TypedConfig<TEntrypoints>
export function defineConfig<TEntrypoints extends string = string>(
	config: () => DevflareConfigInput
): TypedConfig<TEntrypoints>
export function defineConfig<TEntrypoints extends string = string>(
	config: () => Promise<DevflareConfigInput>
): Promise<TypedConfig<TEntrypoints>>
export function defineConfig<TEntrypoints extends string = string>(
	config: DevflareConfigInput | (() => DevflareConfigInput) | (() => Promise<DevflareConfigInput>)
): TypedConfig<TEntrypoints> | Promise<TypedConfig<TEntrypoints>> {
	if (typeof config === 'function') {
		const result = config()
		if (result instanceof Promise) {
			return result as Promise<TypedConfig<TEntrypoints>>
		}
		return result as TypedConfig<TEntrypoints>
	}
	return config as TypedConfig<TEntrypoints>
}
