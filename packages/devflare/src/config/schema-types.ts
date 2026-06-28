import type { DevflareVarsInput } from './env-vars'
import type { BindingsConfigInput } from './schema-types-bindings'
import type {
	RolldownConfigInput,
	ViteConfigInput,
	WranglerConfigInput
} from './schema-types-build'
import type {
	AssetsConfigInput,
	ContainerConfigInput,
	FilesConfigInput,
	LimitsConfigInput,
	MigrationConfigInput,
	ModuleRuleConfigInput,
	ObservabilityConfigInput,
	PlacementConfigInput,
	PreviewConfigInput,
	RouteConfigInput,
	SecretConfigInput,
	ServerConfigInput,
	TailConsumerConfigInput,
	TriggersConfigInput,
	WsRouteConfigInput
} from './schema-types-runtime'

/**
 * Authoring input accepted by `defineConfig()`.
 *
 * This type is intentionally written by hand instead of inferred from the Zod
 * schema so editors can surface property documentation, defaults, and examples
 * while users write `devflare.config.ts`.
 *
 * @example
 * ```ts
 * import { defineConfig, ref } from 'devflare/config'
 *
 * const api = ref('api-worker', () => import('../api/devflare.config'))
 *
 * export default defineConfig({
 *   name: 'site-worker',
 *   compatibilityDate: '2026-05-01',
 *   files: { fetch: 'src/fetch.ts' },
 *   bindings: {
 *     services: {
 *       API: api.worker('ApiEntrypoint')
 *     }
 *   },
 *   routes: [
 *     { pattern: 'example.com', custom_domain: true }
 *   ]
 * })
 * ```
 */
export interface DevflareConfigInput {
	/**
	 * Worker name used for local service identity, generated Wrangler config,
	 * and deploy targets.
	 *
	 * @example
	 * ```ts
	 * name: 'my-worker'
	 * ```
	 */
	name: string

	/**
	 * Cloudflare account ID used when resolving account-backed resources such
	 * as D1 databases, KV namespaces, R2 buckets, AI, Vectorize, and Hyperdrive.
	 *
	 * @example
	 * ```ts
	 * accountId: '023e105f4ecef8ad9ca31a8372d0c353'
	 * ```
	 */
	accountId?: string

	/**
	 * Default Cloudflare Secrets Store ID for shorthand
	 * `bindings.secretsStore` entries.
	 *
	 * @example
	 * ```ts
	 * secretsStoreId: 'secrets-store-uuid'
	 * ```
	 */
	secretsStoreId?: string

	/**
	 * Cloudflare Workers compatibility date in `YYYY-MM-DD` format.
	 *
	 * @default Current date when Devflare parses the config.
	 *
	 * @example
	 * ```ts
	 * compatibilityDate: '2026-05-01'
	 * ```
	 */
	compatibilityDate?: string

	/**
	 * Additional Workers compatibility flags. Devflare always includes
	 * `nodejs_compat` and `nodejs_als` after normalization.
	 *
	 * @default `['nodejs_compat', 'nodejs_als']`
	 *
	 * @example
	 * ```ts
	 * compatibilityFlags: ['global_fetch_strictly_public']
	 * ```
	 */
	compatibilityFlags?: string[]

	/**
	 * Preview-specific Devflare behavior.
	 *
	 * @default `{ includeCrons: false }`
	 *
	 * @example
	 * ```ts
	 * previews: { includeCrons: true }
	 * ```
	 */
	previews?: PreviewConfigInput

	/**
	 * Dev server settings for `devflare dev`. Sets the host and port the local
	 * Miniflare runtime instance binds to. Development-only; never affects
	 * deployed Workers. CLI flags and environment variables take precedence.
	 *
	 * @default `{ host: '127.0.0.1', port: 8787 }`
	 *
	 * @example
	 * ```ts
	 * server: { host: '0.0.0.0', port: 3000 }
	 * ```
	 */
	server?: ServerConfigInput

	/**
	 * Source file discovery for Worker handlers, Durable Objects, entrypoints,
	 * workflows, route files, and the internal transport worker.
	 *
	 * @default Devflare auto-discovers conventional `src/*` handler files.
	 *
	 * @example
	 * ```ts
	 * files: {
	 *   fetch: 'src/fetch.ts',
	 *   queue: false,
	 *   entrypoints: 'src/ep.*.ts'
	 * }
	 * ```
	 */
	files?: FilesConfigInput

	/**
	 * Cloudflare service bindings exposed on `env`, including KV, D1, R2,
	 * Durable Objects, Queues, service bindings, Hyperdrive, AI, and related
	 * platform resources.
	 *
	 * @example
	 * ```ts
	 * bindings: {
	 *   kv: { CACHE: 'my-cache' },
	 *   services: { API: apiWorker.worker('ApiEntrypoint') }
	 * }
	 * ```
	 */
	bindings?: BindingsConfigInput

	/**
	 * Scheduled trigger configuration for cron events.
	 *
	 * @example
	 * ```ts
	 * triggers: {
	 *   crons: ['0,15,30,45 * * * *']
	 * }
	 * ```
	 */
	triggers?: TriggersConfigInput

	/**
	 * Wrangler module rules for non-JavaScript imports and additional modules.
	 *
	 * @example
	 * ```ts
	 * rules: [
	 *   { type: 'Text', globs: ['content/*.txt'] }
	 * ]
	 * ```
	 */
	rules?: ModuleRuleConfigInput[]

	/**
	 * Whether Wrangler should include additional files matching configured
	 * module rules.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * findAdditionalModules: true
	 * ```
	 */
	findAdditionalModules?: boolean

	/**
	 * Base directory used by Wrangler module rule discovery.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * baseDir: './src'
	 * ```
	 */
	baseDir?: string

	/**
	 * Whether Wrangler should preserve emitted file names for bundled modules.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * preserveFileNames: true
	 * ```
	 */
	preserveFileNames?: boolean

	/**
	 * Send Trace Events from this Worker to Workers Logpush. Devflare does not
	 * create a corresponding Logpush job automatically.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * logpush: true
	 * ```
	 */
	logpush?: boolean

	/**
	 * Whether to include source maps when uploading this Worker.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * uploadSourceMaps: true
	 * ```
	 */
	uploadSourceMaps?: boolean

	/**
	 * Whether to keep dashboard-managed vars when Wrangler deploys this Worker.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * keepVars: true
	 * ```
	 */
	keepVars?: boolean

	/**
	 * Tail Workers that receive traces emitted by this Worker.
	 *
	 * @example
	 * ```ts
	 * tailConsumers: ['trace-worker']
	 * ```
	 */
	tailConsumers?: TailConsumerConfigInput[]

	/**
	 * Runtime variables exposed on `env` and on the typed `vars` helper.
	 * Values may be literals, nested objects, or `env.NAME` descriptors that
	 * Devflare resolves from `.env` / `.env.dev` files and `process.env`.
	 *
	 * @example
	 * ```ts
	 * import { env } from 'devflare/config'
	 *
	 * vars: {
	 *   APP_ENV: 'development',
	 *   API_ORIGIN: 'https://api.example.com',
	 *   mongo: {
	 *     uri: env.MONGOURI,
	 *     database: env.MONGODATABASE
	 *   },
	 *   retries: env.RETRIES.parse(Number)
	 * }
	 * ```
	 */
	vars?: DevflareVarsInput

	/**
	 * Secret bindings that Devflare validates and emits into generated config.
	 * Values are declarations, not the secret values themselves.
	 *
	 * @example
	 * ```ts
	 * secrets: {
	 *   STRIPE_SECRET_KEY: { required: true }
	 * }
	 * ```
	 */
	secrets?: Record<string, SecretConfigInput>

	/**
	 * Cloudflare deployment routes for the Worker.
	 *
	 * @example
	 * ```ts
	 * routes: [
	 *   { pattern: 'api.example.com', custom_domain: true }
	 * ]
	 * ```
	 */
	routes?: RouteConfigInput[]

	/**
	 * Local development WebSocket routes that proxy requests to Durable
	 * Objects.
	 *
	 * @example
	 * ```ts
	 * wsRoutes: [
	 *   { pattern: '/rooms/:id', doNamespace: 'ROOM' }
	 * ]
	 * ```
	 */
	wsRoutes?: WsRouteConfigInput[]

	/**
	 * Static assets configuration compiled to Wrangler's assets settings.
	 *
	 * @example
	 * ```ts
	 * assets: {
	 *   directory: './dist',
	 *   not_found_handling: 'single-page-application'
	 * }
	 * ```
	 */
	assets?: AssetsConfigInput

	/**
	 * Cloudflare Containers launched alongside the Worker.
	 *
	 * @example
	 * ```ts
	 * containers: [
	 *   { className: 'RendererContainer', image: './Dockerfile' }
	 * ]
	 * ```
	 */
	containers?: ContainerConfigInput[]

	/**
	 * Worker placement configuration for Smart Placement or targeted
	 * placement.
	 *
	 * @example
	 * ```ts
	 * placement: { mode: 'smart', hint: 'wnam' }
	 * ```
	 */
	placement?: PlacementConfigInput

	/**
	 * Worker resource limits.
	 *
	 * @default Cloudflare Workers account and plan defaults.
	 *
	 * @example
	 * ```ts
	 * limits: { cpu_ms: 50 }
	 * ```
	 */
	limits?: LimitsConfigInput

	/**
	 * Observability settings for Worker logs and traces.
	 *
	 * @example
	 * ```ts
	 * observability: {
	 *   enabled: true,
	 *   head_sampling_rate: 0.1
	 * }
	 * ```
	 */
	observability?: ObservabilityConfigInput

	/**
	 * Durable Object migration declarations.
	 *
	 * @example
	 * ```ts
	 * migrations: [
	 *   { tag: 'v1', new_sqlite_classes: ['Counter'] }
	 * ]
	 * ```
	 */
	migrations?: MigrationConfigInput[]

	/**
	 * Rolldown options used by Devflare's Durable Object bundler.
	 *
	 * @example
	 * ```ts
	 * rolldown: {
	 *   target: 'es2022',
	 *   sourcemap: true
	 * }
	 * ```
	 */
	rolldown?: RolldownConfigInput

	/**
	 * Devflare's Vite-related configuration namespace. Raw Vite build and
	 * server configuration still belongs in `vite.config.ts`.
	 *
	 * @example
	 * ```ts
	 * vite: {
	 *   plugins: []
	 * }
	 * ```
	 */
	vite?: ViteConfigInput

	/**
	 * Wrangler passthrough for options Devflare does not model directly yet.
	 *
	 * @example
	 * ```ts
	 * wrangler: {
	 *   passthrough: {
	 *     main: '.svelte-kit/cloudflare/_worker.js'
	 *   }
	 * }
	 * ```
	 */
	wrangler?: WranglerConfigInput

	/**
	 * Environment-specific overrides keyed by environment name. Environment
	 * overrides inherit root config and can override only the fields they need.
	 *
	 * @example
	 * ```ts
	 * env: {
	 *   production: {
	 *     vars: { APP_ENV: 'production' }
	 *   }
	 * }
	 * ```
	 */
	env?: Record<string, DevflareEnvConfigInput>
}

/**
 * Environment-specific config override input. All root fields are optional
 * inside an environment, except fields that do not make sense per environment.
 */
export interface DevflareEnvConfigInput
	extends Partial<Omit<DevflareConfigInput, 'accountId' | 'wsRoutes' | 'env'>> {}

export type * from './schema-types-bindings'
export type * from './schema-types-build'
export type * from './schema-types-runtime'
