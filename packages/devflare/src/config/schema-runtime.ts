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
	tail: z.union([z.string(), z.literal(false)]).optional(),
	durableObjects: z.union([z.string(), z.literal(false)]).optional(),
	entrypoints: z.union([z.string(), z.literal(false)]).optional(),
	workflows: z.union([z.string(), z.literal(false)]).optional(),
	routes: z.union([routesConfigSchema, z.literal(false)]).optional(),
	transport: z.union([z.string(), z.null()]).optional()
}).optional()

/**
 * Tail Consumer configuration.
 */
export const tailConsumerSchema = z.union([
	z.string().min(1),
	z.object({
		service: z.string().min(1),
		environment: z.string().min(1).optional()
	}).strict()
])

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
 * Dev server configuration for `devflare dev`.
 *
 * Controls the host and port the local Miniflare runtime instance binds to.
 * This is a development-only setting and is never emitted to compiled Wrangler
 * output. CLI flags (`--runtime-port`, `--runtime-host`) and environment
 * variables (`DEVFLARE_RUNTIME_PORT`, `DEVFLARE_RUNTIME_HOST`) take precedence
 * over these values.
 */
export const serverConfigSchema = z.object({
	/** Host the dev runtime binds to. @default '127.0.0.1' */
	host: z.string().min(1).optional(),
	/** Port the dev runtime binds to. @default 8787 */
	port: z.number().int().min(1).max(65535).optional()
}).strict().optional()

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
}).superRefine((route, ctx) => {
	if (!route.custom_domain) {
		return
	}

	if (route.pattern.includes('*')) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['pattern'],
			message: 'Wildcard operators (*) are not allowed in Custom Domains'
		})
	}

	if (route.pattern.includes('/')) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['pattern'],
			message: 'Paths are not allowed in Custom Domains'
		})
	}
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
	binding: z.string().optional(),
	html_handling: z.enum([
		'auto-trailing-slash',
		'force-trailing-slash',
		'drop-trailing-slash',
		'none'
	]).optional(),
	not_found_handling: z.enum([
		'single-page-application',
		'404-page',
		'none'
	]).optional(),
	run_worker_first: z.union([
		z.boolean(),
		z.array(z.string())
	]).optional()
}).strict().optional()

const smartPlacementSchema = z.object({
	mode: z.enum(['off', 'smart']),
	hint: z.string().optional()
}).strict().superRefine((placement, ctx) => {
	if (placement.hint !== undefined && placement.mode !== 'smart') {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['hint'],
			message: 'placement.hint can only be set when placement.mode is smart'
		})
	}
})

const targetedRegionPlacementSchema = z.object({
	mode: z.literal('targeted').optional(),
	region: z.string().min(1)
}).strict()

const targetedHostPlacementSchema = z.object({
	mode: z.literal('targeted').optional(),
	host: z.string().min(1)
}).strict()

const targetedHostnamePlacementSchema = z.object({
	mode: z.literal('targeted').optional(),
	hostname: z.string().min(1)
}).strict()

/**
 * Worker placement configuration.
 */
export const placementSchema = z.union([
	smartPlacementSchema,
	targetedRegionPlacementSchema,
	targetedHostPlacementSchema,
	targetedHostnamePlacementSchema
]).optional()

const samplingRateSchema = z.number().min(0).max(1)

const observabilityLogsSchema = z.object({
	enabled: z.boolean().optional(),
	head_sampling_rate: samplingRateSchema.optional(),
	invocation_logs: z.boolean().optional(),
	persist: z.boolean().optional(),
	destinations: z.array(z.string()).optional()
}).strict()

const observabilityTracesSchema = z.object({
	enabled: z.boolean().optional(),
	head_sampling_rate: samplingRateSchema.optional(),
	persist: z.boolean().optional(),
	destinations: z.array(z.string()).optional()
}).strict()

/**
 * Observability configuration for logs and traces.
 */
export const observabilitySchema = z.object({
	enabled: z.boolean().optional(),
	head_sampling_rate: samplingRateSchema.optional(),
	logs: observabilityLogsSchema.optional(),
	traces: observabilityTracesSchema.optional()
}).strict().optional()

/**
 * Resource limits configuration.
 */
export const limitsSchema = z.object({
	cpu_ms: z.number().optional(),
	subrequests: z.number().optional()
}).strict().optional()

const rolloutStepPercentageSchema = z.union([
	z.number().int().positive(),
	z.array(z.number().int().positive()).min(1)
])

/**
 * Cloudflare Containers configuration.
 *
 * Devflare authors this in camelCase and compiles to Wrangler's top-level
 * `containers` array. Runtime launch/testing is handled by the local
 * container test shim, not by Miniflare itself.
 */
export const containerConfigSchema = z.object({
	className: z.string().min(1),
	image: z.string().min(1),
	maxInstances: z.number().int().positive().optional(),
	instanceType: z.string().min(1).optional(),
	name: z.string().min(1).optional(),
	imageBuildContext: z.string().min(1).optional(),
	imageVars: z.record(z.string(), z.string()).optional(),
	rolloutActiveGracePeriod: z.number().int().nonnegative().optional(),
	rolloutStepPercentage: rolloutStepPercentageSchema.optional()
}).strict()

export const containersConfigSchema = z.array(containerConfigSchema).optional()

/**
 * Module rules for non-JavaScript Worker modules and imported assets.
 *
 * Wrangler also exposes Python-specific rule types while Python Workers are in
 * beta. Devflare keeps those behind `wrangler.passthrough` until the local
 * Python Worker toolchain has a stable Devflare integration point.
 */
export const moduleRuleSchema = z.object({
	type: z.enum(['ESModule', 'CommonJS', 'CompiledWasm', 'Text', 'Data']),
	globs: z.array(z.string()).min(1),
	fallthrough: z.boolean().optional()
}).strict()

export const moduleRulesSchema = z.array(moduleRuleSchema).optional()

/**
 * Durable Object migration configuration.
 */
const renamedClassMigrationSchema = z.object({
	from: z.string(),
	to: z.string()
}).strict()

export const migrationSchema = z.object({
	tag: z.string(),
	new_classes: z.array(z.string()).optional(),
	renamed_classes: z.array(renamedClassMigrationSchema).optional(),
	deleted_classes: z.array(z.string()).optional(),
	new_sqlite_classes: z.array(z.string()).optional()
}).strict()

/**
 * Wrangler configuration passthrough.
 */
export const wranglerConfigSchema = z.object({
	passthrough: z.record(z.string(), z.unknown()).optional()
}).optional()

export type AssetsConfig = z.infer<typeof assetsConfigSchema>
export type ContainerConfig = z.infer<typeof containerConfigSchema>
export type MigrationConfig = z.infer<typeof migrationSchema>
export type ModuleRuleConfig = z.infer<typeof moduleRuleSchema>
export type PlacementConfig = z.infer<typeof placementSchema>
export type PreviewConfig = z.output<typeof previewsConfigSchema>
export type RouteConfig = z.infer<typeof routeConfigSchema>
export type ServerConfig = z.infer<typeof serverConfigSchema>
export type TailConsumerConfig = z.infer<typeof tailConsumerSchema>
export type WsRouteConfig = z.infer<typeof wsRouteConfigSchema>
