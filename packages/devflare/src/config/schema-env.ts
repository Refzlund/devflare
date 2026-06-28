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
 */
export const envConfigSchema = z.lazy(() =>
	z.object(rootConfigShape).omit({ accountId: true, wsRoutes: true }).partial().strict()
)

export const envConfigSchemaInner = envConfigSchema

export type DevflareEnvConfig = z.output<typeof envConfigSchemaInner>
