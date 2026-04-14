import { z } from 'zod'

/** Regex pattern for YYYY-MM-DD date format */
const dateRegex = /^\d{4}-\d{2}-\d{2}$/

/**
 * Cloudflare Workers compatibility date schema.
 * Must be in YYYY-MM-DD format (e.g., '2025-01-07').
 */
export const compatibilityDateSchema = z.string().regex(dateRegex, {
	message: 'Compatibility date must be in YYYY-MM-DD format'
})

/**
 * Built-in file router configuration used for `src/routes/**` discovery.
 */
export const routesConfigSchema = z.object({
	/** Directory containing route files (e.g., 'src/routes') */
	dir: z.string(),
	/** Optional route prefix (e.g., '/api'). */
	prefix: z.string().optional()
})

/**
 * File handler configuration.
 * Maps handler types to their source file paths.
 */
export const filesSchema = z.object({
	fetch: z.union([z.string(), z.literal(false)]).optional(),
	queue: z.union([z.string(), z.literal(false)]).optional(),
	scheduled: z.union([z.string(), z.literal(false)]).optional(),
	email: z.union([z.string(), z.literal(false)]).optional(),
	durableObjects: z.union([z.string(), z.literal(false)]).optional(),
	entrypoints: z.union([z.string(), z.literal(false)]).optional(),
	workflows: z.union([z.string(), z.literal(false)]).optional(),
	routes: z.union([routesConfigSchema, z.literal(false)]).optional(),
	transport: z.union([z.string(), z.null()]).optional()
}).optional()

/**
 * Trigger configuration for scheduled (cron) events.
 */
export const triggersSchema = z.object({
	crons: z.array(z.string()).optional()
}).optional()

/**
 * Preview-specific Devflare behavior.
 */
export const previewsConfigSchema = z.object({
	includeCrons: z.boolean().optional().default(false)
}).optional()

/**
 * Secret declaration options.
 */
export const secretConfigSchema = z.object({
	required: z.boolean().optional().default(true)
})

/**
 * Route configuration for worker deployment.
 */
export const routeConfigSchema = z.object({
	pattern: z.string(),
	zone_name: z.string().optional(),
	zone_id: z.string().optional(),
	custom_domain: z.boolean().optional()
})

/**
 * WebSocket route configuration for dev mode Durable Object proxying.
 */
export const wsRouteConfigSchema = z.object({
	pattern: z.string(),
	doNamespace: z.string(),
	idParam: z.string().default('id'),
	forwardPath: z.string().default('/websocket')
})

/**
 * Static assets configuration.
 */
export const assetsConfigSchema = z.object({
	directory: z.string(),
	binding: z.string().optional()
}).optional()

/**
 * Observability configuration for logging and tracing.
 */
export const observabilitySchema = z.object({
	enabled: z.boolean().optional(),
	head_sampling_rate: z.number().min(0).max(1).optional()
}).optional()

/**
 * Resource limits configuration.
 */
export const limitsSchema = z.object({
	cpu_ms: z.number().optional()
}).optional()

/**
 * Durable Object migration configuration.
 */
export const migrationSchema = z.object({
	tag: z.string(),
	new_classes: z.array(z.string()).optional(),
	renamed_classes: z.array(z.object({
		from: z.string(),
		to: z.string()
	})).optional(),
	deleted_classes: z.array(z.string()).optional(),
	new_sqlite_classes: z.array(z.string()).optional()
})

/**
 * Wrangler configuration passthrough.
 */
export const wranglerConfigSchema = z.object({
	passthrough: z.record(z.string(), z.unknown()).optional()
}).optional()

export type AssetsConfig = z.infer<typeof assetsConfigSchema>
export type MigrationConfig = z.infer<typeof migrationSchema>
export type PreviewConfig = z.output<typeof previewsConfigSchema>
export type RouteConfig = z.infer<typeof routeConfigSchema>
export type WsRouteConfig = z.infer<typeof wsRouteConfigSchema>
