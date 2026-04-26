// =============================================================================
// Config Schema — Zod schema for devflare.config.ts validation
// =============================================================================
//
// This module assembles the complete schema for devflare configuration files.
// Leaf schema modules live beside it so the public API stays stable without
// keeping every schema, transform, and utility in one giant file.
//
// DEFAULTS (you don't need to specify these):
// - compatibilityDate: Defaults to current date (YYYY-MM-DD)
// - compatibilityFlags: Always includes ['nodejs_compat', 'nodejs_als']
//
// =============================================================================

import { z } from 'zod'
import { normalizeCompatibilityFlags } from './compatibility'
import {
	rolldownConfigSchema,
	viteConfigSchema
} from './schema-build'
import { bindingsSchema } from './schema-bindings'
import { envConfigSchemaInner } from './schema-env'
import {
	assetsConfigSchema,
	compatibilityDateSchema,
	containersConfigSchema,
	filesSchema,
	limitsSchema,
	migrationSchema,
	moduleRulesSchema,
	observabilitySchema,
	placementSchema,
	previewsConfigSchema,
	routeConfigSchema,
	secretConfigSchema,
	tailConsumerSchema,
	triggersSchema,
	wranglerConfigSchema,
	wsRouteConfigSchema
} from './schema-runtime'

/** Helper to get current date in YYYY-MM-DD format */
function getCurrentDate(): string {
	const now = new Date()
	return now.toISOString().split('T')[0]
}

/**
 * Raw Zod shape of the root devflare configuration (excluding the `env` field,
 * which references back into this shape via the environment override schema).
 *
 * Exported so `schema-env.ts` can derive the environment override schema from
 * the single source of truth without hand-listing every field.
 */
export const rootConfigShape = {
	/**
	 * Worker name (required).
	 * Used as the deployment target and in URLs.
	 */
	name: z.string({
		required_error: 'Worker name is required'
	}),

	/**
	 * Cloudflare account ID.
	 * Required for remote bindings (AI, Vectorize, etc.).
	 */
	accountId: z.string().optional(),

	/**
	 * Cloudflare Workers compatibility date.
	 * @default Current date (YYYY-MM-DD)
	 */
	compatibilityDate: compatibilityDateSchema.optional().default(getCurrentDate),

	/**
	 * Compatibility flags to enable additional features.
	 * @default ['nodejs_compat', 'nodejs_als'] (always included)
	 */
	compatibilityFlags: z.array(z.string()).optional().transform((flags = []) => normalizeCompatibilityFlags(flags)),

	/** Preview-specific Devflare behavior. */
	previews: previewsConfigSchema,

	/** File handlers configuration. */
	files: filesSchema,

	/** Bindings to Cloudflare services. */
	bindings: bindingsSchema,

	/** Trigger configuration (cron schedules). */
	triggers: triggersSchema,

	/** Wrangler module rules for non-JavaScript imports and additional modules. */
	rules: moduleRulesSchema,

	/** Whether Wrangler should include additional files matching module rules. */
	findAdditionalModules: z.boolean().optional(),

	/** Base directory for Wrangler module rule discovery. */
	baseDir: z.string().optional(),

	/** Whether Wrangler should preserve bundled file names. */
	preserveFileNames: z.boolean().optional(),

	/** Tail Workers that consume traces from this Worker. */
	tailConsumers: z.array(tailConsumerSchema).optional(),

	/** Environment variables. */
	vars: z.record(z.string(), z.string()).optional(),

	/** Secret declarations. */
	secrets: z.record(z.string(), secretConfigSchema).optional(),

	/** Deployment routes. */
	routes: z.array(routeConfigSchema).optional(),

	/** WebSocket routes for dev mode DO proxying. */
	wsRoutes: z.array(wsRouteConfigSchema).optional(),

	/** Static assets configuration. */
	assets: assetsConfigSchema,

	/** Cloudflare Containers launched alongside the Worker. */
	containers: containersConfigSchema,

	/** Worker placement behavior. */
	placement: placementSchema,

	/** Resource limits. */
	limits: limitsSchema,

	/** Observability settings (logging, tracing). */
	observability: observabilitySchema,

	/** Durable Object migrations. */
	migrations: z.array(migrationSchema).optional(),

	/** Rolldown configuration for Durable Object bundling. */
	rolldown: rolldownConfigSchema,

	/** Vite-related configuration namespace. */
	vite: viteConfigSchema,

	/** Wrangler passthrough for unsupported options. */
	wrangler: wranglerConfigSchema
} as const

/**
 * Main devflare configuration schema.
 *
 * This is the complete schema for `devflare.config.ts` files.
 * Use `defineConfig()` for type-safe configuration with autocompletion.
 */
const canonicalConfigSchema = z.object({
	...rootConfigShape,
	/** Environment-specific configuration overrides. */
	env: z.record(z.string(), envConfigSchemaInner).optional()
})

export const configSchema = canonicalConfigSchema.strict()

/** Output type after Zod validation and transforms */
export type DevflareConfig = z.output<typeof configSchema>

/** Input type for defineConfig - before Zod transforms apply defaults */
export type DevflareConfigInput = z.input<typeof configSchema>

export type { DevflareRolldownOptions, DevflareRolldownOutputOptions, RolldownConfig, ViteConfig } from './schema-build'
export type {
	BrowserBindings,
	D1Binding,
	DurableObjectBinding,
	HyperdriveBinding,
	KVBinding,
	QueueConsumer,
	QueuesConfig,
	RateLimitBinding,
	VersionMetadataBinding,
	WorkerLoaderBinding,
	SecretsStoreBinding,
	DispatchNamespaceBinding,
	WorkflowBinding,
	PipelineBinding,
	ImagesBinding,
	MediaBinding,
	ArtifactsBinding,
	ServiceBinding,
	MtlsCertificateBinding
} from './schema-bindings'
export type { DevflareEnvConfig } from './schema-env'
export type { AssetsConfig, ContainerConfig, MigrationConfig, ModuleRuleConfig, PlacementConfig, PreviewConfig, RouteConfig, TailConsumerConfig, WsRouteConfig } from './schema-runtime'
export type {
	NormalizedD1Binding,
	NormalizedDispatchNamespaceBinding,
	NormalizedDOBinding,
	NormalizedHyperdriveBinding,
	NormalizedKVBinding,
	NormalizedMtlsCertificateBinding,
	NormalizedWorkflowBinding,
	NormalizedPipelineBinding,
	NormalizedImagesBinding,
	NormalizedMediaBinding,
	NormalizedArtifactsBinding
} from './schema-normalization'
export {
	getLocalD1DatabaseIdentifier,
	getLocalHyperdriveConfigIdentifier,
	getLocalKVNamespaceIdentifier,
	getSingleBrowserBindingName,
	normalizeD1Binding,
	normalizeDispatchNamespaceBinding,
	normalizeDOBinding,
	normalizeHyperdriveBinding,
	normalizeKVBinding,
	normalizeMtlsCertificateBinding,
	normalizeWorkflowBinding,
	normalizePipelineBinding,
	normalizeImagesBinding,
	normalizeMediaBinding,
	normalizeArtifactsBinding
} from './schema-normalization'
export { browserBindingSchema, formatBrowserBindingLimitMessage } from './schema-bindings'
