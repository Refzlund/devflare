// =============================================================================
// defineConfig — Type-safe config definition helper
// =============================================================================

import type { InferConfigVars } from './env-vars'
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
export interface TypedConfig<TEntrypoints extends string = string, TVars = Record<string, unknown>>
	extends DevflareConfigInput {
	/** @internal Type marker for entrypoint names - used by ref() for autocomplete */
	readonly __entrypoints?: TEntrypoints
	/** @internal Type marker for config-derived runtime vars. */
	readonly __vars?: TVars
}

/**
 * @description Refuses a function where `defineConfig` expects a config OBJECT. Every function
 *   satisfies `DevflareConfigInput` on its own (its `name` is a string and the rest is optional), so
 *   without this the object overload took every factory: an async factory typed as a config instead
 *   of a Promise, and no factory's body was checked against the schema.
 *   `Symbol.hasInstance` is a member every function has and no config object does, and a symbol key
 *   never shows up among the property completions offered inside the config literal.
 */
interface NotAFunction {
	/** A function's `instanceof` hook; a config object has none. */
	readonly [Symbol.hasInstance]?: never
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
export function defineConfig<
	TEntrypoints extends string = string,
	TConfig extends DevflareConfigInput = DevflareConfigInput
>(
	config: TConfig & DevflareConfigInput & NotAFunction
): TypedConfig<TEntrypoints, InferConfigVars<NonNullable<TConfig['vars']>>>
export function defineConfig<
	TEntrypoints extends string = string,
	TConfig extends DevflareConfigInput = DevflareConfigInput
>(
	config: () => TConfig & DevflareConfigInput
): TypedConfig<TEntrypoints, InferConfigVars<NonNullable<TConfig['vars']>>>
export function defineConfig<
	TEntrypoints extends string = string,
	TConfig extends DevflareConfigInput = DevflareConfigInput
>(
	config: () => Promise<TConfig & DevflareConfigInput>
): Promise<TypedConfig<TEntrypoints, InferConfigVars<NonNullable<TConfig['vars']>>>>
// A value typed as any `DefineConfigInput` (a wrapper passing its own argument on) may be either
// form, so the result may be a Promise.
// → GOTCHA: the object arm carries `NotAFunction` too. Plain `DefineConfigInput` would hand every
//   factory the first overload refused back to its object arm, unchecked.
// → NOTE: with four overloads TypeScript reports only this last one's error, and it elaborates a
//   factory against the FIRST function arm of a union. One arm returning either form is what lets
//   both a sync and an async factory's error reach the field that is wrong.
export function defineConfig<TEntrypoints extends string = string>(
	config:
		| (DevflareConfigInput & NotAFunction)
		| (() => DevflareConfigInput | Promise<DevflareConfigInput>)
): TypedConfig<TEntrypoints, unknown> | Promise<TypedConfig<TEntrypoints, unknown>>
export function defineConfig<
	TEntrypoints extends string = string,
	TConfig extends DevflareConfigInput = DevflareConfigInput
>(
	config:
		| (TConfig & DevflareConfigInput)
		| (() => TConfig & DevflareConfigInput)
		| (() => Promise<TConfig & DevflareConfigInput>)
):
	| TypedConfig<TEntrypoints, InferConfigVars<NonNullable<TConfig['vars']>>>
	| Promise<TypedConfig<TEntrypoints, InferConfigVars<NonNullable<TConfig['vars']>>>> {
	if (typeof config === 'function') {
		const result = config()
		if (result instanceof Promise) {
			return result as Promise<
				TypedConfig<TEntrypoints, InferConfigVars<NonNullable<TConfig['vars']>>>
			>
		}
		return result as TypedConfig<TEntrypoints, InferConfigVars<NonNullable<TConfig['vars']>>>
	}
	return config as TypedConfig<TEntrypoints, InferConfigVars<NonNullable<TConfig['vars']>>>
}
