import { docPath, getCanonicalDocSlug } from '$lib/docs/content'
import type {
	IntellisenseContextTag,
	IntellisenseDefinition,
	IntellisenseEntry,
	IntellisenseLink,
	IntellisenseRenderContext
} from './types'

const configFilePattern = /(^|[/\\])devflare\.config\.(ts|mts|js|mjs)$/i

function docsReference(label: string, slug: string): IntellisenseLink {
	return {
		label,
		href: docPath(getCanonicalDocSlug(slug) ?? slug)
	}
}

function cloudflareReference(label: string, href: string): IntellisenseLink {
	return {
		label,
		href,
		external: true,
		citation: 'Cloudflare Docs'
	}
}

const definitions: IntellisenseDefinition[] = [
	{
		id: 'module-devflare-config',
		label: 'devflare/config',
		kind: 'module',
		aliases: ['devflare/config'],
		contexts: ['config'],
		summary: 'Config-only public entry for devflare.config.ts files.',
		detail:
			'Use this module in config files so Bun only loads the lightweight config helpers instead of the full Node-side Devflare barrel.',
		requirement: 'contextual',
		availableIn: 'devflare.config.ts',
		references: [
			docsReference('Config basics', 'config-basics'),
			docsReference('First worker', 'first-worker')
		]
	},
	{
		id: 'module-devflare-runtime',
		label: 'devflare/runtime',
		kind: 'module',
		aliases: ['devflare/runtime'],
		contexts: ['runtime'],
		summary: 'Worker-safe runtime entry for request-scoped helpers, event types, and middleware utilities.',
		detail:
			'Import runtime helpers from here inside worker code when you need FetchEvent types, context getters, sequence(), or request-scoped proxies such as locals.',
		requirement: 'contextual',
		availableIn: 'Worker and middleware files',
		references: [
			docsReference('Runtime context', 'runtime-context'),
			docsReference('sequence(...) middleware', 'sequence-middleware')
		]
	},
	{
		id: 'module-devflare-test',
		label: 'devflare/test',
		kind: 'module',
		aliases: ['devflare/test'],
		contexts: ['test'],
		summary: 'Runtime-shaped test entry that exposes createTestContext() and cf.* helpers.',
		detail:
			'Prefer this over hand-rolled mocks when you want Bun tests to exercise the same bindings and handler surfaces your worker actually uses.',
		requirement: 'contextual',
		availableIn: 'Bun tests',
		references: [
			docsReference('createTestContext()', 'create-test-context'),
			docsReference('Testing and automation', 'testing-and-automation')
		]
	},
	{
		id: 'module-devflare',
		label: 'devflare',
		kind: 'module',
		aliases: ['devflare'],
		contexts: ['runtime', 'test'],
		codeIncludes: ["from 'devflare'"],
		summary: 'Main public Devflare entry used for unified helpers such as env in runtime and tests.',
		detail:
			'In worker code, prefer devflare/runtime for request-scoped helpers and devflare/config for config files. The main entry is most useful when you intentionally want the unified env proxy.',
		requirement: 'contextual',
		availableIn: 'Worker code and tests',
		references: [
			docsReference('Runtime context', 'runtime-context'),
			docsReference('createTestContext()', 'create-test-context')
		]
	},

	{
		id: 'define-config',
		label: 'defineConfig()',
		kind: 'config',
		aliases: ['defineconfig'],
		contexts: ['config'],
		codeIncludes: ['devflare/config'],
		summary: 'Typed wrapper for devflare.config.ts that preserves autocomplete and schema-friendly authoring.',
		detail:
			'It accepts a plain object or a config factory. Devflare later validates the result, applies defaults, and compiles it into Wrangler-facing output.',
		requirement: 'contextual',
		availableIn: 'devflare.config.ts',
		references: [
			docsReference('Config basics', 'config-basics'),
			docsReference('First worker', 'first-worker')
		]
	},
	{
		id: 'preview-helper',
		label: 'preview',
		kind: 'config',
		aliases: ['preview'],
		contexts: ['config'],
		codeIncludes: ['devflare/config'],
		lineIncludes: ['preview.scope'],
		summary: 'Preview naming helper for resources that should materialize differently in named preview scopes.',
		detail:
			'preview.scope() returns a function that marks names as preview-scoped. Devflare later materializes those names from preview identifier inputs such as environment or branch metadata.',
		defaultValue: 'Separator defaults to -',
		requirement: 'contextual',
		availableIn: 'devflare.config.ts',
		references: [
			docsReference('Preview strategies', 'preview-strategies'),
			docsReference('Preview operations', 'preview-operations')
		]
	},
	{
		id: 'ref-helper',
		label: 'ref()',
		kind: 'config',
		aliases: ['ref'],
		contexts: ['config'],
		codeIncludes: ['devflare/config'],
		summary: 'Cross-worker reference helper that keeps service and entrypoint relationships explicit.',
		detail:
			'Use ref() when one worker should point at another worker or named entrypoint without scattering worker names through source files or tests.',
		requirement: 'contextual',
		availableIn: 'devflare.config.ts',
		references: [
			docsReference('Worker composition', 'multi-workers'),
			docsReference('Config basics', 'config-basics')
		]
	},

	{
		id: 'config-name',
		label: 'name',
		kind: 'config',
		aliases: ['name'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['name'],
		summary: 'Worker name used as the deployment target and control-plane identity.',
		detail:
			'This is the primary worker identifier Devflare compiles into Wrangler output. Review it like an external-facing name, not a throwaway label.',
		requirement: 'required',
		availableIn: 'Top-level devflare config',
		references: [docsReference('Config basics', 'config-basics')]
	},
	{
		id: 'config-account-id',
		label: 'accountId',
		kind: 'config',
		aliases: ['accountid'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['accountId'],
		summary: 'Cloudflare account ID for flows that must target a specific remote account.',
		detail:
			'Devflare only needs this when the flow must resolve or operate on remote account resources such as AI, Vectorize, or account-scoped inventories.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			docsReference('Devflare CLI', 'devflare-cli')
		]
	},
	{
		id: 'config-compatibility-date',
		label: 'compatibilityDate',
		kind: 'config',
		aliases: ['compatibilitydate'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['compatibilityDate'],
		summary: 'Cloudflare Workers compatibility date for the worker runtime contract.',
		detail:
			'Devflare passes this through to Wrangler and Miniflare so local dev, tests, and deploys all agree on the same Workers feature baseline.',
		defaultValue: 'Current date in YYYY-MM-DD format',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			cloudflareReference('Compatibility dates', 'https://developers.cloudflare.com/workers/configuration/compatibility-dates/')
		]
	},
	{
		id: 'config-compatibility-flags',
		label: 'compatibilityFlags',
		kind: 'config',
		aliases: ['compatibilityflags'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['compatibilityFlags'],
		summary: 'Extra Cloudflare Workers compatibility flags layered on top of Devflare defaults.',
		detail:
			'Devflare always includes nodejs_compat and nodejs_als, then merges any additional flags you specify here.',
		defaultValue: "['nodejs_compat', 'nodejs_als'] are always included",
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			cloudflareReference('Compatibility flags', 'https://developers.cloudflare.com/workers/configuration/compatibility-flags/')
		]
	},
	{
		id: 'config-previews',
		label: 'previews',
		kind: 'config',
		aliases: ['previews'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['previews'],
		summary: 'Preview-specific Devflare behavior for named preview scopes and preview deploy flows.',
		detail:
			'This is where Devflare-specific preview behavior lives. Today it includes options such as includeCrons so preview environments stay deliberate instead of accidentally mimicking production.',
		defaultValue: 'includeCrons defaults to false',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Preview strategies', 'preview-strategies'),
			docsReference('Preview operations', 'preview-operations')
		]
	},
	{
		id: 'config-files',
		label: 'files',
		kind: 'config',
		aliases: ['files'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['files'],
		summary: 'Author-facing map of worker handler files and discovery globs.',
		detail:
			'Use this to pin or disable fetch, queue, scheduled, email, route, workflow, and transport surfaces instead of letting the project structure stay implicit.',
		defaultValue: 'Auto-discovers standard worker surfaces from src/* and src/routes/**',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			docsReference('Routing', 'http-routing')
		]
	},
	{
		id: 'config-bindings',
		label: 'bindings',
		kind: 'config',
		aliases: ['bindings'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings'],
		summary: 'Binding groups for Cloudflare resources and worker-to-worker relationships.',
		detail:
			'Devflare keeps the authored binding shape readable, then compiles it into the correct Wrangler-facing form for the platform feature you are targeting.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Storage strategy', 'storage-bindings'),
			docsReference('Worker composition', 'multi-workers')
		]
	},
	{
		id: 'config-triggers',
		label: 'triggers',
		kind: 'config',
		aliases: ['triggers'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['triggers'],
		summary: 'Trigger configuration for scheduled or cron-style handler surfaces.',
		detail:
			'Use triggers when the worker should receive scheduled invocations rather than only HTTP traffic.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			cloudflareReference('Cron triggers', 'https://developers.cloudflare.com/workers/configuration/cron-triggers/')
		]
	},
	{
		id: 'config-vars',
		label: 'vars',
		kind: 'config',
		aliases: ['vars'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['vars'],
		summary: 'Plain-text environment variables exposed on env at runtime.',
		detail:
			'Use vars for non-secret configuration that should be typed and available alongside the rest of the worker binding surface.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('First bindings', 'first-bindings'),
			docsReference('Config basics', 'config-basics')
		]
	},
	{
		id: 'config-secrets',
		label: 'secrets',
		kind: 'config',
		aliases: ['secrets'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['secrets'],
		summary: 'Secret declarations that become part of the typed runtime env surface.',
		detail:
			'Secrets tell Devflare which sensitive values exist even when you do not want those values hard-coded in source. Individual secret declarations are required by default.',
		defaultValue: 'Each secret.required defaults to true',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			docsReference('First bindings', 'first-bindings')
		]
	},
	{
		id: 'config-assets',
		label: 'assets',
		kind: 'config',
		aliases: ['assets'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['assets'],
		summary: 'Static asset directory configuration for workers that ship compiled frontends or other static output.',
		detail:
			'Devflare uses this when the worker should expose built assets, often for app shells or framework adapters that generate a static output directory.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Vite standalone', 'vite-standalone'),
			cloudflareReference('Workers static assets', 'https://developers.cloudflare.com/workers/static-assets/')
		]
	},
	{
		id: 'config-migrations',
		label: 'migrations',
		kind: 'config',
		aliases: ['migrations'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['migrations'],
		summary: 'Durable Object migration history that Devflare passes through to Wrangler.',
		detail:
			'Keep this list explicit when Durable Object classes are added, renamed, or deleted so deploy-time state transitions stay honest.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Durable Object binding guide', 'bindings/durable-objects'),
			cloudflareReference('Durable Object migrations', 'https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/')
		]
	},
	{
		id: 'config-env-overrides',
		label: 'env',
		kind: 'config',
		aliases: ['env'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['env:'],
		propertyPaths: ['env'],
		summary: 'Named environment overrides layered on top of the base Devflare config.',
		detail:
			'Build and deploy flows can resolve config.env[name] before compilation, which keeps staging or preview tweaks explicit without cloning the whole config file.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			docsReference('Devflare CLI', 'devflare-cli')
		]
	},
	{
		id: 'config-wrangler',
		label: 'wrangler',
		kind: 'config',
		aliases: ['wrangler'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['wrangler'],
		summary: 'Escape hatch for Wrangler passthrough when Devflare does not model an option directly.',
		detail:
			'Prefer first-class Devflare fields when they exist. Reach for wrangler.passthrough only when you truly need a Wrangler-specific option that Devflare has not exposed yet.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			docsReference('Vite standalone', 'vite-standalone')
		]
	},
	{
		id: 'config-rolldown',
		label: 'rolldown',
		kind: 'config',
		aliases: ['rolldown'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['rolldown'],
		summary: 'Rolldown-specific build configuration used by Devflare for worker and Durable Object bundling lanes.',
		detail:
			'Use this when you need bundler configuration at the Devflare layer rather than only inside a host framework or local Vite config.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Svelte with Rolldown', 'svelte-with-rolldown'),
			docsReference('Vite standalone', 'vite-standalone')
		]
	},
	{
		id: 'config-vite',
		label: 'vite',
		kind: 'config',
		aliases: ['vite'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['vite'],
		summary: 'Vite-related namespace for Devflare-aware app workflows.',
		detail:
			'Devflare can detect and cooperate with local Vite projects automatically, but this namespace is where Devflare-specific Vite coordination lives when you need to be explicit.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Vite standalone', 'vite-standalone'),
			docsReference('SvelteKit with Devflare', 'sveltekit-with-devflare')
		]
	},
	{
		id: 'config-routes',
		label: 'routes',
		kind: 'config',
		aliases: ['routes'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['routes'],
		summary: 'Cloudflare deployment routes that decide which traffic reaches the worker.',
		detail:
			'These are deployment-time route patterns, not the file-router settings under files.routes. Use them when you need hostname or zone-level traffic attachment in authored config.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings'),
			cloudflareReference('Workers routes', 'https://developers.cloudflare.com/workers/configuration/routing/routes/')
		]
	},
	{
		id: 'config-ws-routes',
		label: 'wsRoutes',
		kind: 'config',
		aliases: ['wsroutes'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['wsRoutes'],
		summary: 'Development WebSocket proxy rules for forwarding paths into Durable Object namespaces.',
		detail:
			'Use these when local development should proxy WebSocket traffic into a Durable Object namespace through an explicit path contract.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'config-limits',
		label: 'limits',
		kind: 'config',
		aliases: ['limits'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['limits'],
		summary: 'Runtime resource limits such as CPU time.',
		detail:
			'Keep these limits in authored config when the package has explicit runtime expectations that should survive local review and deploy automation.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config and env overlays',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'config-observability',
		label: 'observability',
		kind: 'config',
		aliases: ['observability'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['observability'],
		summary: 'Tracing and sampling posture for the worker.',
		detail:
			'Use this lane when observability settings should stay explicit in source instead of being rediscovered in deployment settings later.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config and env overlays',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings'),
			docsReference('Environments', 'config-environments')
		]
	},
	{
		id: 'files-fetch',
		label: 'files.fetch',
		kind: 'config',
		aliases: ['fetch'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['fetch:'],
		propertyPathSuffixes: ['files.fetch'],
		summary: 'Explicit path to the main HTTP handler file.',
		detail:
			'Point this at your fetch surface when you want the project contract to stay explicit. Setting it to false disables the fetch surface instead of leaving discovery ambiguous.',
		defaultValue: 'src/fetch.ts',
		requirement: 'optional',
		availableIn: 'files section of devflare config',
		references: [
			docsReference('First worker', 'first-worker'),
			docsReference('Routing', 'http-routing')
		]
	},
	{
		id: 'files-queue',
		label: 'files.queue',
		kind: 'config',
		aliases: ['queue'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['queue:'],
		propertyPathSuffixes: ['files.queue'],
		summary: 'Explicit path to the queue consumer handler surface.',
		detail:
			'Use this when queue consumption should stay explicit in source review. Setting it to false disables queue handler discovery for this worker.',
		defaultValue: 'src/queue.ts',
		requirement: 'optional',
		availableIn: 'files section of devflare config',
		references: [
			docsReference('Queue binding guide', 'bindings/queues'),
			cloudflareReference('Queues docs', 'https://developers.cloudflare.com/queues/')
		]
	},
	{
		id: 'files-scheduled',
		label: 'files.scheduled',
		kind: 'config',
		aliases: ['scheduled'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['scheduled:'],
		propertyPathSuffixes: ['files.scheduled'],
		summary: 'Explicit path to the scheduled-event handler surface.',
		detail:
			'Use this when the worker should receive cron-style scheduled events and you want the file contract to stay visible in source review.',
		defaultValue: 'src/scheduled.ts',
		requirement: 'optional',
		availableIn: 'files section of devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			cloudflareReference('Cron triggers', 'https://developers.cloudflare.com/workers/configuration/cron-triggers/')
		]
	},
	{
		id: 'files-email',
		label: 'files.email',
		kind: 'config',
		aliases: ['email'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['email:'],
		propertyPathSuffixes: ['files.email'],
		summary: 'Explicit path to the email handler surface for Email Workers flows.',
		detail:
			'Use this when the worker should receive inbound email events rather than only HTTP requests or queue jobs.',
		defaultValue: 'src/email.ts',
		requirement: 'optional',
		availableIn: 'files section of devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			cloudflareReference('Email Workers', 'https://developers.cloudflare.com/email-routing/email-workers/')
		]
	},
	{
		id: 'files-durable-objects',
		label: 'files.durableObjects',
		kind: 'config',
		aliases: ['durableobjects'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['durableobjects:'],
		propertyPathSuffixes: ['files.durableObjects'],
		summary: 'Glob pattern used to discover Durable Object source files.',
		detail:
			'Use this when your Durable Object classes do not live on the default do.* file pattern or when you want discovery to stay explicit in the config.',
		defaultValue: '**/do.*.{ts,js}',
		requirement: 'optional',
		availableIn: 'files section of devflare config',
		references: [
			docsReference('Durable Object binding guide', 'bindings/durable-objects'),
			docsReference('State & async patterns', 'durable-objects-and-queues')
		]
	},
	{
		id: 'files-entrypoints',
		label: 'files.entrypoints',
		kind: 'config',
		aliases: ['entrypoints'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['entrypoints:'],
		propertyPathSuffixes: ['files.entrypoints'],
		summary: 'Entrypoint discovery glob for multi-entry worker setups.',
		detail:
			'Use this when named entrypoints should be discovered from a non-default location or when you want that discovery pattern to stay explicit in source.',
		defaultValue: '**/ep.*.{ts,js}',
		requirement: 'optional',
		availableIn: 'files section of devflare config',
		references: [
			docsReference('Worker composition', 'multi-workers'),
			docsReference('Config basics', 'config-basics')
		]
	},
	{
		id: 'files-routes',
		label: 'files.routes',
		kind: 'config',
		aliases: ['routes'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['routes:'],
		propertyPathSuffixes: ['files.routes'],
		summary: 'Built-in file-router configuration for route-module discovery.',
		detail:
			'Use this to change the route directory or route prefix when the default src/routes tree is not the shape you want Devflare to scan.',
		defaultValue: 'dir: src/routes',
		requirement: 'optional',
		availableIn: 'files section of devflare config',
		references: [
			docsReference('Routing', 'http-routing'),
			docsReference('First worker', 'first-worker')
		]
	},
	{
		id: 'files-workflows',
		label: 'files.workflows',
		kind: 'config',
		aliases: ['workflows'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['workflows:'],
		propertyPathSuffixes: ['files.workflows'],
		summary: 'Workflow discovery path for workflow-oriented project setups.',
		detail:
			'Use this when workflow surfaces should be discovered from a specific source location rather than assumed from defaults.',
		defaultValue: '**/wf.*.{ts,js}',
		requirement: 'optional',
		availableIn: 'files section of devflare config',
		references: [
			docsReference('Config basics', 'config-basics'),
			cloudflareReference('Workflows', 'https://developers.cloudflare.com/workflows/')
		]
	},
	{
		id: 'files-transport',
		label: 'files.transport',
		kind: 'config',
		aliases: ['transport'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		lineIncludes: ['transport:'],
		propertyPathSuffixes: ['files.transport'],
		summary: 'Optional transport map path for bridge-backed test serialization of custom classes.',
		detail:
			'Use this only when bridge-backed tests need to round-trip custom class instances that do not cross the worker boundary as plain JSON by default.',
		defaultValue: 'src/transport.ts',
		requirement: 'optional',
		availableIn: 'files section of devflare config',
		references: [
			docsReference('Transport file', 'transport-file'),
			docsReference('createTestContext()', 'create-test-context')
		]
	},
	{
		id: 'previews-include-crons',
		label: 'previews.includeCrons',
		kind: 'config',
		aliases: ['includecrons'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['previews.includeCrons'],
		summary: 'Choose whether preview deployments keep cron triggers enabled.',
		detail:
			'This defaults to false so preview environments do not inherit scheduled behavior by accident. Opt in only when the preview should exercise real cron behavior.',
		defaultValue: 'false',
		requirement: 'optional',
		availableIn: 'previews section of devflare config and env overlays',
		references: [
			docsReference('Worker surfaces', 'worker-surfaces'),
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'triggers-crons',
		label: 'triggers.crons',
		kind: 'config',
		aliases: ['crons'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['triggers.crons'],
		summary: 'Cron schedule list for the scheduled worker surface.',
		detail:
			'Use this when a scheduled handler should run on explicit cron expressions owned by the config instead of living in shell comments or team memory.',
		requirement: 'optional',
		availableIn: 'triggers section of devflare config and env overlays',
		references: [
			docsReference('Worker surfaces', 'worker-surfaces'),
			cloudflareReference('Cron triggers', 'https://developers.cloudflare.com/workers/configuration/cron-triggers/')
		]
	},
	{
		id: 'files-routes-dir',
		label: 'files.routes.dir',
		kind: 'config',
		aliases: ['dir'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['files.routes.dir'],
		summary: 'Directory Devflare scans for route modules.',
		detail:
			'Use this when the route tree lives somewhere other than the default src/routes directory.',
		defaultValue: 'src/routes',
		requirement: 'optional',
		availableIn: 'files.routes config',
		references: [
			docsReference('Routing', 'http-routing')
		]
	},
	{
		id: 'files-routes-prefix',
		label: 'files.routes.prefix',
		kind: 'config',
		aliases: ['prefix'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['files.routes.prefix'],
		summary: 'Fixed URL prefix Devflare should mount discovered route modules under.',
		detail:
			'Use this when the route tree should live under a mount point such as /api without changing the underlying route filenames.',
		requirement: 'optional',
		availableIn: 'files.routes config',
		references: [
			docsReference('Routing', 'http-routing')
		]
	},
	{
		id: 'assets-directory',
		label: 'assets.directory',
		kind: 'config',
		aliases: ['directory'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['assets.directory'],
		summary: 'Directory of static assets to publish with the worker.',
		detail:
			'Use this when the package ships compiled frontend assets or another static directory that should be part of the worker deployment contract.',
		requirement: 'optional',
		availableIn: 'assets config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings'),
			cloudflareReference('Workers static assets', 'https://developers.cloudflare.com/workers/static-assets/')
		]
	},
	{
		id: 'assets-binding',
		label: 'assets.binding',
		kind: 'config',
		aliases: ['binding'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['assets.binding'],
		summary: 'Optional runtime binding name for the configured static assets.',
		detail:
			'Use this when the assets directory should also be exposed through a named runtime binding instead of only by deployment behavior.',
		requirement: 'optional',
		availableIn: 'assets config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'routes-pattern',
		label: 'routes.pattern',
		kind: 'config',
		aliases: ['pattern'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['routes.pattern'],
		summary: 'Cloudflare route pattern that should send traffic to the worker.',
		detail:
			'Use a host or zone pattern here when the deployment contract should attach the worker to specific traffic paths.',
		requirement: 'optional',
		availableIn: 'routes config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings'),
			cloudflareReference('Workers routes', 'https://developers.cloudflare.com/workers/configuration/routing/routes/')
		]
	},
	{
		id: 'routes-custom-domain',
		label: 'routes.custom_domain',
		kind: 'config',
		aliases: ['custom_domain'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['routes.custom_domain'],
		summary: 'Mark the deployment route as a custom domain attachment.',
		detail:
			'Use this when the route should be treated as a custom domain rather than only a zone pattern.',
		requirement: 'optional',
		availableIn: 'routes config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'ws-routes-pattern',
		label: 'wsRoutes.pattern',
		kind: 'config',
		aliases: ['pattern'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['wsRoutes.pattern'],
		summary: 'Local WebSocket path pattern that should be proxied into a Durable Object namespace.',
		detail:
			'This pattern describes the incoming development URL shape before Devflare forwards the socket to the target Durable Object namespace.',
		requirement: 'optional',
		availableIn: 'wsRoutes config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'ws-routes-do-namespace',
		label: 'wsRoutes.doNamespace',
		kind: 'config',
		aliases: ['donamespace'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['wsRoutes.doNamespace'],
		summary: 'Durable Object namespace binding that should receive the proxied WebSocket connection.',
		detail:
			'Use the env binding name here so the WebSocket gateway knows which Durable Object namespace to target in development.',
		requirement: 'optional',
		availableIn: 'wsRoutes config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings'),
			docsReference('Durable Object binding guide', 'bindings/durable-objects')
		]
	},
	{
		id: 'ws-routes-id-param',
		label: 'wsRoutes.idParam',
		kind: 'config',
		aliases: ['idparam'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['wsRoutes.idParam'],
		summary: 'Route parameter name Devflare should read as the Durable Object identity.',
		detail:
			'It defaults to id, but you can change it when the WebSocket path uses a different parameter name for object identity.',
		defaultValue: 'id',
		requirement: 'optional',
		availableIn: 'wsRoutes config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'ws-routes-forward-path',
		label: 'wsRoutes.forwardPath',
		kind: 'config',
		aliases: ['forwardpath'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['wsRoutes.forwardPath'],
		summary: 'Path Devflare forwards to on the target Durable Object once the socket is proxied.',
		detail:
			'Use this when the Durable Object expects its WebSocket upgrade on a path other than the default /websocket.',
		defaultValue: '/websocket',
		requirement: 'optional',
		availableIn: 'wsRoutes config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'limits-cpu-ms',
		label: 'limits.cpu_ms',
		kind: 'config',
		aliases: ['cpu_ms'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['limits.cpu_ms'],
		summary: 'CPU time budget for the worker runtime.',
		detail:
			'Use this when the package has an explicit CPU limit expectation that should stay visible in config review.',
		requirement: 'optional',
		availableIn: 'limits config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'observability-enabled',
		label: 'observability.enabled',
		kind: 'config',
		aliases: ['enabled'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['observability.enabled'],
		summary: 'Enable or disable the configured observability lane.',
		detail:
			'Use this when tracing or logging posture should differ explicitly between environments instead of being implied somewhere later in deployment tooling.',
		requirement: 'optional',
		availableIn: 'observability config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings'),
			docsReference('Environments', 'config-environments')
		]
	},
	{
		id: 'observability-head-sampling-rate',
		label: 'observability.head_sampling_rate',
		kind: 'config',
		aliases: ['head_sampling_rate'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['observability.head_sampling_rate'],
		summary: 'Head-based sampling rate for observability collection.',
		detail:
			'Use a value between 0 and 1 when the worker should explicitly sample only part of its traffic.',
		requirement: 'optional',
		availableIn: 'observability config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings')
		]
	},
	{
		id: 'migrations-tag',
		label: 'migrations.tag',
		kind: 'config',
		aliases: ['tag'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['migrations.tag'],
		summary: 'Durable Object migration tag that names one release step.',
		detail:
			'Keep migration tags explicit and ordered so the release history stays reviewable when Durable Object classes change over time.',
		requirement: 'optional',
		availableIn: 'migrations config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings'),
			cloudflareReference('Durable Object migrations', 'https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/')
		]
	},
	{
		id: 'migrations-new-sqlite-classes',
		label: 'migrations.new_sqlite_classes',
		kind: 'config',
		aliases: ['new_sqlite_classes'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['migrations.new_sqlite_classes'],
		summary: 'Declare newly added SQLite-backed Durable Object classes in a migration step.',
		detail:
			'Use this when a release introduces Durable Objects that should use the newer SQLite-backed storage model.',
		requirement: 'optional',
		availableIn: 'migrations config',
		references: [
			docsReference('Runtime & deploy settings', 'runtime-deploy-settings'),
			cloudflareReference('Durable Object migrations', 'https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/')
		]
	},
	{
		id: 'wrangler-passthrough',
		label: 'wrangler.passthrough',
		kind: 'config',
		aliases: ['passthrough'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['wrangler.passthrough'],
		summary: 'Wrangler escape hatch for options Devflare does not model directly.',
		detail:
			'Prefer first-class Devflare config keys when they exist. Use passthrough only for genuinely unsupported Wrangler options you still need to carry through.',
		requirement: 'optional',
		availableIn: 'wrangler config',
		references: [
			docsReference('Config basics', 'config-basics')
		]
	},
	{
		id: 'rolldown-target',
		label: 'rolldown.target',
		kind: 'config',
		aliases: ['target'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['rolldown.target'],
		summary: 'Target environment for Devflare\'s Rolldown-managed bundling lane.',
		detail:
			'Use this when Durable Object or worker bundling should target an explicit JavaScript environment instead of inheriting the default.',
		requirement: 'optional',
		availableIn: 'rolldown config',
		references: [
			docsReference('Svelte with Rolldown', 'svelte-with-rolldown')
		]
	},
	{
		id: 'rolldown-minify',
		label: 'rolldown.minify',
		kind: 'config',
		aliases: ['minify'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['rolldown.minify'],
		summary: 'Enable minification for Rolldown output.',
		detail:
			'Use this when the bundler output should be minified as part of the Devflare-managed Rolldown lane.',
		requirement: 'optional',
		availableIn: 'rolldown config',
		references: [
			docsReference('Svelte with Rolldown', 'svelte-with-rolldown')
		]
	},
	{
		id: 'rolldown-sourcemap',
		label: 'rolldown.sourcemap',
		kind: 'config',
		aliases: ['sourcemap'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['rolldown.sourcemap'],
		summary: 'Generate source maps for Rolldown output.',
		detail:
			'Use this when Devflare\'s bundler lane should emit source maps for debugging or inspection.',
		requirement: 'optional',
		availableIn: 'rolldown config',
		references: [
			docsReference('Svelte with Rolldown', 'svelte-with-rolldown')
		]
	},
	{
		id: 'rolldown-options',
		label: 'rolldown.options',
		kind: 'config',
		aliases: ['options'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['rolldown.options'],
		summary: 'Raw Rolldown options object passed into the Devflare bundling lane.',
		detail:
			'Reach for this when the high-level Rolldown settings are not enough and you need to pass additional raw bundler options through.',
		requirement: 'optional',
		availableIn: 'rolldown config',
		references: [
			docsReference('Svelte with Rolldown', 'svelte-with-rolldown')
		]
	},
	{
		id: 'vite-plugins',
		label: 'vite.plugins',
		kind: 'config',
		aliases: ['plugins'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['vite.plugins'],
		summary: 'Devflare-level Vite plugin metadata from config.',
		detail:
			'Use this for Devflare-aware Vite plugin coordination that belongs in devflare.config.ts rather than inside raw vite.config.* wiring.',
		requirement: 'optional',
		availableIn: 'vite config',
		references: [
			docsReference('Vite standalone', 'vite-standalone')
		]
	},

	{
		id: 'bindings-kv',
		label: 'bindings.kv',
		kind: 'binding',
		aliases: ['kv'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.kv'],
		summary: 'Cloudflare Workers KV namespace bindings keyed by env name.',
		detail:
			'Author KV bindings by stable namespace name or explicit resolver object. Devflare later resolves and compiles those values into Wrangler-friendly KV configuration.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('KV binding guide', 'bindings/kv'),
			cloudflareReference('Workers KV docs', 'https://developers.cloudflare.com/kv/')
		]
	},
	{
		id: 'bindings-d1',
		label: 'bindings.d1',
		kind: 'binding',
		aliases: ['d1'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.d1'],
		summary: 'Cloudflare D1 database bindings keyed by env name.',
		detail:
			'Like KV, Devflare prefers readable authoring by stable database name and only resolves concrete IDs when the workflow actually needs them.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('D1 binding guide', 'bindings/d1'),
			cloudflareReference('D1 docs', 'https://developers.cloudflare.com/d1/')
		]
	},
	{
		id: 'bindings-r2',
		label: 'bindings.r2',
		kind: 'binding',
		aliases: ['r2'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.r2'],
		summary: 'Cloudflare R2 bucket bindings keyed by env name.',
		detail:
			'Use R2 bindings when worker code should read or write bucket objects through the runtime env surface instead of hard-coding bucket names inside handlers.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('R2 binding guide', 'bindings/r2'),
			cloudflareReference('R2 docs', 'https://developers.cloudflare.com/r2/')
		]
	},
	{
		id: 'bindings-durable-objects',
		label: 'bindings.durableObjects',
		kind: 'binding',
		aliases: ['durableobjects'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		lineIncludes: ['{'],
		lineExcludes: ['src/'],
		propertyPathSuffixes: ['bindings.durableObjects'],
		summary: 'Durable Object namespace bindings that map env keys to class definitions or cross-worker refs.',
		detail:
			'Bindings can use string shorthand, explicit className/scriptName objects, or ref()-based cross-worker wiring. Devflare normalizes them before type generation, local runtime, and compilation.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('Durable Object binding guide', 'bindings/durable-objects'),
			cloudflareReference('Durable Objects docs', 'https://developers.cloudflare.com/durable-objects/')
		]
	},
	{
		id: 'bindings-queues',
		label: 'bindings.queues',
		kind: 'binding',
		aliases: ['queues'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.queues'],
		summary: 'Queue producer and consumer configuration for Cloudflare Queues.',
		detail:
			'Producers live on env like other bindings, while consumers are declared in config so Devflare can wire queue handlers and retry behavior honestly.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('Queue binding guide', 'bindings/queues'),
			cloudflareReference('Queues docs', 'https://developers.cloudflare.com/queues/')
		]
	},
	{
		id: 'bindings-queue-producers',
		label: 'queues.producers',
		kind: 'binding',
		aliases: ['producers'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['queues:'],
		propertyPathSuffixes: ['bindings.queues.producers'],
		summary: 'Queue producer bindings that map an env key to a queue name.',
		detail:
			'Use producers when worker code should enqueue messages by calling an env binding rather than hard-coding queue names in the handler body.',
		requirement: 'optional',
		availableIn: 'bindings.queues',
		references: [
			docsReference('Queue binding guide', 'bindings/queues'),
			cloudflareReference('Queues producers', 'https://developers.cloudflare.com/queues/get-started/')
		]
	},
	{
		id: 'bindings-queue-consumers',
		label: 'queues.consumers',
		kind: 'binding',
		aliases: ['consumers'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['queues:'],
		propertyPathSuffixes: ['bindings.queues.consumers'],
		summary: 'Queue consumer definitions that control batching, retries, and DLQ behavior.',
		detail:
			'Each consumer describes the queue it reads, optional batch settings, retry limits, and dead-letter routing so the config stays explicit about operational behavior.',
		requirement: 'optional',
		availableIn: 'bindings.queues',
		references: [
			docsReference('Queue binding guide', 'bindings/queues'),
			cloudflareReference('Queues consumers', 'https://developers.cloudflare.com/queues/configuration/javascript-apis/')
		]
	},
	{
		id: 'bindings-services',
		label: 'bindings.services',
		kind: 'binding',
		aliases: ['services'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.services'],
		summary: 'Service bindings that point one worker at another worker or named entrypoint.',
		detail:
			'Services pair naturally with ref() so Devflare can resolve the worker family, generate env types, and keep local multi-worker tests aligned with the actual runtime relationship.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('Service binding guide', 'bindings/services'),
			cloudflareReference('Service bindings docs', 'https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/')
		]
	},
	{
		id: 'bindings-ai',
		label: 'bindings.ai',
		kind: 'binding',
		aliases: ['ai'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.ai'],
		summary: 'Workers AI binding configuration for remote inference access.',
		detail:
			'AI is remote-oriented, so the docs emphasis is on explicit account context, preview truthfulness, and being honest about when tests are using a real remote model.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('AI binding guide', 'bindings/ai'),
			cloudflareReference('Workers AI docs', 'https://developers.cloudflare.com/workers-ai/')
		]
	},
	{
		id: 'bindings-vectorize',
		label: 'bindings.vectorize',
		kind: 'binding',
		aliases: ['vectorize'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.vectorize'],
		summary: 'Vectorize index bindings for similarity search or embedding retrieval flows.',
		detail:
			'Use this when a worker should talk to a Vectorize index through a typed env binding instead of sprinkling raw index identifiers through source code.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('Vectorize binding guide', 'bindings/vectorize'),
			cloudflareReference('Vectorize docs', 'https://developers.cloudflare.com/vectorize/')
		]
	},
	{
		id: 'bindings-hyperdrive',
		label: 'bindings.hyperdrive',
		kind: 'binding',
		aliases: ['hyperdrive'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.hyperdrive'],
		summary: 'Hyperdrive bindings for accelerated PostgreSQL access through Cloudflare.',
		detail:
			'Author by readable configuration name when possible and let Devflare resolve IDs later, which keeps source review easier than pinning opaque IDs everywhere.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('Hyperdrive binding guide', 'bindings/hyperdrive'),
			cloudflareReference('Hyperdrive docs', 'https://developers.cloudflare.com/hyperdrive/')
		]
	},
	{
		id: 'bindings-browser',
		label: 'bindings.browser',
		kind: 'binding',
		aliases: ['browser'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.browser'],
		summary: 'Browser Rendering binding for headless browser sessions.',
		detail:
			'Devflare currently supports exactly one browser binding because Wrangler does too. The binding becomes the env value passed into tools such as @cloudflare/puppeteer.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('Browser binding guide', 'bindings/browser-rendering'),
			cloudflareReference('Browser Rendering docs', 'https://developers.cloudflare.com/browser-rendering/')
		]
	},
	{
		id: 'bindings-analytics-engine',
		label: 'bindings.analyticsEngine',
		kind: 'binding',
		aliases: ['analyticsengine'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.analyticsEngine'],
		summary: 'Analytics Engine dataset bindings for structured event writes.',
		detail:
			'Use this when the worker should write analytics events to a named dataset through the env surface instead of constructing the dataset identity ad hoc.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('Analytics Engine binding guide', 'bindings/analytics-engine'),
			cloudflareReference('Analytics Engine docs', 'https://developers.cloudflare.com/analytics/analytics-engine/')
		]
	},
	{
		id: 'bindings-send-email',
		label: 'bindings.sendEmail',
		kind: 'binding',
		aliases: ['sendemail'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		codeIncludes: ['bindings:'],
		propertyPathSuffixes: ['bindings.sendEmail'],
		summary: 'send_email bindings for Email Workers outbound mail flows.',
		detail:
			'Use this when worker code should send email through a verified binding. The config can restrict destinations or sender addresses so the contract stays explicit in source.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('sendEmail binding guide', 'bindings/send-email'),
			cloudflareReference('send_email docs', 'https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/')
		]
	},
	{
		id: 'queue-consumer-queue',
		label: 'queues.consumers.queue',
		kind: 'binding',
		aliases: ['queue'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.queues.consumers.queue'],
		summary: 'Queue name that this consumer definition reads from.',
		detail:
			'Keep this explicit so batching, retries, and dead-letter behavior stay attached to one clearly named queue.',
		requirement: 'optional',
		availableIn: 'bindings.queues.consumers',
		references: [
			docsReference('Queue binding guide', 'bindings/queues')
		]
	},
	{
		id: 'queue-consumer-dead-letter-queue',
		label: 'queues.consumers.deadLetterQueue',
		kind: 'binding',
		aliases: ['deadletterqueue'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.queues.consumers.deadLetterQueue'],
		summary: 'Queue that should receive messages after retries are exhausted.',
		detail:
			'Use this when failed messages should be retained for inspection or reprocessing instead of being dropped after the retry limit.',
		requirement: 'optional',
		availableIn: 'bindings.queues.consumers',
		references: [
			docsReference('Queue binding guide', 'bindings/queues')
		]
	},
	{
		id: 'queue-consumer-max-batch-size',
		label: 'queues.consumers.maxBatchSize',
		kind: 'binding',
		aliases: ['maxbatchsize'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.queues.consumers.maxBatchSize'],
		summary: 'Maximum number of messages delivered per consumer batch.',
		detail:
			'Use this when the consumer should balance throughput against per-batch work cost or latency.',
		requirement: 'optional',
		availableIn: 'bindings.queues.consumers',
		references: [
			docsReference('Queue binding guide', 'bindings/queues')
		]
	},
	{
		id: 'queue-consumer-max-batch-timeout',
		label: 'queues.consumers.maxBatchTimeout',
		kind: 'binding',
		aliases: ['maxbatchtimeout'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.queues.consumers.maxBatchTimeout'],
		summary: 'Maximum seconds Cloudflare should wait while collecting a batch.',
		detail:
			'Use this when the consumer should flush smaller batches sooner instead of waiting longer for a fuller one.',
		requirement: 'optional',
		availableIn: 'bindings.queues.consumers',
		references: [
			docsReference('Queue binding guide', 'bindings/queues')
		]
	},
	{
		id: 'queue-consumer-max-retries',
		label: 'queues.consumers.maxRetries',
		kind: 'binding',
		aliases: ['maxretries'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.queues.consumers.maxRetries'],
		summary: 'Maximum retry attempts before a message is treated as failed.',
		detail:
			'Use this when the consumer should explicitly cap retry behavior instead of relying on vague operational assumptions.',
		requirement: 'optional',
		availableIn: 'bindings.queues.consumers',
		references: [
			docsReference('Queue binding guide', 'bindings/queues')
		]
	},
	{
		id: 'queue-consumer-max-concurrency',
		label: 'queues.consumers.maxConcurrency',
		kind: 'binding',
		aliases: ['maxconcurrency'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.queues.consumers.maxConcurrency'],
		summary: 'Maximum concurrent consumer invocations for this queue definition.',
		detail:
			'Use this when parallelism should stay capped for downstream systems, database pressure, or other operational constraints.',
		requirement: 'optional',
		availableIn: 'bindings.queues.consumers',
		references: [
			docsReference('Queue binding guide', 'bindings/queues')
		]
	},
	{
		id: 'queue-consumer-retry-delay',
		label: 'queues.consumers.retryDelay',
		kind: 'binding',
		aliases: ['retrydelay'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.queues.consumers.retryDelay'],
		summary: 'Delay in seconds between retry attempts.',
		detail:
			'Use this when failed work should back off explicitly instead of retrying immediately under the same load conditions.',
		requirement: 'optional',
		availableIn: 'bindings.queues.consumers',
		references: [
			docsReference('Queue binding guide', 'bindings/queues')
		]
	},
	{
		id: 'service-binding-service',
		label: 'bindings.services.*.service',
		kind: 'binding',
		aliases: ['service'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.services.*.service'],
		summary: 'Target worker service name for a service binding.',
		detail:
			'Use the worker name here when a binding should point at another worker without relying on implicit naming or ad hoc fetch URLs.',
		requirement: 'optional',
		availableIn: 'bindings.services',
		references: [
			docsReference('Service binding guide', 'bindings/services')
		]
	},
	{
		id: 'ai-binding-binding',
		label: 'bindings.ai.binding',
		kind: 'binding',
		aliases: ['binding'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['bindings.ai.binding'],
		summary: 'Runtime env binding name for the Workers AI integration.',
		detail:
			'Use this when the AI binding should appear on env under an explicit name such as AI.',
		requirement: 'optional',
		availableIn: 'bindings.ai',
		references: [
			docsReference('AI binding guide', 'bindings/ai')
		]
	},
	{
		id: 'vectorize-index-name',
		label: 'bindings.vectorize.*.indexName',
		kind: 'binding',
		aliases: ['indexname'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.vectorize.*.indexName'],
		summary: 'Backing Vectorize index name for this binding.',
		detail:
			'Use a stable index name here so the worker binding stays readable while the real Vectorize target remains explicit.',
		requirement: 'optional',
		availableIn: 'bindings.vectorize',
		references: [
			docsReference('Vectorize binding guide', 'bindings/vectorize')
		]
	},
	{
		id: 'analytics-dataset',
		label: 'bindings.analyticsEngine.*.dataset',
		kind: 'binding',
		aliases: ['dataset'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.analyticsEngine.*.dataset'],
		summary: 'Analytics Engine dataset name for this binding.',
		detail:
			'Use the dataset name here so the worker writes to an explicit Analytics Engine dataset through the env surface.',
		requirement: 'optional',
		availableIn: 'bindings.analyticsEngine',
		references: [
			docsReference('Analytics Engine binding guide', 'bindings/analytics-engine')
		]
	},
	{
		id: 'send-email-destination-address',
		label: 'bindings.sendEmail.*.destinationAddress',
		kind: 'binding',
		aliases: ['destinationaddress'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['bindings.sendEmail.*.destinationAddress'],
		summary: 'Single verified destination address this sendEmail binding may target.',
		detail:
			'Use this when outbound mail should be constrained to one verified destination instead of a broader allowed list.',
		requirement: 'optional',
		availableIn: 'bindings.sendEmail',
		references: [
			docsReference('sendEmail binding guide', 'bindings/send-email')
		]
	},
	{
		id: 'secret-required',
		label: 'secrets.*.required',
		kind: 'config',
		aliases: ['required'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['secrets.*.required'],
		summary: 'Declare whether a configured secret is required by default.',
		detail:
			'Use this when the secret declaration itself should say whether the value is expected to exist, rather than leaving that expectation implicit.',
		defaultValue: 'true',
		requirement: 'optional',
		availableIn: 'secrets config',
		references: [
			docsReference('Config basics', 'config-basics')
		]
	},

	{
		id: 'runtime-fetch-event',
		label: 'FetchEvent',
		kind: 'runtime',
		aliases: ['fetchevent'],
		contexts: ['runtime'],
		codeIncludes: ['devflare/runtime'],
		summary: 'Typed event object for HTTP fetch handlers.',
		detail:
			'Use this at the handler boundary when you want request, env, ctx, params, and locals on the real Devflare request surface instead of a generic WorkerRequest guess.',
		requirement: 'contextual',
		availableIn: 'HTTP handlers and middleware',
		references: [
			docsReference('First worker', 'first-worker'),
			docsReference('Runtime context', 'runtime-context')
		]
	},
	{
		id: 'runtime-queue-event',
		label: 'QueueEvent',
		kind: 'runtime',
		aliases: ['queueevent'],
		contexts: ['runtime'],
		codeIncludes: ['devflare/runtime'],
		summary: 'Typed event object for queue consumer handlers.',
		detail:
			'QueueEvent exposes event.messages and the rest of the worker context in the same event-first style Devflare uses for fetch handlers.',
		requirement: 'contextual',
		availableIn: 'Queue consumer handlers',
		references: [
			docsReference('Queue binding guide', 'bindings/queues'),
			cloudflareReference('Queues docs', 'https://developers.cloudflare.com/queues/')
		]
	},
	{
		id: 'runtime-scheduled-event',
		label: 'ScheduledEvent',
		kind: 'runtime',
		aliases: ['scheduledevent'],
		contexts: ['runtime'],
		codeIncludes: ['devflare/runtime'],
		summary: 'Typed event object for cron and scheduled handlers.',
		detail:
			'Use this when scheduled work needs the cron string, scheduledTime, env, and execution context in one runtime-shaped object.',
		requirement: 'contextual',
		availableIn: 'Scheduled handlers',
		references: [
			docsReference('Runtime context', 'runtime-context'),
			cloudflareReference('Cron triggers', 'https://developers.cloudflare.com/workers/configuration/cron-triggers/')
		]
	},
	{
		id: 'runtime-resolve-fetch',
		label: 'ResolveFetch',
		kind: 'runtime',
		aliases: ['resolvefetch'],
		contexts: ['runtime'],
		codeIncludes: ['devflare/runtime'],
		summary: 'The continuation function passed into sequence() middleware.',
		detail:
			'Calling resolve(event) advances to the next middleware or matched route/module handler, which is what makes sequence() explicit rather than magical.',
		requirement: 'contextual',
		availableIn: 'sequence() middleware',
		references: [
			docsReference('sequence(...) middleware', 'sequence-middleware'),
			docsReference('Runtime context', 'runtime-context')
		]
	},
	{
		id: 'runtime-env-proxy',
		label: 'env',
		kind: 'runtime',
		aliases: ['env'],
		contexts: ['runtime'],
		codeIncludes: ['devflare/runtime'],
		summary: 'Readonly request-scoped proxy for bindings and variables in the active Devflare handler trail.',
		detail:
			'Use this when you are already inside a Devflare-managed request or job and want typed access to KV, D1, vars, services, or other bindings without threading env through every helper manually.',
		requirement: 'contextual',
		availableIn: 'Active Devflare runtime context',
		references: [
			docsReference('Runtime context', 'runtime-context'),
			docsReference('First bindings', 'first-bindings')
		]
	},
	{
		id: 'unified-env-proxy',
		label: 'env',
		kind: 'env',
		aliases: ['env'],
		contexts: ['runtime', 'test'],
		codeIncludes: ["from 'devflare'"],
		summary: 'Unified env proxy that works in handlers, tests, and local bridge-backed flows.',
		detail:
			'It tries request context first, then test context, then the local bridge. That is why createTestContext() plus env.dispose() is the default Devflare test loop.',
		requirement: 'contextual',
		availableIn: 'Worker code and tests',
		references: [
			docsReference('createTestContext()', 'create-test-context'),
			docsReference('Runtime context', 'runtime-context')
		]
	},
	{
		id: 'runtime-ctx-proxy',
		label: 'ctx',
		kind: 'runtime',
		aliases: ['ctx'],
		contexts: ['runtime'],
		codeIncludes: ['devflare/runtime'],
		summary: 'Readonly execution-context proxy for waitUntil() and related background-work hooks.',
		detail:
			'In fetch handlers this exposes ExecutionContext-like behavior. In Durable Object trails it resolves to the current DurableObjectState instead.',
		requirement: 'contextual',
		availableIn: 'Active Devflare runtime context',
		references: [
			docsReference('Runtime context', 'runtime-context')
		]
	},
	{
		id: 'runtime-locals',
		label: 'locals',
		kind: 'runtime',
		aliases: ['locals'],
		contexts: ['runtime'],
		codeIncludes: ['devflare/runtime'],
		summary: 'Mutable request-scoped storage shared across middleware and handlers.',
		detail:
			'Unlike env, ctx, and the runtime event proxy, locals is intentionally mutable. Use it for auth state or computed request data that downstream code should read later in the same trail.',
		requirement: 'contextual',
		availableIn: 'Active Devflare runtime context',
		references: [
			docsReference('Runtime context', 'runtime-context'),
			docsReference('sequence(...) middleware', 'sequence-middleware')
		]
	},
	{
		id: 'runtime-sequence',
		label: 'sequence()',
		kind: 'runtime',
		aliases: ['sequence'],
		contexts: ['runtime'],
		codeIncludes: ['devflare/runtime'],
		summary: 'Request-wide middleware composer for explicit top-to-bottom HTTP flow.',
		detail:
			'Use sequence() for broad concerns such as auth, CORS, logging, or request IDs that should wrap route resolution rather than being copied into every leaf handler.',
		requirement: 'contextual',
		availableIn: 'HTTP middleware code',
		references: [
			docsReference('sequence(...) middleware', 'sequence-middleware'),
			docsReference('SvelteKit with Devflare', 'sveltekit-with-devflare')
		]
	},
	{
		id: 'runtime-get-fetch-event',
		label: 'getFetchEvent()',
		kind: 'runtime',
		aliases: ['getfetchevent'],
		contexts: ['runtime'],
		codeIncludes: ['devflare/runtime'],
		summary: 'Getter for the active fetch event deeper in the same AsyncLocalStorage-backed trail.',
		detail:
			'Prefer explicit event parameters at the handler boundary, then use getFetchEvent() or getFetchEvent.safe() deeper in helpers when plumbing the event through every function would be ceremony.',
		requirement: 'contextual',
		availableIn: 'Helpers called inside fetch trails',
		references: [
			docsReference('Runtime context', 'runtime-context')
		]
	},

	{
		id: 'test-create-test-context',
		label: 'createTestContext()',
		kind: 'test',
		aliases: ['createtestcontext'],
		contexts: ['test'],
		codeIncludes: ['devflare/test'],
		summary: 'Default runtime-shaped test harness for Devflare projects.',
		detail:
			'It discovers the nearest supported config, starts the local runtime, wires the configured bindings, and gives tests the same shapes the worker uses for real.',
		requirement: 'contextual',
		availableIn: 'Bun tests',
		references: [
			docsReference('createTestContext()', 'create-test-context'),
			docsReference('Testing and automation', 'testing-and-automation')
		]
	},
	{
		id: 'test-cf-helper',
		label: 'cf',
		kind: 'test',
		aliases: ['cf'],
		contexts: ['test'],
		codeIncludes: ['devflare/test'],
		summary: 'Unified helper surface for triggering worker, queue, email, scheduled, and tail handlers in tests.',
		detail:
			'Use cf.* when the test should talk to the runtime like a real caller would, instead of poking implementation details directly.',
		requirement: 'contextual',
		availableIn: 'Bun tests with createTestContext()',
		references: [
			docsReference('createTestContext()', 'create-test-context'),
			docsReference('Testing and automation', 'testing-and-automation')
		]
	},

	{
		id: 'preview-env-branch',
		label: 'DEVFLARE_PREVIEW_BRANCH',
		kind: 'env',
		aliases: ['devflare_preview_branch'],
		contexts: ['shell', 'yaml'],
		summary: 'Environment hint that tells Devflare which preview branch identifier to materialize.',
		detail:
			'Named preview flows use this when branch metadata should become the preview identifier for scoped resources and worker names.',
		requirement: 'contextual',
		availableIn: 'Preview automation and deploy scripts',
		references: [
			docsReference('Preview strategies', 'preview-strategies'),
			docsReference('Preview operations', 'preview-operations')
		]
	},
	{
		id: 'preview-env-identifier',
		label: 'DEVFLARE_PREVIEW_IDENTIFIER',
		kind: 'env',
		aliases: ['devflare_preview_identifier'],
		contexts: ['shell', 'yaml'],
		summary: 'Explicit preview identifier override for preview-scoped naming.',
		detail:
			'If this is set, Devflare uses it before falling back to PR or branch-derived preview identifiers.',
		requirement: 'contextual',
		availableIn: 'Preview automation and deploy scripts',
		references: [
			docsReference('Preview strategies', 'preview-strategies'),
			docsReference('Preview operations', 'preview-operations')
		]
	},
	{
		id: 'preview-env-pr',
		label: 'DEVFLARE_PREVIEW_PR',
		kind: 'env',
		aliases: ['devflare_preview_pr'],
		contexts: ['shell', 'yaml'],
		summary: 'PR-number hint for preview scope naming.',
		detail:
			'When set, Devflare normalizes this into a preview identifier like pr-123 before materializing preview-scoped names.',
		requirement: 'contextual',
		availableIn: 'Preview automation and deploy scripts',
		references: [
			docsReference('Preview strategies', 'preview-strategies'),
			docsReference('Preview operations', 'preview-operations')
		]
	},

	{
		id: 'cli-devflare',
		label: 'devflare',
		kind: 'cli',
		aliases: ['devflare'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare'],
		summary: 'Devflare CLI for local development, builds, deploys, types, config inspection, and preview operations.',
		detail:
			'Commands resolve your local Devflare config first, then bridge that config into Wrangler-compatible workflows so the CLI vocabulary stays stable across local and deploy lanes.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [
			docsReference('Devflare CLI', 'devflare-cli'),
			docsReference('Production deploys', 'production-deploys')
		]
	},
	{
		id: 'cli-dev-command',
		label: 'devflare dev',
		kind: 'cli',
		aliases: ['dev'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare'],
		summary: 'Start local development with worker-only mode by default and Vite when an effective local Vite app exists.',
		detail:
			'Devflare watches worker and Durable Object source files, rebuilds them as needed, and mirrors the runtime shape the app will use in real workflows.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and package scripts',
		references: [
			docsReference('Devflare CLI', 'devflare-cli'),
			docsReference('Vite standalone', 'vite-standalone')
		]
	},
	{
		id: 'cli-build-command',
		label: 'devflare build',
		kind: 'cli',
		aliases: ['build'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare'],
		summary: 'Build deployment artifacts from the effective Devflare config.',
		detail:
			'This resolves env overrides first, prepares the Wrangler-facing output, and lets you inspect the deployment contract before actually shipping it.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [
			docsReference('Devflare CLI', 'devflare-cli'),
			docsReference('Production deploys', 'production-deploys')
		]
	},
	{
		id: 'cli-deploy-command',
		label: 'devflare deploy',
		kind: 'cli',
		aliases: ['deploy'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare'],
		summary: 'Deploy explicitly to production or preview targets.',
		detail:
			'Devflare rejects ambiguous deploys from the CLI so production and preview intent stay unmistakable. Named preview deploys can also provision preview-scoped resources automatically.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [
			docsReference('Production deploys', 'production-deploys'),
			docsReference('Preview strategies', 'preview-strategies')
		]
	},
	{
		id: 'cli-types-command',
		label: 'devflare types',
		kind: 'cli',
		aliases: ['types'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare'],
		summary: 'Generate env.d.ts-style bindings and entrypoint-aware types from config.',
		detail:
			'Re-run this whenever bindings, Durable Objects, or service entrypoints change so the generated env surface stays honest.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [
			docsReference('Devflare CLI', 'devflare-cli'),
			docsReference('First bindings', 'first-bindings')
		]
	},
	{
		id: 'cli-doctor-command',
		label: 'devflare doctor',
		kind: 'cli',
		aliases: ['doctor'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare'],
		summary: 'Project diagnostics for config, TypeScript, framework integration, and generated artifacts.',
		detail:
			'Use this when the project feels broken in a vague and unhelpful way. It checks whether the expected Devflare pieces are present and loadable.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [docsReference('Devflare CLI', 'devflare-cli')]
	},
	{
		id: 'cli-config-command',
		label: 'devflare config',
		kind: 'cli',
		aliases: ['config'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare'],
		summary: 'Print the resolved Devflare config or compiled Wrangler JSON.',
		detail:
			'Use this when you want to inspect the exact configuration Devflare sees after env resolution instead of guessing how authored config becomes deploy output.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [docsReference('Devflare CLI', 'devflare-cli')]
	},
	{
		id: 'cli-previews-command',
		label: 'devflare previews',
		kind: 'cli',
		aliases: ['previews'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare previews'],
		summary: 'Inspect preview scopes, preview resources, and current preview registry state.',
		detail:
			'Use this when preview infrastructure already exists and you need to inspect or clean it up instead of only deploying a new preview.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [
			docsReference('Preview operations', 'preview-operations'),
			docsReference('Preview strategies', 'preview-strategies')
		]
	},
	{
		id: 'cli-productions-command',
		label: 'devflare productions',
		kind: 'cli',
		aliases: ['productions'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare productions'],
		summary: 'Inspect and manage live production workers and deployments.',
		detail:
			'This is the production-side inspection lane when you need to see what is live instead of only reasoning from local build output.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [docsReference('Production deploys', 'production-deploys')]
	},
	{
		id: 'cli-flag-env',
		label: '--env',
		kind: 'flag',
		aliases: ['--env'],
		contexts: ['shell', 'yaml'],
		summary: 'Resolve config.env[name] before building, printing, or deploying.',
		detail:
			'Use this when a named environment should be applied on top of the base config. It is especially useful for build and config inspection flows.',
		requirement: 'contextual',
		availableIn: 'build, deploy, and config commands',
		references: [
			docsReference('Devflare CLI', 'devflare-cli'),
			docsReference('Config basics', 'config-basics')
		]
	},
	{
		id: 'cli-flag-preview',
		label: '--preview',
		kind: 'flag',
		aliases: ['--preview'],
		contexts: ['shell', 'yaml'],
		summary: 'Select preview deployment mode, optionally with a named preview scope.',
		detail:
			'Pass a value such as next or pr-1 for named preview scopes, or omit the value for a same-worker preview upload.',
		requirement: 'contextual',
		availableIn: 'deploy command',
		references: [
			docsReference('Preview strategies', 'preview-strategies'),
			docsReference('Preview operations', 'preview-operations')
		]
	},
	{
		id: 'cli-flag-prod',
		label: '--prod',
		kind: 'flag',
		aliases: ['--prod'],
		contexts: ['shell', 'yaml'],
		summary: 'Explicitly target a production deployment.',
		detail:
			'Devflare requires an explicit production or preview target at deploy time so production intent is never accidental.',
		requirement: 'contextual',
		availableIn: 'deploy command',
		references: [docsReference('Production deploys', 'production-deploys')]
	},
	{
		id: 'cli-flag-production',
		label: '--production',
		kind: 'flag',
		aliases: ['--production'],
		contexts: ['shell', 'yaml'],
		summary: 'Long-form alias for --prod.',
		detail:
			'Use this when you want the longer spelling in CI or scripts, but the deploy behavior is the same as --prod.',
		requirement: 'contextual',
		availableIn: 'deploy command',
		references: [docsReference('Production deploys', 'production-deploys')]
	},
	{
		id: 'cli-flag-dry-run',
		label: '--dry-run',
		kind: 'flag',
		aliases: ['--dry-run'],
		contexts: ['shell', 'yaml'],
		summary: 'Print the synthesized deployment config and skip the actual remote operation.',
		detail:
			'Use this when you want to review the exact deploy contract before making a real production or preview change.',
		requirement: 'contextual',
		availableIn: 'deploy command',
		references: [
			docsReference('Production deploys', 'production-deploys'),
			docsReference('Preview strategies', 'preview-strategies')
		]
	},
	{
		id: 'cli-flag-config',
		label: '--config',
		kind: 'flag',
		aliases: ['--config'],
		contexts: ['shell', 'yaml'],
		summary: 'Use a specific devflare config path instead of default config resolution.',
		detail:
			'This is useful in monorepos or automation when the working directory is not already the package that owns the intended config file.',
		requirement: 'contextual',
		availableIn: 'Most CLI commands',
		references: [docsReference('Devflare CLI', 'devflare-cli')]
	},
	{
		id: 'cli-flag-output',
		label: '--output',
		kind: 'flag',
		aliases: ['--output'],
		contexts: ['shell', 'yaml'],
		summary: 'Write generated output to a custom location.',
		detail:
			'In the types command, this changes where the generated env.d.ts-style bindings file is written instead of using the default path.',
		requirement: 'contextual',
		availableIn: 'types command',
		references: [docsReference('Devflare CLI', 'devflare-cli')]
	},
	{
		id: 'cli-flag-debug',
		label: '--debug',
		kind: 'flag',
		aliases: ['--debug'],
		contexts: ['shell', 'yaml'],
		summary: 'Enable extra stack traces and debug logging when a command fails.',
		detail:
			'Reach for this when the normal command output is too polite to explain what actually went wrong.',
		requirement: 'contextual',
		availableIn: 'Many CLI commands',
		references: [docsReference('Devflare CLI', 'devflare-cli')]
	},
	{
		id: 'browser-puppeteer',
		label: '@cloudflare/puppeteer',
		kind: 'binding',
		aliases: ['@cloudflare/puppeteer'],
		contexts: ['runtime', 'test'],
		summary: 'Cloudflare-maintained Puppeteer integration for Browser Rendering sessions.',
		detail:
			'Use this with a browser binding when worker code should launch or control a Cloudflare Browser Rendering session through a familiar Puppeteer API.',
		requirement: 'contextual',
		availableIn: 'Browser Rendering examples',
		references: [
			docsReference('Browser binding guide', 'bindings/browser-rendering'),
			cloudflareReference('Browser Rendering docs', 'https://developers.cloudflare.com/browser-rendering/')
		]
	}
]

const entriesById = new Map<string, IntellisenseEntry>(
	definitions.map((definition) => {
		const {
			aliases,
			contexts,
			filePatterns,
			codeIncludes,
			lineIncludes,
			lineExcludes,
			propertyPaths,
			propertyPathSuffixes,
			...entry
		} = definition

		void aliases
		void contexts
		void filePatterns
		void codeIncludes
		void lineIncludes
		void lineExcludes
		void propertyPaths
		void propertyPathSuffixes

		return [definition.id, entry]
	})
)

function normalizeSource(value: string | undefined): string {
	return value?.toLowerCase() ?? ''
}

function matchesPropertyPath(path: string, pattern: string): boolean {
	const pathSegments = path.split('.')
	const patternSegments = pattern.split('.')

	if (pathSegments.length !== patternSegments.length) {
		return false
	}

	return patternSegments.every((segment, index) => {
		return segment === '*' || segment === pathSegments[index]
	})
}

function matchesPropertyPathSuffix(path: string, suffix: string): boolean {
	const pathSegments = path.split('.')
	const suffixSegments = suffix.split('.')

	if (suffixSegments.length > pathSegments.length) {
		return false
	}

	const offset = pathSegments.length - suffixSegments.length

	return suffixSegments.every((segment, index) => {
		return segment === '*' || segment === pathSegments[offset + index]
	})
}

export function normalizeIntellisenseToken(token: string): string {
	let normalized = token.trim()
	normalized = normalized.replace(/^[`'"([{]+/, '')
	normalized = normalized.replace(/[)\]}',;:"`]+$/, '')
	normalized = normalized.replace(/\(\)$/, '')
	return normalized.trim().toLowerCase()
}

function getContextTags(context: IntellisenseRenderContext): Set<IntellisenseContextTag> {
	const tags = new Set<IntellisenseContextTag>()
	const language = context.language.trim().toLowerCase()
	const code = normalizeSource(context.code)
	const filePath = normalizeSource(context.filePath)

	switch (language) {
		case 'bash':
		case 'shell':
		case 'sh':
			tags.add('shell')
			break
		case 'yaml':
		case 'yml':
			tags.add('yaml')
			break
		case 'json':
		case 'jsonc':
			tags.add('json')
			break
		default:
			break
	}

	if (configFilePattern.test(context.filePath ?? '') || code.includes('devflare/config')) {
		tags.add('config')
	}

	if (code.includes('devflare/runtime')) {
		tags.add('runtime')
	}

	if (
		filePath.includes('/tests/')
		|| filePath.includes('test.')
		|| code.includes('devflare/test')
		|| code.includes('bun:test')
	) {
		tags.add('test')
	}

	if (tags.size === 0) {
		tags.add('unknown')
	}

	return tags
}

function matchesDefinition(
	definition: IntellisenseDefinition,
	normalizedToken: string,
	context: IntellisenseRenderContext,
	contextTags: Set<IntellisenseContextTag>
): boolean {
	if (context.tokenType?.toLowerCase() === 'comment') {
		return false
	}

	if (!definition.aliases.some((alias) => normalizeIntellisenseToken(alias) === normalizedToken)) {
		return false
	}

	if (definition.contexts?.length && !definition.contexts.some((tag) => contextTags.has(tag))) {
		return false
	}

	const filePath = context.filePath ?? ''
	if (definition.filePatterns?.length && !definition.filePatterns.some((pattern) => pattern.test(filePath))) {
		return false
	}

	const code = normalizeSource(context.code)
	if (definition.codeIncludes?.length && !definition.codeIncludes.every((part) => code.includes(part.toLowerCase()))) {
		return false
	}

	const lineText = normalizeSource(context.lineText)
	if (definition.lineIncludes?.length && !definition.lineIncludes.every((part) => lineText.includes(part.toLowerCase()))) {
		return false
	}

	if (definition.lineExcludes?.some((part) => lineText.includes(part.toLowerCase()))) {
		return false
	}

	const propertyPath = context.propertyPath
	if (definition.propertyPaths?.length) {
		if (!propertyPath || !definition.propertyPaths.some((pattern) => matchesPropertyPath(propertyPath, pattern))) {
			return false
		}
	}

	if (definition.propertyPathSuffixes?.length) {
		if (!propertyPath || !definition.propertyPathSuffixes.some((suffix) => matchesPropertyPathSuffix(propertyPath, suffix))) {
			return false
		}
	}

	return true
}

export function resolveIntellisenseEntry(
	token: string,
	context: IntellisenseRenderContext
): IntellisenseEntry | undefined {
	const normalizedToken = normalizeIntellisenseToken(token)
	if (!normalizedToken) {
		return undefined
	}

	const contextTags = getContextTags(context)
	const match = definitions.find((definition) => {
		return matchesDefinition(definition, normalizedToken, context, contextTags)
	})

	return match ? entriesById.get(match.id) : undefined
}

export function getIntellisenseEntryById(id: string): IntellisenseEntry | undefined {
	return entriesById.get(id)
}
