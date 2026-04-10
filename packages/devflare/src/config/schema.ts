// =============================================================================
// Config Schema — Zod schema for devflare.config.ts validation
// =============================================================================
//
// This module defines the complete schema for devflare configuration files.
// All config options are validated at runtime using Zod, with sensible defaults.
//
// DEFAULTS (you don't need to specify these):
// - compatibilityDate: Defaults to current date (YYYY-MM-DD)
// - compatibilityFlags: Always includes ['nodejs_compat', 'nodejs_als']
//
// =============================================================================

import type { OutputOptions, RolldownOptions } from 'rolldown'
import { z } from 'zod'

// -----------------------------------------------------------------------------
// Primitive Schemas
// -----------------------------------------------------------------------------

/** Regex pattern for YYYY-MM-DD date format */
const dateRegex = /^\d{4}-\d{2}-\d{2}$/

/**
 * Cloudflare Workers compatibility date schema.
 * Must be in YYYY-MM-DD format (e.g., '2025-01-07').
 * @see https://developers.cloudflare.com/workers/configuration/compatibility-dates/
 */
const compatibilityDateSchema = z.string().regex(dateRegex, {
	message: 'Compatibility date must be in YYYY-MM-DD format'
})

// -----------------------------------------------------------------------------
// File Handler Schemas
// -----------------------------------------------------------------------------

/**
 * Built-in file router configuration used for `src/routes/**` discovery.
 * This powers Devflare's route-tree dispatcher when file routes are enabled.
 */
const routesConfigSchema = z.object({
	/** Directory containing route files (e.g., 'src/routes') */
	dir: z.string(),
	/**
	 * Optional route prefix (e.g., '/api').
	 * Devflare mounts the discovered route tree under this static pathname prefix.
	 */
	prefix: z.string().optional()
})

/**
 * File handler configuration.
 * Maps handler types to their source file paths.
 * Set to `false` to explicitly disable a handler.
 *
 * **Glob patterns respect `.gitignore`** — files in ignored directories
 * (like `node_modules`, `dist`, `.devflare`) are automatically excluded.
 */
const filesSchema = z.object({
	/**
	 * Main fetch handler file path.
	 * This handles HTTP requests to your worker.
	 * @default 'src/fetch.{ts,js}'
	 * @example 'src/fetch.ts'
	 */
	fetch: z.union([z.string(), z.literal(false)]).optional(),

	/**
	 * Queue consumer handler file path.
	 * Handles messages from Cloudflare Queues.
	 * @default 'src/queue.ts'
	 * @example 'src/queue.ts'
	 */
	queue: z.union([z.string(), z.literal(false)]).optional(),

	/**
	 * Scheduled (cron) handler file path.
	 * Handles cron trigger invocations.
	 * @default 'src/scheduled.ts'
	 * @example 'src/scheduled.ts'
	 */
	scheduled: z.union([z.string(), z.literal(false)]).optional(),

	/**
	 * Email handler file path.
	 * Handles incoming emails via Email Routing.
	 * @default 'src/email.ts'
	 * @example 'src/email.ts'
	 */
	email: z.union([z.string(), z.literal(false)]).optional(),

	/**
	 * Durable Object class discovery glob pattern.
	 * Files matching this pattern are scanned for DO classes.
	 * Respects `.gitignore` automatically.
	 *
	 * @default `**​/do.*.{ts,js}` (recursive)
	 * @example `**​/do.*.{ts,js}` — Matches src/do.counter.ts, lib/do.chat.ts
	 * @example `src/do.*.ts` — Legacy single-directory pattern
	 */
	durableObjects: z.union([z.string(), z.literal(false)]).optional(),

	/**
	 * WorkerEntrypoint class discovery glob pattern.
	 * Files matching this pattern are scanned for named entrypoint classes.
	 * Respects `.gitignore` automatically.
	 *
	 * Entrypoints enable typed cross-worker RPC via service bindings:
	 * ```ts
	 * // ep.admin.ts
	 * export class AdminEntrypoint extends WorkerEntrypoint {
	 *   async getStats() { return { users: 100 } }
	 * }
	 *
	 * // Consumer worker
	 * const stats = await env.ADMIN_SERVICE.getStats()
	 * ```
	 *
	 * @default `**​/ep.*.{ts,js}` (recursive)
	 * @example `**​/ep.*.{ts,js}` — Matches src/ep.admin.ts, lib/ep.auth.ts
	 * @example `src/ep.*.ts` — Legacy single-directory pattern
	 */
	entrypoints: z.union([z.string(), z.literal(false)]).optional(),

	/**
	 * Workflow class discovery glob pattern.
	 * Files matching this pattern are scanned for Workflow classes.
	 * Respects `.gitignore` automatically.
	 *
	 * Workflows enable durable multi-step execution with automatic retries:
	 * ```ts
	 * // wf.order-processor.ts
	 * export class OrderProcessingWorkflow extends Workflow {
	 *   async run(event, step) {
	 *     const validated = await step.do('validate', () => validate(event.payload))
	 *     const charged = await step.do('charge', () => charge(validated))
	 *     return { orderId: charged.id }
	 *   }
	 * }
	 * ```
	 *
	 * @default `**​/wf.*.{ts,js}` (recursive)
	 * @example `**​/wf.*.{ts,js}` — Matches src/wf.order.ts, lib/wf.pipeline.ts
	 * @example `src/wf.*.ts` — Legacy single-directory pattern
	 */
	workflows: z.union([z.string(), z.literal(false)]).optional(),

	/**
	 * Built-in file router configuration.
	 * Use this to customize or disable the route tree rooted at `src/routes/**`.
	 *
	 * When omitted, Devflare automatically discovers `src/routes` if that
	 * directory exists.
	 *
	 * When set:
	 * - `dir` changes the route root directory
	 * - `prefix` mounts the route tree under a fixed prefix such as `/api`
	 * - `false` disables route discovery entirely
	 *
	 * Route filename conventions:
	 * ```
	 * src/routes/
	 * ├── index.ts
	 * ├── users/
	 * │   ├── index.ts
	 * │   ├── [id].ts
	 * │   ├── [...slug].ts
	 * │   └── [id]/
	 * │       └── posts.ts
	 * └── api/
	 *     └── health.ts
	 * ```
	 *
	 * Files or directories prefixed with `_` are ignored so route-local helpers
	 * can live beside handlers.
	 */
	routes: z.union([routesConfigSchema, z.literal(false)]).optional(),

	/**
	 * Transport file for custom RPC serialization.
	 * When omitted, Devflare auto-discovers `src/transport.{ts,js,mts,mjs}` if
	 * one of those files exists.
	 *
	 * Set this to `null` to disable transport autodiscovery explicitly.
	 *
	 * Today this is primarily used by the test/bridge serialization path.
	 *
	 * The file must export a named `transport` object.
	 * @example 'src/transport.ts'
	 */
	transport: z.union([z.string(), z.null()]).optional()
}).optional()

// -----------------------------------------------------------------------------
// Binding Schemas
// -----------------------------------------------------------------------------

/**
 * Durable Object binding input type.
 * Accepts both string shorthand and object form (including DOBindingRef from ref()).
 */
type DurableObjectBindingInput =
	| string // Simple: 'Counter' → normalized to { className: 'Counter' }
	| {
		/** The Durable Object class name */
		readonly className: string
		/**
		 * Script name for cross-worker DO access.
		 * For local DOs: file path (e.g., 'do.counter.ts')
		 * For cross-worker DOs: worker name (e.g., 'do-service')
		 */
		readonly scriptName?: string
		/** @internal Reference marker for cross-worker DO bindings */
		readonly __ref?: unknown
	}

/**
 * Durable Object binding schema.
 * Validates DO binding configuration in either string or object form.
 *
 * @example String form (local DO)
 * ```ts
 * durableObjects: { COUNTER: 'Counter' }
 * ```
 *
 * @example Object form (cross-worker DO)
 * ```ts
 * durableObjects: { COUNTER: doService.COUNTER }
 * ```
 */
const durableObjectBindingSchema = z.custom<DurableObjectBindingInput>((val) => {
	if (typeof val === 'string') return true
	if (val && typeof val === 'object' && 'className' in val) {
		const obj = val as Record<string, unknown>
		return typeof obj.className === 'string'
	}
	return false
}, {
	message: 'Expected string or { className: string, scriptName?: string }'
})

/**
 * Queue consumer configuration.
 * Defines how messages are consumed from a Cloudflare Queue.
 */
const queueConsumerSchema = z.object({
	/** Queue name to consume from */
	queue: z.string(),
	/**
	 * Maximum messages per batch (1-100).
	 * @default 10
	 */
	maxBatchSize: z.number().optional(),
	/**
	 * Maximum seconds to wait for a full batch.
	 * @default 5
	 */
	maxBatchTimeout: z.number().optional(),
	/**
	 * Maximum retry attempts for failed messages.
	 * @default 3
	 */
	maxRetries: z.number().optional(),
	/** Queue name to send failed messages after max retries */
	deadLetterQueue: z.string().optional(),
	/** Maximum concurrent batch invocations */
	maxConcurrency: z.number().optional(),
	/** Delay in seconds between retries */
	retryDelay: z.number().optional()
})

/**
 * Queues configuration for producers and consumers.
 */
const queuesConfigSchema = z.object({
	/**
	 * Queue producer bindings.
	 * Maps binding name to queue name.
	 * @example { TASK_QUEUE: 'task-queue' }
	 */
	producers: z.record(z.string(), z.string()).optional(),
	/**
	 * Queue consumer configurations.
	 * Array of consumer configs for processing queue messages.
	 */
	consumers: z.array(queueConsumerSchema).optional()
})

/**
 * Service binding schema.
 * Binds to another Worker for RPC-style communication.
 * Accepts plain objects or WorkerBinding from ref().worker.
 */
const serviceBindingSchema = z.custom<{
	/** Target worker/service name */
	service: string
	/** Optional environment (staging, production, etc.) */
	environment?: string
	/** Optional entrypoint class name for named exports */
	entrypoint?: string
	/** @internal Reference marker for ref() bindings */
	__ref?: unknown
}>((val) => {
	if (typeof val !== 'object' && typeof val !== 'function') return false
	const obj = val as Record<string, unknown>
	const service = obj.service
	if (typeof service !== 'string') return false
	return true
}, {
	message: 'Expected service binding object with { service: string } or ref().worker'
})

/**
 * AI binding configuration.
 * Provides access to Cloudflare Workers AI for inference.
 * @see https://developers.cloudflare.com/workers-ai/
 */
const aiBindingSchema = z.object({
	/** Binding name exposed in env (e.g., 'AI') */
	binding: z.string()
})

/**
 * Vectorize index binding configuration.
 * Provides access to a Cloudflare Vectorize index for similarity search.
 * @see https://developers.cloudflare.com/vectorize/
 */
const vectorizeBindingSchema = z.object({
	/** Name of the Vectorize index */
	indexName: z.string()
})

/**
 * Hyperdrive binding configuration.
 * Provides accelerated PostgreSQL connections via connection pooling.
 * @see https://developers.cloudflare.com/hyperdrive/
 */
const hyperdriveBindingSchema = z.object({
	/** Hyperdrive configuration ID */
	id: z.string()
})

const SINGLE_BROWSER_BINDING_ERROR_MESSAGE = 'Devflare currently supports exactly one browser binding because Wrangler only supports a single browser binding.'

function formatBrowserBindingLimitMessage(bindingNames: string[]): string {
	if (bindingNames.length <= 1) {
		return SINGLE_BROWSER_BINDING_ERROR_MESSAGE
	}

	return `${SINGLE_BROWSER_BINDING_ERROR_MESSAGE} Configured bindings: ${bindingNames.join(', ')}`
}

function getBrowserBindingNames(bindings: Record<string, string> | undefined): string[] {
	return bindings ? Object.keys(bindings) : []
}

/**
 * Browser Rendering binding configuration.
 * Provides headless browser access for rendering/screenshots.
 * @see https://developers.cloudflare.com/browser-rendering/
 */
const browserBindingSchema = z.record(z.string(), z.string()).superRefine((bindings, ctx) => {
	const bindingNames = getBrowserBindingNames(bindings)
	if (bindingNames.length > 1) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: formatBrowserBindingLimitMessage(bindingNames)
		})
	}
})

/**
 * Analytics Engine binding configuration.
 * Provides access to Cloudflare Analytics Engine for event logging.
 * @see https://developers.cloudflare.com/analytics/analytics-engine/
 */
const analyticsBindingSchema = z.object({
	/** Analytics Engine dataset name */
	dataset: z.string()
})

/**
 * Email sending binding configuration.
 * Enables sending emails via Cloudflare Email Routing.
 * @see https://developers.cloudflare.com/email-routing/
 */
const sendEmailBindingSchema = z.object({
	/** Restrict this binding to a specific verified destination address */
	destinationAddress: z.string().optional(),
	/** Restrict this binding to a set of verified destination addresses */
	allowedDestinationAddresses: z.array(z.string()).optional(),
	/** Restrict this binding to a set of verified sender addresses */
	allowedSenderAddresses: z.array(z.string()).optional()
}).refine((binding) => {
	return !(binding.destinationAddress && binding.allowedDestinationAddresses)
}, {
	message: 'sendEmail bindings must use either destinationAddress or allowedDestinationAddresses, not both',
	path: ['allowedDestinationAddresses']
})

const d1BindingByIdSchema = z.object({
	/** Explicit D1 database ID */
	id: z.string()
}).strict()

const d1BindingByNameSchema = z.object({
	/** Stable D1 database name to resolve to an ID at config/build/deploy time */
	name: z.string()
}).strict()

const d1BindingSchema = z.union([
	z.string(),
	d1BindingByIdSchema,
	d1BindingByNameSchema
])

const kvBindingByIdSchema = z.object({
	/** Explicit KV namespace ID */
	id: z.string()
}).strict()

const kvBindingByNameSchema = z.object({
	/** Stable KV namespace name to resolve to an ID at config/build/deploy time */
	name: z.string()
}).strict()

const kvBindingSchema = z.union([
	z.string(),
	kvBindingByIdSchema,
	kvBindingByNameSchema
])

/**
 * All worker bindings configuration.
 * Defines connections to Cloudflare services and resources.
 */
const bindingsSchema = z.object({
	/**
	 * KV Namespace bindings.
	 * Maps binding name to either a stable KV namespace name or an explicit resolver object.
	 * @example { CACHE: 'cache-kv' }
	 * @example { CACHE: { name: 'cache-kv' } }
	 * @example { CACHE: { id: 'kv-namespace-id' } }
	 */
	kv: z.record(z.string(), kvBindingSchema).optional(),

	/**
	 * D1 Database bindings.
	 * Maps binding name to either a stable D1 database name or an explicit resolver object.
	 * @example { DB: 'main-database' }
	 * @example { DB: { name: 'main-database' } }
	 * @example { DB: { id: 'database-id' } }
	 */
	d1: z.record(z.string(), d1BindingSchema).optional(),

	/**
	 * R2 Bucket bindings.
	 * Maps binding name to R2 bucket name.
	 * @example { IMAGES: 'images-bucket' }
	 */
	r2: z.record(z.string(), z.string()).optional(),

	/**
	 * Durable Object bindings.
	 * Maps binding name to DO class configuration.
	 * @example { COUNTER: 'Counter' } or { COUNTER: { className: 'Counter' } }
	 */
	durableObjects: z.record(z.string(), durableObjectBindingSchema).optional(),

	/**
	 * Queue bindings for producers and consumers.
	 */
	queues: queuesConfigSchema.optional(),

	/**
	 * Service bindings to other Workers.
	 * Enables RPC-style communication between workers.
	 * @example { MATH: mathWorker.worker }
	 */
	services: z.record(z.string(), serviceBindingSchema).optional(),

	/**
	 * Workers AI binding for ML inference.
	 * @example { binding: 'AI' }
	 */
	ai: aiBindingSchema.optional(),

	/**
	 * Vectorize index bindings for vector similarity search.
	 * @example { EMBEDDINGS: { indexName: 'my-index' } }
	 */
	vectorize: z.record(z.string(), vectorizeBindingSchema).optional(),

	/**
	 * Hyperdrive bindings for accelerated PostgreSQL.
	 * @example { DB: { id: 'hyperdrive-config-id' } }
	 */
	hyperdrive: z.record(z.string(), hyperdriveBindingSchema).optional(),

	/**
	 * Browser Rendering binding for headless browser access.
	 * Devflare uses a named-map DX even though Wrangler compiles this down to a
	 * single `{ binding: '...' }` entry.
	 *
	 * Phase 1 currently allows exactly one browser binding.
	 * @example { BROWSER: 'my-browser' }
	 */
	browser: browserBindingSchema.optional(),

	/**
	 * Analytics Engine bindings for event logging.
	 * @example { ANALYTICS: { dataset: 'my-dataset' } }
	 */
	analyticsEngine: z.record(z.string(), analyticsBindingSchema).optional(),

	/**
	 * Email sending bindings.
	 * @example { EMAIL: { destinationAddress: 'admin@example.com' } }
	 * @example { BULK_EMAIL: { allowedDestinationAddresses: ['ops@example.com'], allowedSenderAddresses: ['noreply@example.com'] } }
	 */
	sendEmail: z.record(z.string(), sendEmailBindingSchema).optional()
}).optional()

// -----------------------------------------------------------------------------
// Trigger Schemas
// -----------------------------------------------------------------------------

/**
 * Trigger configuration for scheduled (cron) events.
 * @see https://developers.cloudflare.com/workers/configuration/cron-triggers/
 */
const triggersSchema = z.object({
	/**
	 * Array of cron expressions for scheduled execution.
	 *
	 * Examples:
	 * - `'0 0 * * *'` — Daily at midnight
	 * - `'0/5 * * * *'` — Every 5 minutes
	 * - `'0 9 * * 1'` — Every Monday at 9am
	 */
	crons: z.array(z.string()).optional()
}).optional()

// -----------------------------------------------------------------------------
// Secrets Schema
// -----------------------------------------------------------------------------

/**
 * Secret declaration options.
 * Use this to describe which runtime-provided secrets must exist; the secret
 * values themselves are supplied externally and do not live in config.
 */
const secretConfigSchema = z.object({
	/**
	 * Whether this secret is required for the worker to run.
	 * If true, worker will fail to start if secret is missing.
	 * @default true
	 */
	required: z.boolean().optional().default(true)
})

// -----------------------------------------------------------------------------
// Route Schema
// -----------------------------------------------------------------------------

/**
 * Route configuration for worker deployment.
 * Defines URL patterns that trigger the worker.
 * @see https://developers.cloudflare.com/workers/configuration/routing/routes/
 */
const routeConfigSchema = z.object({
	/**
	 * URL pattern to match (e.g., 'example.com/*').
	 * Supports wildcards (*) for path matching.
	 */
	pattern: z.string(),
	/** Zone name to associate the route with */
	zone_name: z.string().optional(),
	/** Zone ID to associate the route with (alternative to zone_name) */
	zone_id: z.string().optional(),
	/** Whether this is a custom domain route */
	custom_domain: z.boolean().optional()
})

// -----------------------------------------------------------------------------
// WebSocket Route Schema (for dev mode DO proxying)
// -----------------------------------------------------------------------------

/**
 * WebSocket route configuration for dev mode Durable Object proxying.
 * Enables WebSocket connections to DOs in local development.
 *
 * @example
 * ```ts
 * wsRoutes: [{
 *   pattern: '/chat/api',
 *   doNamespace: 'CHAT_ROOM',
 *   idParam: 'roomId',
 *   forwardPath: '/websocket'
 * }]
 * ```
 */
const wsRouteConfigSchema = z.object({
	/**
	 * URL pattern to match for WebSocket upgrade requests.
	 * @example '/chat/api'
	 */
	pattern: z.string(),
	/**
	 * Durable Object namespace binding name to route to.
	 * Must match a binding name in bindings.durableObjects.
	 */
	doNamespace: z.string(),
	/**
	 * Query parameter name used to identify DO instances.
	 * @default 'id'
	 * @example `/chat/api?roomId=room123`
	 */
	idParam: z.string().default('id'),
	/**
	 * Path to forward within the Durable Object.
	 * @default '/websocket'
	 */
	forwardPath: z.string().default('/websocket')
})

// -----------------------------------------------------------------------------
// Assets Schema
// -----------------------------------------------------------------------------

/**
 * Static assets configuration.
 * Serves static files from a directory alongside your worker.
 * @see https://developers.cloudflare.com/workers/static-assets/
 */
const assetsConfigSchema = z.object({
	/** Directory containing static assets (relative to config file) */
	directory: z.string(),
	/**
	 * Optional binding name to access assets programmatically.
	 * If provided, assets can be fetched via env[binding].fetch()
	 */
	binding: z.string().optional()
}).optional()

// -----------------------------------------------------------------------------
// Observability Schema
// -----------------------------------------------------------------------------

/**
 * Observability configuration for logging and tracing.
 * Controls Worker Logs and Log Sampling.
 * @see https://developers.cloudflare.com/workers/observability/
 */
const observabilitySchema = z.object({
	/** Enable Worker Logs */
	enabled: z.boolean().optional(),
	/**
	 * Head sampling rate for logs (0-1).
	 * 1.0 = log all requests, 0.1 = log 10% of requests.
	 */
	head_sampling_rate: z.number().min(0).max(1).optional()
}).optional()

// -----------------------------------------------------------------------------
// Limits Schema
// -----------------------------------------------------------------------------

/**
 * Resource limits configuration.
 * Controls CPU time limits for worker execution.
 * @see https://developers.cloudflare.com/workers/platform/limits/
 */
const limitsSchema = z.object({
	/**
	 * Maximum CPU time in milliseconds.
	 * Only applicable to Workers with Usage Model set to Unbound.
	 */
	cpu_ms: z.number().optional()
}).optional()

// -----------------------------------------------------------------------------
// Vite and Rolldown Schema
// -----------------------------------------------------------------------------

export type DevflareRolldownOutputOptions = Omit<
	OutputOptions,
	'codeSplitting' | 'dir' | 'file' | 'format' | 'inlineDynamicImports'
>

export interface DevflareRolldownOptions
	extends Omit<RolldownOptions, 'cwd' | 'input' | 'output' | 'platform' | 'watch'> {
	output?: DevflareRolldownOutputOptions
}

const rolldownOptionsSchema = z.custom<DevflareRolldownOptions>((value) => {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}, {
	message: 'Expected Rolldown options object'
})

/**
	* Rolldown configuration for Durable Object bundling.
	* Controls Devflare's Rolldown-based DO bundler in local development.
 */
const rolldownConfigSchema = z.object({
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
}).optional()

/**
	* Vite-related configuration namespace.
	* This keeps Vite-specific configuration distinct from Rolldown/DO bundling.
	*
	* Note: raw Vite build/server configuration still belongs in `vite.config.*`.
	* Devflare currently models `plugins` here and leaves room for future Vite-side
	* config without overloading the root config shape.
	*/
const viteConfigSchema = z.object({
	/**
	 * Devflare-level Vite plugin metadata sourced from devflare.config.ts.
	 * Raw Vite plugin wiring still belongs in `vite.config.*`.
	 */
	plugins: z.array(z.unknown()).optional()
}).catchall(z.unknown()).optional()

/**
	* Legacy build alias for backward compatibility.
	* Prefer top-level `rolldown` in new configs.
	*/
const buildConfigSchema = z.object({
	/**
	 * Legacy alias for `rolldown.target`.
	 * @example 'es2022'
	 */
	target: z.string().optional(),
	/** Legacy alias for `rolldown.minify`. */
	minify: z.boolean().optional(),
	/** Legacy alias for `rolldown.sourcemap`. */
	sourcemap: z.boolean().optional(),
	/** Legacy alias for `rolldown.options`. */
	rolldownOptions: rolldownOptionsSchema.optional()
}).optional()

type LegacyBuildConfig = z.infer<typeof buildConfigSchema>

function normalizeViteConfig(
	vite: z.infer<typeof viteConfigSchema>,
	plugins: unknown[] | undefined
): z.infer<typeof viteConfigSchema> {
	const normalizedVite = {
		...(plugins !== undefined ? { plugins } : {}),
		...(vite ?? {})
	}

	return Object.keys(normalizedVite).length > 0 ? normalizedVite : undefined
}

function normalizeRolldownConfig(
	rolldown: z.infer<typeof rolldownConfigSchema>,
	build: LegacyBuildConfig | undefined
): z.infer<typeof rolldownConfigSchema> {
	const normalizedRolldown = {
		...(build?.target !== undefined ? { target: build.target } : {}),
		...(build?.minify !== undefined ? { minify: build.minify } : {}),
		...(build?.sourcemap !== undefined ? { sourcemap: build.sourcemap } : {}),
		...(build?.rolldownOptions !== undefined ? { options: build.rolldownOptions } : {}),
		...(rolldown ?? {})
	}

	return Object.keys(normalizedRolldown).length > 0 ? normalizedRolldown : undefined
}

// -----------------------------------------------------------------------------
// Migration Schema
// -----------------------------------------------------------------------------

/**
 * Durable Object migration configuration.
 * Required when changing DO class names or storage backends.
 * @see https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
 */
const migrationSchema = z.object({
	/**
	 * Migration tag (version identifier).
	 * Must be unique and in chronological order.
	 * @example 'v1', 'v2'
	 */
	tag: z.string(),
	/**
	 * New DO classes introduced in this migration.
	 * Classes that didn't exist before.
	 */
	new_classes: z.array(z.string()).optional(),
	/**
	 * Classes being renamed.
	 * State is preserved during rename.
	 */
	renamed_classes: z.array(z.object({
		from: z.string(),
		to: z.string()
	})).optional(),
	/**
	 * Classes being deleted.
	 * ⚠️ All state in these classes will be lost!
	 */
	deleted_classes: z.array(z.string()).optional(),
	/**
	 * Classes migrating to SQLite storage backend.
	 * Enables SQL API for these DO classes.
	 */
	new_sqlite_classes: z.array(z.string()).optional()
})

// -----------------------------------------------------------------------------
// Wrangler Passthrough Schema
// -----------------------------------------------------------------------------

/**
 * Wrangler configuration passthrough.
 * Allows passing arbitrary wrangler.jsonc options not covered by devflare.
 * Use sparingly — prefer native devflare options when available.
 */
const wranglerConfigSchema = z.object({
	/**
	 * Arbitrary key-value pairs passed directly to wrangler.jsonc.
	 * @example { placement: { mode: 'smart' } }
	 */
	passthrough: z.record(z.string(), z.unknown()).optional()
}).optional()

// -----------------------------------------------------------------------------
// Environment Config Schema (for env-specific overrides)
// -----------------------------------------------------------------------------

/**
 * Environment-specific configuration overrides.
 * Allows different settings per deployment environment (staging, production, etc.).
 *
 * All fields are optional — only specify what differs from the base config.
 *
 * @example
 * ```ts
 * env: {
 *   production: {
 *     vars: { LOG_LEVEL: 'error' }
 *   },
 *   staging: {
 *     vars: { LOG_LEVEL: 'debug' }
 *   }
 * }
 * ```
 */
const envConfigSchema = z.object({
	/** Override worker name for this environment */
	name: z.string().optional(),
	/** Override compatibility date */
	compatibilityDate: compatibilityDateSchema.optional(),
	/** Override compatibility flags */
	compatibilityFlags: z.array(z.string()).optional(),
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
}).partial()

const envConfigSchemaInner = envConfigSchema.extend({
	/** @deprecated Use `rolldown` instead. */
	build: buildConfigSchema,
	/** @deprecated Use `vite.plugins` instead. */
	plugins: z.array(z.unknown()).optional()
}).transform((config): z.infer<typeof envConfigSchema> => {
	const normalizedVite = normalizeViteConfig(config.vite, config.plugins)
	const normalizedRolldown = normalizeRolldownConfig(config.rolldown, config.build)
	const {
		build: _legacyBuild,
		plugins: _legacyPlugins,
		vite: _vite,
		rolldown: _rolldown,
		...rest
	} = config

	return {
		...rest,
		...(normalizedVite ? { vite: normalizedVite } : {}),
		...(normalizedRolldown ? { rolldown: normalizedRolldown } : {})
	}
})

// -----------------------------------------------------------------------------
// Main Config Schema
// -----------------------------------------------------------------------------

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
 *
 * @example Minimal configuration
 * ```ts
 * import { defineConfig } from 'devflare/config'
 *
 * export default defineConfig({
 *   name: 'my-worker'
 * })
 * ```
 *
 * @example Full configuration
 * ```ts
 * export default defineConfig({
 *   name: 'api-worker',
 *   files: { fetch: 'src/fetch.ts' },
 *   bindings: {
 *     kv: { CACHE: 'cache-kv' },
 *     d1: { DB: 'main-database' },
 *     durableObjects: { COUNTER: 'Counter' }
 *   }
 * })
 * ```
 */
const canonicalConfigSchema = z.object({
	/**
	 * Worker name (required).
	 * Used as the deployment target and in URLs.
	 * @example 'my-api-worker'
	 */
	name: z.string({
		required_error: 'Worker name is required'
	}),

	/**
	 * Cloudflare account ID.
	 * Required for remote bindings (AI, Vectorize, etc.).
	 * Can also be set via CLOUDFLARE_ACCOUNT_ID environment variable.
	 */
	accountId: z.string().optional(),

	/**
	 * Cloudflare Workers compatibility date.
	 * @default Current date (YYYY-MM-DD)
	 * @see https://developers.cloudflare.com/workers/configuration/compatibility-dates/
	 */
	compatibilityDate: compatibilityDateSchema.optional().default(getCurrentDate),

	/**
	 * Compatibility flags to enable additional features.
	 * @default ['nodejs_compat', 'nodejs_als'] (always included)
	 * @see https://developers.cloudflare.com/workers/configuration/compatibility-dates/#compatibility-flags
	 */
	compatibilityFlags: z.array(z.string()).optional().transform((flags = []) => {
		const merged = new Set([...FORCED_COMPATIBILITY_FLAGS, ...flags])
		return [...merged]
	}),

	/**
	 * File handlers configuration.
	 * Maps handler types to source file paths.
	 */
	files: filesSchema,

	/**
	 * Bindings to Cloudflare services.
	 * KV, D1, R2, Durable Objects, Queues, Services, and more.
	 */
	bindings: bindingsSchema,

	/**
	 * Trigger configuration (cron schedules).
	 */
	triggers: triggersSchema,

	/**
	 * Environment variables.
	 * Exposed via env.VAR_NAME in the worker.
	 */
	vars: z.record(z.string(), z.string()).optional(),

	/**
	 * Secret declarations.
	 * Use this to declare expected runtime secret bindings and validation rules.
	 * Secret values are supplied by Wrangler/Cloudflare runtime configuration.
	 */
	secrets: z.record(z.string(), secretConfigSchema).optional(),

	/**
	 * Deployment routes.
	 * URL patterns that trigger this worker.
	 */
	routes: z.array(routeConfigSchema).optional(),

	/**
	 * WebSocket routes for dev mode DO proxying.
	 * Enables WebSocket connections to Durable Objects locally.
	 */
	wsRoutes: z.array(wsRouteConfigSchema).optional(),

	/**
	 * Static assets configuration.
	 */
	assets: assetsConfigSchema,

	/**
	 * Resource limits (CPU time).
	 */
	limits: limitsSchema,

	/**
	 * Observability settings (logging, tracing).
	 */
	observability: observabilitySchema,

	/**
	 * Durable Object migrations.
	 * Required when changing DO class names or storage backends.
	 */
	migrations: z.array(migrationSchema).optional(),

	/**
	 * Rolldown configuration for Durable Object bundling.
	 */
	rolldown: rolldownConfigSchema,

	/**
	 * Vite-related configuration namespace.
	 * Use `vite.config.*` for raw Vite config, and this field for Devflare-level
	 * Vite-side metadata and extension points.
	 */
	vite: viteConfigSchema,

	/**
	 * Environment-specific configuration overrides.
	 * @example { staging: { vars: { DEBUG: 'true' } } }
	 */
	env: z.record(z.string(), envConfigSchemaInner).optional(),

	/**
	 * Wrangler passthrough for unsupported options.
	 */
	wrangler: wranglerConfigSchema
})


export const configSchema = canonicalConfigSchema.extend({
	/**
	 * @deprecated Use `rolldown` instead.
	 */
	build: buildConfigSchema,

	/**
	 * @deprecated Use `vite.plugins` instead.
	 */
	plugins: z.array(z.unknown()).optional()
}).transform((config): z.infer<typeof canonicalConfigSchema> => {
	const normalizedVite = normalizeViteConfig(config.vite, config.plugins)
	const normalizedRolldown = normalizeRolldownConfig(config.rolldown, config.build)
	const {
		build: _legacyBuild,
		plugins: _legacyPlugins,
		vite: _vite,
		rolldown: _rolldown,
		...rest
	} = config

	return {
		...rest,
		...(normalizedVite ? { vite: normalizedVite } : {}),
		...(normalizedRolldown ? { rolldown: normalizedRolldown } : {})
	}
})

// -----------------------------------------------------------------------------
// Type Exports
// -----------------------------------------------------------------------------

/** Output type after Zod validation and transforms */
export type DevflareConfig = z.output<typeof configSchema>

/** Input type for defineConfig - before Zod transforms apply defaults */
export type DevflareConfigInput = z.input<typeof configSchema>

export type DevflareEnvConfig = z.output<typeof envConfigSchemaInner>
export type BrowserBindings = z.infer<typeof browserBindingSchema>
export type D1Binding = z.infer<typeof d1BindingSchema>
export type KVBinding = z.infer<typeof kvBindingSchema>
export type DurableObjectBinding = z.infer<typeof durableObjectBindingSchema>
export type QueueConsumer = z.infer<typeof queueConsumerSchema>
export type QueuesConfig = z.infer<typeof queuesConfigSchema>
export type ServiceBinding = z.infer<typeof serviceBindingSchema>
export type RouteConfig = z.infer<typeof routeConfigSchema>
export type WsRouteConfig = z.infer<typeof wsRouteConfigSchema>
export type AssetsConfig = z.infer<typeof assetsConfigSchema>
export type ViteConfig = z.output<typeof viteConfigSchema>
export type RolldownConfig = z.output<typeof rolldownConfigSchema>
/** @deprecated Use `RolldownConfig` instead. This matches the legacy `build` shape. */
export type BuildConfig = LegacyBuildConfig
export type MigrationConfig = z.infer<typeof migrationSchema>

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Normalized DO binding shape — consistent representation for all DO binding variants.
 * Used throughout devflare for DO configuration handling.
 */
export interface NormalizedDOBinding {
	/** The DO class name (e.g., 'Counter') */
	className: string
	/** Optional script name — file path for local DOs, worker name for cross-worker DOs */
	scriptName?: string
	/** Reference result for cross-worker DOs (from ref().DO_NAME) */
	__ref?: unknown
}

export interface NormalizedD1Binding {
	/** Resolved D1 database ID when one is already known */
	databaseId?: string
	/** Stable D1 database name when the binding is configured by name */
	name?: string
}

export interface NormalizedKVBinding {
	/** Resolved KV namespace ID when one is already known */
	namespaceId?: string
	/** Stable KV namespace name when the binding is configured by name */
	name?: string
}

export function getSingleBrowserBindingName(bindings: BrowserBindings | undefined): string | undefined {
	const bindingNames = getBrowserBindingNames(bindings)

	if (bindingNames.length === 0) {
		return undefined
	}

	if (bindingNames.length > 1) {
		throw new Error(formatBrowserBindingLimitMessage(bindingNames))
	}

	return bindingNames[0]
}

/**
 * Normalize a DO binding to its object form.
 * Handles all DO binding variants:
 * - String: 'Counter' → { className: 'Counter' }
 * - Object: { className, scriptName? } → as-is
 * - Ref: { className, scriptName, __ref } → as-is (cross-worker DO)
 */
export function normalizeDOBinding(config: DurableObjectBinding): NormalizedDOBinding {
	if (typeof config === 'string') {
		return { className: config }
	}
	return {
		className: config.className,
		scriptName: config.scriptName,
		__ref: (config as { __ref?: unknown }).__ref
	}
}

/**
 * Normalize a D1 binding to a consistent object form.
	 * String bindings are treated as stable database names.
 */
export function normalizeD1Binding(config: D1Binding): NormalizedD1Binding {
	if (typeof config === 'string') {
		return { name: config }
	}

	if ('id' in config) {
		return { databaseId: config.id }
	}

	return { name: config.name }
}

/**
 * Normalize a KV binding to a consistent object form.
 * String bindings are treated as stable namespace names.
 */
export function normalizeKVBinding(config: KVBinding): NormalizedKVBinding {
	if (typeof config === 'string') {
		return { name: config }
	}

	if ('id' in config) {
		return { namespaceId: config.id }
	}

	return { name: config.name }
}

/**
 * Get the identifier Devflare should use for local/runtime KV wiring.
 * Local Miniflare/workerd flows can use either a real namespace ID or the stable namespace name.
 */
export function getLocalKVNamespaceIdentifier(config: KVBinding): string {
	const normalized = normalizeKVBinding(config)
	return normalized.namespaceId ?? normalized.name ?? ''
}

/**
 * Get the identifier Devflare should use for local/runtime D1 wiring.
 * Local Miniflare/workerd flows can use either a real ID or the stable database name.
 */
export function getLocalD1DatabaseIdentifier(config: D1Binding): string {
	const normalized = normalizeD1Binding(config)
	return normalized.databaseId ?? normalized.name ?? ''
}
