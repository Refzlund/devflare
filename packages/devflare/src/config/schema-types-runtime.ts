export interface PreviewConfigInput {
	/**
	 * Whether preview-generated config should include cron triggers.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * previews: { includeCrons: true }
	 * ```
	 */
	includeCrons?: boolean
}

/**
 * Dev server configuration for `devflare dev`.
 *
 * Controls the host and port the local Miniflare runtime instance binds to.
 * Development-only; never emitted to compiled Wrangler output. CLI flags
 * (`--runtime-port`, `--runtime-host`) and environment variables
 * (`DEVFLARE_RUNTIME_PORT`, `DEVFLARE_RUNTIME_HOST`) take precedence.
 */
export interface ServerConfigInput {
	/**
	 * Host the local dev runtime binds to.
	 *
	 * @default `'127.0.0.1'`
	 *
	 * @example
	 * ```ts
	 * server: { host: '0.0.0.0' }
	 * ```
	 */
	host?: string

	/**
	 * Port the local dev runtime binds to.
	 *
	 * @default `8787`
	 *
	 * @example
	 * ```ts
	 * server: { port: 3000 }
	 * ```
	 */
	port?: number
}

/**
 * Source file discovery for Worker handlers and generated support files.
 */
export interface FilesConfigInput {
	/**
	 * HTTP fetch entrypoint source file or `false` to disable fetch handler
	 * discovery.
	 *
	 * @default Auto-discovered from conventional fetch handler paths.
	 *
	 * @example
	 * ```ts
	 * files: { fetch: 'src/fetch.ts' }
	 * ```
	 */
	fetch?: string | false

	/**
	 * Queue handler source file or `false` to disable queue handler discovery.
	 *
	 * @default Auto-discovered from conventional queue handler paths.
	 *
	 * @example
	 * ```ts
	 * files: { queue: 'src/queue.ts' }
	 * ```
	 */
	queue?: string | false

	/**
	 * Scheduled event handler source file or `false` to disable scheduled
	 * handler discovery.
	 *
	 * @default Auto-discovered from conventional scheduled handler paths.
	 *
	 * @example
	 * ```ts
	 * files: { scheduled: 'src/scheduled.ts' }
	 * ```
	 */
	scheduled?: string | false

	/**
	 * Email event handler source file or `false` to disable email handler
	 * discovery.
	 *
	 * @default Auto-discovered from conventional email handler paths.
	 *
	 * @example
	 * ```ts
	 * files: { email: 'src/email.ts' }
	 * ```
	 */
	email?: string | false

	/**
	 * Tail event handler source file or `false` to disable tail handler
	 * discovery.
	 *
	 * @default Auto-discovered from conventional tail handler paths.
	 *
	 * @example
	 * ```ts
	 * files: { tail: 'src/tail.ts' }
	 * ```
	 */
	tail?: string | false

	/**
	 * Durable Object source file glob or `false` to disable Durable Object
	 * class discovery.
	 *
	 * @default Auto-discovered from conventional Durable Object file paths.
	 *
	 * @example
	 * ```ts
	 * files: { durableObjects: 'src/do.*.ts' }
	 * ```
	 */
	durableObjects?: string | false

	/**
	 * Named WorkerEntrypoint source file glob or `false` to disable entrypoint
	 * discovery.
	 *
	 * @default Auto-discovered from conventional entrypoint file paths.
	 *
	 * @example
	 * ```ts
	 * files: { entrypoints: 'src/ep.*.ts' }
	 * ```
	 */
	entrypoints?: string | false

	/**
	 * Workflow source file glob or `false` to disable workflow discovery.
	 *
	 * @default Auto-discovered from conventional workflow file paths.
	 *
	 * @example
	 * ```ts
	 * files: { workflows: 'src/wf.*.ts' }
	 * ```
	 */
	workflows?: string | false

	/**
	 * Built-in route-file discovery configuration or `false` to disable route
	 * file discovery.
	 *
	 * @default Auto-discovered from conventional route file paths.
	 *
	 * @example
	 * ```ts
	 * files: {
	 *   routes: { dir: 'src/routes', prefix: '/api' }
	 * }
	 * ```
	 */
	routes?: RouteTreeConfigInput | false

	/**
	 * Internal transport worker source file. Set `null` to suppress transport
	 * file generation when a command supports doing so.
	 *
	 * @default Devflare-managed transport file.
	 *
	 * @example
	 * ```ts
	 * files: { transport: 'src/.devflare/transport.ts' }
	 * ```
	 */
	transport?: string | null
}

/**
 * Built-in file router discovery configuration.
 */
export interface RouteTreeConfigInput {
	/**
	 * Directory containing route files.
	 *
	 * @example
	 * ```ts
	 * routes: { dir: 'src/routes' }
	 * ```
	 */
	dir: string

	/**
	 * URL prefix added before discovered route paths.
	 *
	 * @default No prefix.
	 *
	 * @example
	 * ```ts
	 * routes: { dir: 'src/routes', prefix: '/api' }
	 * ```
	*/
	prefix?: string
}

/**
 * Trigger configuration for scheduled events.
 */
export interface TriggersConfigInput {
	/**
	 * Cron expressions that invoke the Worker scheduled handler.
	 *
	 * @example
	 * ```ts
	 * triggers: { crons: ['0 * * * *'] }
	 * ```
	 */
	crons?: string[]
}

/**
 * Wrangler module rule configuration.
 */
export interface ModuleRuleConfigInput {
	/**
	 * Module rule type.
	 *
	 * @example
	 * ```ts
	 * type: 'Text'
	 * ```
	 */
	type: 'ESModule' | 'CommonJS' | 'CompiledWasm' | 'Text' | 'Data'

	/**
	 * Glob patterns matched by this module rule.
	 *
	 * @example
	 * ```ts
	 * globs: ['content/*.txt']
	 * ```
	 */
	globs: string[]

	/**
	 * Whether Wrangler should continue evaluating later rules after this one.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * fallthrough: true
	 * ```
	 */
	fallthrough?: boolean
}

/**
 * Tail Worker consumer configuration.
 */
export type TailConsumerConfigInput = string | TailConsumerObjectConfigInput

/**
 * Tail Worker consumer object form.
 */
export interface TailConsumerObjectConfigInput {
	/**
	 * Tail Worker service name.
	 *
	 * @example
	 * ```ts
	 * service: 'trace-worker'
	 * ```
	 */
	service: string

	/**
	 * Optional Tail Worker environment.
	 *
	 * @default Target worker default environment.
	 *
	 * @example
	 * ```ts
	 * environment: 'production'
	 * ```
	 */
	environment?: string
}

/**
 * Secret declaration options.
 */
export interface SecretConfigInput {
	/**
	 * Whether the secret is required during validation.
	 *
	 * @default `true`
	 *
	 * @example
	 * ```ts
	 * secrets: { API_TOKEN: { required: true } }
	 * ```
	 */
	required?: boolean
}

/**
 * Cloudflare Worker route configuration.
 */
export interface RouteConfigInput {
	/**
	 * Route pattern handled by the Worker.
	 *
	 * @example
	 * ```ts
	 * { pattern: 'api.example.com/*' }
	 * ```
	 */
	pattern: string

	/**
	 * Zone name for the route.
	 *
	 * @default Cloudflare resolves the zone from the route pattern when
	 * possible.
	 *
	 * @example
	 * ```ts
	 * { pattern: 'api.example.com/*', zone_name: 'example.com' }
	 * ```
	 */
	zone_name?: string

	/**
	 * Zone ID for the route.
	 *
	 * @default Cloudflare resolves the zone from the route pattern when
	 * possible.
	 *
	 * @example
	 * ```ts
	 * { pattern: 'api.example.com/*', zone_id: 'zone-id' }
	 * ```
	 */
	zone_id?: string

	/**
	 * Whether this route is a custom domain route instead of a wildcard route.
	 * Custom Domains attach the Worker to the whole hostname, so the pattern
	 * must be a bare host such as `worker.example.com`. Use a normal route
	 * with `zone_name` or `zone_id` for wildcard or path patterns.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * routes: [
	 *   { pattern: 'worker.example.com', custom_domain: true }
	 * ]
	 * ```
	 */
	custom_domain?: boolean
}

/**
 * Local WebSocket route for Durable Object proxying.
 */
export interface WsRouteConfigInput {
	/**
	 * Local route pattern.
	 *
	 * @example
	 * ```ts
	 * pattern: '/rooms/:id'
	 * ```
	 */
	pattern: string

	/**
	 * Durable Object namespace binding name that should receive the socket.
	 *
	 * @example
	 * ```ts
	 * doNamespace: 'ROOM'
	 * ```
	 */
	doNamespace: string

	/**
	 * Route parameter used as the Durable Object ID.
	 *
	 * @default `'id'`
	 *
	 * @example
	 * ```ts
	 * idParam: 'roomId'
	 * ```
	 */
	idParam?: string

	/**
	 * Path forwarded to the Durable Object when the socket is proxied.
	 *
	 * @default `'/websocket'`
	 *
	 * @example
	 * ```ts
	 * forwardPath: '/connect'
	 * ```
	 */
	forwardPath?: string
}

/**
 * Static assets configuration.
 */
export interface AssetsConfigInput {
	/**
	 * Directory containing static assets.
	 *
	 * @example
	 * ```ts
	 * assets: { directory: './dist' }
	 * ```
	 */
	directory: string

	/**
	 * Optional asset binding name exposed to the Worker.
	 *
	 * @default Wrangler default binding behavior.
	 *
	 * @example
	 * ```ts
	 * assets: { directory: './dist', binding: 'ASSETS' }
	 * ```
	 */
	binding?: string

	/**
	 * HTML path handling behavior.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * html_handling: 'auto-trailing-slash'
	 * ```
	 */
	html_handling?: 'auto-trailing-slash' | 'force-trailing-slash' | 'drop-trailing-slash' | 'none'

	/**
	 * Not-found handling behavior.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * not_found_handling: 'single-page-application'
	 * ```
	 */
	not_found_handling?: 'single-page-application' | '404-page' | 'none'

	/**
	 * Whether the Worker should run before serving assets, or the asset path
	 * patterns that should run the Worker first.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * run_worker_first: ['/api/*']
	 * ```
	 */
	run_worker_first?: boolean | string[]
}

/**
 * Cloudflare Container configuration.
 */
export interface ContainerConfigInput {
	/**
	 * Container class name exported by the Worker.
	 *
	 * @example
	 * ```ts
	 * className: 'RendererContainer'
	 * ```
	 */
	className: string

	/**
	 * Container image reference or build target.
	 *
	 * @example
	 * ```ts
	 * image: './Dockerfile'
	 * ```
	 */
	image: string

	/**
	 * Maximum number of container instances.
	 *
	 * @default Cloudflare Containers default behavior.
	 *
	 * @example
	 * ```ts
	 * maxInstances: 3
	 * ```
	 */
	maxInstances?: number

	/**
	 * Container instance type.
	 *
	 * @default Cloudflare Containers default behavior.
	 *
	 * @example
	 * ```ts
	 * instanceType: 'standard'
	 * ```
	 */
	instanceType?: string

	/**
	 * Optional generated container name.
	 *
	 * @default Devflare derives the name from the class when possible.
	 *
	 * @example
	 * ```ts
	 * name: 'renderer'
	 * ```
	 */
	name?: string

	/**
	 * Docker build context.
	 *
	 * @default Container image path default.
	 *
	 * @example
	 * ```ts
	 * imageBuildContext: './containers/renderer'
	 * ```
	 */
	imageBuildContext?: string

	/**
	 * Build-time variables for the container image.
	 *
	 * @default No image variables.
	 *
	 * @example
	 * ```ts
	 * imageVars: { NODE_ENV: 'production' }
	 * ```
	 */
	imageVars?: Record<string, string>

	/**
	 * Active grace period in seconds during rollout.
	 *
	 * @default Cloudflare Containers default behavior.
	 *
	 * @example
	 * ```ts
	 * rolloutActiveGracePeriod: 60
	 * ```
	 */
	rolloutActiveGracePeriod?: number

	/**
	 * Rollout step percentage or step percentages.
	 *
	 * @default Cloudflare Containers default behavior.
	 *
	 * @example
	 * ```ts
	 * rolloutStepPercentage: [10, 50, 100]
	 * ```
	 */
	rolloutStepPercentage?: number | number[]
}

/**
 * Worker placement configuration.
 */
export type PlacementConfigInput =
	| SmartPlacementConfigInput
	| TargetedRegionPlacementConfigInput
	| TargetedHostPlacementConfigInput
	| TargetedHostnamePlacementConfigInput

/**
 * Smart Placement configuration.
 */
export interface SmartPlacementConfigInput {
	/**
	 * Smart Placement mode.
	 *
	 * @example
	 * ```ts
	 * mode: 'smart'
	 * ```
	 */
	mode: 'off' | 'smart'

	/**
	 * Optional placement hint. Only valid when `mode` is `smart`.
	 *
	 * @default No placement hint.
	 *
	 * @example
	 * ```ts
	 * hint: 'wnam'
	 * ```
	 */
	hint?: string
}

/**
 * Targeted placement by Cloudflare region.
 */
export interface TargetedRegionPlacementConfigInput {
	/**
	 * Targeted placement mode.
	 *
	 * @default `'targeted'`
	 *
	 * @example
	 * ```ts
	 * mode: 'targeted'
	 * ```
	 */
	mode?: 'targeted'

	/**
	 * Target Cloudflare region.
	 *
	 * @example
	 * ```ts
	 * region: 'wnam'
	 * ```
	 */
	region: string
}

/**
 * Targeted placement by host.
 */
export interface TargetedHostPlacementConfigInput {
	/**
	 * Targeted placement mode.
	 *
	 * @default `'targeted'`
	 *
	 * @example
	 * ```ts
	 * mode: 'targeted'
	 * ```
	 */
	mode?: 'targeted'

	/**
	 * Target host.
	 *
	 * @example
	 * ```ts
	 * host: 'db.internal'
	 * ```
	 */
	host: string
}

/**
 * Targeted placement by hostname.
 */
export interface TargetedHostnamePlacementConfigInput {
	/**
	 * Targeted placement mode.
	 *
	 * @default `'targeted'`
	 *
	 * @example
	 * ```ts
	 * mode: 'targeted'
	 * ```
	 */
	mode?: 'targeted'

	/**
	 * Target hostname.
	 *
	 * @example
	 * ```ts
	 * hostname: 'api.example.com'
	 * ```
	 */
	hostname: string
}

/**
 * Worker resource limits.
 */
export interface LimitsConfigInput {
	/**
	 * CPU time limit in milliseconds.
	 *
	 * @default Cloudflare Workers account and plan default.
	 *
	 * @example
	 * ```ts
	 * cpu_ms: 50
	 * ```
	 */
	cpu_ms?: number

	/**
	 * Subrequest limit.
	 *
	 * @default Cloudflare Workers account and plan default.
	 *
	 * @example
	 * ```ts
	 * subrequests: 1000
	 * ```
	 */
	subrequests?: number
}

/**
 * Worker logs and traces observability settings.
 */
export interface ObservabilityConfigInput {
	/**
	 * Enable observability.
	 *
	 * @default Cloudflare default behavior.
	 *
	 * @example
	 * ```ts
	 * enabled: true
	 * ```
	 */
	enabled?: boolean

	/**
	 * Head sampling rate from `0` to `1`.
	 *
	 * @default Cloudflare default sampling behavior.
	 *
	 * @example
	 * ```ts
	 * head_sampling_rate: 0.1
	 * ```
	 */
	head_sampling_rate?: number

	/**
	 * Log-specific observability settings.
	 *
	 * @default Cloudflare default log behavior.
	 *
	 * @example
	 * ```ts
	 * logs: { enabled: true, invocation_logs: true }
	 * ```
	 */
	logs?: ObservabilityLogsConfigInput

	/**
	 * Trace-specific observability settings.
	 *
	 * @default Cloudflare default trace behavior.
	 *
	 * @example
	 * ```ts
	 * traces: { enabled: true, head_sampling_rate: 0.05 }
	 * ```
	 */
	traces?: ObservabilityTracesConfigInput
}

/**
 * Worker log observability settings.
 */
export interface ObservabilityLogsConfigInput {
	/**
	 * Enable log collection.
	 *
	 * @default Cloudflare default log behavior.
	 *
	 * @example
	 * ```ts
	 * enabled: true
	 * ```
	 */
	enabled?: boolean

	/**
	 * Log head sampling rate from `0` to `1`.
	 *
	 * @default Cloudflare default sampling behavior.
	 *
	 * @example
	 * ```ts
	 * head_sampling_rate: 0.1
	 * ```
	 */
	head_sampling_rate?: number

	/**
	 * Include invocation logs.
	 *
	 * @default Cloudflare default log behavior.
	 *
	 * @example
	 * ```ts
	 * invocation_logs: true
	 * ```
	 */
	invocation_logs?: boolean

	/**
	 * Persist logs.
	 *
	 * @default Cloudflare default persistence behavior.
	 *
	 * @example
	 * ```ts
	 * persist: true
	 * ```
	 */
	persist?: boolean

	/**
	 * Log destination names.
	 *
	 * @default Cloudflare default destinations.
	 *
	 * @example
	 * ```ts
	 * destinations: ['cloudflare']
	 * ```
	 */
	destinations?: string[]
}

/**
 * Worker trace observability settings.
 */
export interface ObservabilityTracesConfigInput {
	/**
	 * Enable trace collection.
	 *
	 * @default Cloudflare default trace behavior.
	 *
	 * @example
	 * ```ts
	 * enabled: true
	 * ```
	 */
	enabled?: boolean

	/**
	 * Trace head sampling rate from `0` to `1`.
	 *
	 * @default Cloudflare default sampling behavior.
	 *
	 * @example
	 * ```ts
	 * head_sampling_rate: 0.1
	 * ```
	 */
	head_sampling_rate?: number

	/**
	 * Persist traces.
	 *
	 * @default Cloudflare default persistence behavior.
	 *
	 * @example
	 * ```ts
	 * persist: true
	 * ```
	 */
	persist?: boolean

	/**
	 * Trace destination names.
	 *
	 * @default Cloudflare default destinations.
	 *
	 * @example
	 * ```ts
	 * destinations: ['cloudflare']
	 * ```
	 */
	destinations?: string[]
}

/**
 * Durable Object migration configuration.
 */
export interface MigrationConfigInput {
	/**
	 * Unique migration tag.
	 *
	 * @example
	 * ```ts
	 * tag: 'v1'
	 * ```
	 */
	tag: string

	/**
	 * New Durable Object class names using legacy storage.
	 *
	 * @default No new legacy-storage classes.
	 *
	 * @example
	 * ```ts
	 * new_classes: ['Counter']
	 * ```
	 */
	new_classes?: string[]

	/**
	 * Renamed Durable Object classes.
	 *
	 * @default No renamed classes.
	 *
	 * @example
	 * ```ts
	 * renamed_classes: [{ from: 'OldCounter', to: 'Counter' }]
	 * ```
	 */
	renamed_classes?: RenamedClassMigrationInput[]

	/**
	 * Deleted Durable Object class names.
	 *
	 * @default No deleted classes.
	 *
	 * @example
	 * ```ts
	 * deleted_classes: ['OldCounter']
	 * ```
	 */
	deleted_classes?: string[]

	/**
	 * New Durable Object class names using SQLite storage.
	 *
	 * @default No new SQLite classes.
	 *
	 * @example
	 * ```ts
	 * new_sqlite_classes: ['Counter']
	 * ```
	 */
	new_sqlite_classes?: string[]
}

/**
 * Durable Object class rename migration entry.
 */
export interface RenamedClassMigrationInput {
	/**
	 * Previous Durable Object class name.
	 *
	 * @example
	 * ```ts
	 * from: 'OldCounter'
	 * ```
	 */
	from: string

	/**
	 * New Durable Object class name.
	 *
	 * @example
	 * ```ts
	 * to: 'Counter'
	 * ```
	*/
	to: string
}
