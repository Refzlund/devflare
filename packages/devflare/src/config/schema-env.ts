import { z } from 'zod'
import {
	rolldownConfigSchema,
	viteConfigSchema
} from './schema-build'
import { bindingsSchema } from './schema-bindings'
import {
	assetsConfigSchema,
	compatibilityDateSchema,
	filesSchema,
	limitsSchema,
	migrationSchema,
	observabilitySchema,
	previewsConfigSchema,
	routeConfigSchema,
	secretConfigSchema,
	triggersSchema,
	wranglerConfigSchema
} from './schema-runtime'

/**
 * Environment-specific configuration overrides.
 * Allows different settings per deployment environment.
 */
export const envConfigSchema = z.object({
	/** Override worker name for this environment */
	name: z.string().optional(),
	/** Override compatibility date */
	compatibilityDate: compatibilityDateSchema.optional(),
	/** Override compatibility flags */
	compatibilityFlags: z.array(z.string()).optional(),
	/** Override preview behavior */
	previews: previewsConfigSchema,
	/** Override file handlers */
	files: filesSchema,
	/** Override bindings */
	bindings: bindingsSchema,
	/** Override triggers */
	triggers: triggersSchema,
	/** Override environment variables */
	vars: z.record(z.string(), z.string()).optional(),
	/** Override secrets configuration */
	secrets: z.record(z.string(), secretConfigSchema).optional(),
	/** Override routes */
	routes: z.array(routeConfigSchema).optional(),
	/** Override assets configuration */
	assets: assetsConfigSchema,
	/** Override limits */
	limits: limitsSchema,
	/** Override observability settings */
	observability: observabilitySchema,
	/** Override migrations */
	migrations: z.array(migrationSchema).optional(),
	/** Override Rolldown configuration */
	rolldown: rolldownConfigSchema,
	/** Override Vite-related configuration */
	vite: viteConfigSchema,
	/** Override wrangler passthrough */
	wrangler: wranglerConfigSchema
}).partial().strict()

export const envConfigSchemaInner = envConfigSchema

export type DevflareEnvConfig = z.output<typeof envConfigSchemaInner>
