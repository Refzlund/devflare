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
import {
	buildConfigSchema,
	rolldownConfigSchema,
	viteConfigSchema,
	type LegacyBuildConfig
} from './schema-build'
import { normalizeLegacyBuildAndViteConfig } from './schema-legacy'
import { bindingsSchema } from './schema-bindings'
import { envConfigSchemaInner } from './schema-env'
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
	wranglerConfigSchema,
	wsRouteConfigSchema
} from './schema-runtime'

/** Helper to get current date in YYYY-MM-DD format */
function getCurrentDate(): string {
	const now = new Date()
	return now.toISOString().split('T')[0]
}

/** Compatibility flags that are always enabled by devflare */
const FORCED_COMPATIBILITY_FLAGS = ['nodejs_compat', 'nodejs_als']

/**
 * Main devflare configuration schema.
 *
 * This is the complete schema for `devflare.config.ts` files.
 * Use `defineConfig()` for type-safe configuration with autocompletion.
 */
const canonicalConfigSchema = z.object({
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
	compatibilityFlags: z.array(z.string()).optional().transform((flags = []) => {
		const merged = new Set([...FORCED_COMPATIBILITY_FLAGS, ...flags])
		return [...merged]
	}),

	/** Preview-specific Devflare behavior. */
	previews: previewsConfigSchema,

	/** File handlers configuration. */
	files: filesSchema,

	/** Bindings to Cloudflare services. */
	bindings: bindingsSchema,

	/** Trigger configuration (cron schedules). */
	triggers: triggersSchema,

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

	/** Resource limits (CPU time). */
	limits: limitsSchema,

	/** Observability settings (logging, tracing). */
	observability: observabilitySchema,

	/** Durable Object migrations. */
	migrations: z.array(migrationSchema).optional(),

	/** Rolldown configuration for Durable Object bundling. */
	rolldown: rolldownConfigSchema,

	/** Vite-related configuration namespace. */
	vite: viteConfigSchema,

	/** Environment-specific configuration overrides. */
	env: z.record(z.string(), envConfigSchemaInner).optional(),

	/** Wrangler passthrough for unsupported options. */
	wrangler: wranglerConfigSchema
})

export const configSchema = canonicalConfigSchema.extend({
	/** @deprecated Use `rolldown` instead. */
	build: buildConfigSchema,

	/** @deprecated Use `vite.plugins` instead. */
	plugins: z.array(z.unknown()).optional()
}).transform((config): z.infer<typeof canonicalConfigSchema> => {
	return normalizeLegacyBuildAndViteConfig(config)
})

/** Output type after Zod validation and transforms */
export type DevflareConfig = z.output<typeof configSchema>

/** Input type for defineConfig - before Zod transforms apply defaults */
export type DevflareConfigInput = z.input<typeof configSchema>

export type BuildConfig = LegacyBuildConfig

export type { DevflareRolldownOptions, DevflareRolldownOutputOptions, RolldownConfig, ViteConfig } from './schema-build'
export type {
	BrowserBindings,
	D1Binding,
	DurableObjectBinding,
	HyperdriveBinding,
	KVBinding,
	QueueConsumer,
	QueuesConfig,
	ServiceBinding
} from './schema-bindings'
export type { DevflareEnvConfig } from './schema-env'
export type { AssetsConfig, MigrationConfig, PreviewConfig, RouteConfig, WsRouteConfig } from './schema-runtime'
export type {
	NormalizedD1Binding,
	NormalizedDOBinding,
	NormalizedHyperdriveBinding,
	NormalizedKVBinding
} from './schema-normalization'
export {
	getLocalD1DatabaseIdentifier,
	getLocalHyperdriveConfigIdentifier,
	getLocalKVNamespaceIdentifier,
	getSingleBrowserBindingName,
	normalizeD1Binding,
	normalizeDOBinding,
	normalizeHyperdriveBinding,
	normalizeKVBinding
} from './schema-normalization'
