import { z } from 'zod'
import { rootConfigShape } from './schema'

/**
 * Environment-specific configuration overrides.
 *
 * Derived from the root config shape so that any new root field is
 * automatically recognized as an environment override without duplicating
 * the field list here. We simply:
 *
 *   - omit fields that are meaningless inside an environment override
 *     (`accountId`, `wsRoutes`)
 *   - make everything optional via `.partial()` so consumers can override
 *     just the bits they need
 *   - keep `.strict()` so unsupported shorthand (e.g. top-level `plugins`
 *     or `build`) is rejected at the environment level as well
 *
 * The root `compatibilityFlags` field already applies
 * `normalizeCompatibilityFlags` via its transform, so forced flags are
 * injected for environment overrides without extra wiring.
 *
 * Wrapped in `z.lazy(...)` to break the module-init cycle with `schema.ts`
 * (schema.ts references `envConfigSchemaInner` in its `env` field, and this
 * module references `rootConfigShape` from schema.ts).
 *
 * → GOTCHA: root defaults are stripped first. zod 4 applies a `.default()`
 *   even inside `.optional()`, so `.partial()` alone would give every
 *   environment the root's `compatibilityDate` default (today's date), which
 *   then overrides the date the root config actually set.
 */
export const envConfigSchema = z.lazy(() =>
	z
		.object(withoutDefaults(rootConfigShape))
		.omit({ accountId: true, wsRoutes: true })
		.partial()
		.strict()
)

/** A shape with every top-level `.default()` removed, each field keeping the schema it wrapped. */
type WithoutDefaults<Shape extends z.ZodRawShape> = {
	[Key in keyof Shape]: Shape[Key] extends z.ZodDefault<infer Inner> ? Inner : Shape[Key]
}

/**
 * @description Removes the top-level `.default()` of every field in a shape,
 * so a field an environment leaves out stays out rather than being filled in.
 * @param shape - the object shape to copy
 * @returns a new shape; fields without a default are passed through unchanged
 */
function withoutDefaults<Shape extends z.ZodRawShape>(shape: Shape): WithoutDefaults<Shape> {
	return Object.fromEntries(
		Object.entries(shape).map(([key, schema]) => [
			key,
			schema instanceof z.ZodDefault ? schema.unwrap() : schema
		])
	) as WithoutDefaults<Shape>
}

export const envConfigSchemaInner = envConfigSchema

export type DevflareEnvConfig = z.output<typeof envConfigSchemaInner>
