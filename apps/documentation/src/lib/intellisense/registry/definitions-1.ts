import { docPath, getCanonicalDocSlug } from '$lib/docs/content'
import type { IntellisenseDefinition, IntellisenseLink } from '../types'
import { configFilePattern } from './shared'

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

export const definitionsPart1: IntellisenseDefinition[] = [
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
		summary:
			'Worker-safe runtime entry for request-scoped helpers, event types, and middleware utilities.',
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
		summary:
			'Main public Devflare entry used for unified helpers such as env in runtime and tests.',
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
		summary:
			'Typed wrapper for devflare.config.ts that preserves autocomplete and schema-friendly authoring.',
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
		summary:
			'Preview naming helper for resources that should materialize differently in named preview scopes.',
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
		summary:
			'Cross-worker reference helper that keeps service and entrypoint relationships explicit.',
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
			cloudflareReference(
				'Compatibility dates',
				'https://developers.cloudflare.com/workers/configuration/compatibility-dates/'
			)
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
			cloudflareReference(
				'Compatibility flags',
				'https://developers.cloudflare.com/workers/configuration/compatibility-flags/'
			)
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
		summary:
			'Preview-specific Devflare behavior for named preview scopes and preview deploy flows.',
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
			cloudflareReference(
				'Cron triggers',
				'https://developers.cloudflare.com/workers/configuration/cron-triggers/'
			)
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
		summary:
			'Static asset directory configuration for workers that ship compiled frontends or other static output.',
		detail:
			'Devflare uses this when the worker should expose built assets, often for app shells or framework adapters that generate a static output directory.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [
			docsReference('Vite standalone', 'vite-standalone'),
			cloudflareReference(
				'Workers static assets',
				'https://developers.cloudflare.com/workers/static-assets/'
			)
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
			cloudflareReference(
				'Durable Object migrations',
				'https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/'
			)
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
		summary:
			'Escape hatch for Wrangler passthrough when Devflare does not model an option directly.',
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
		summary:
			'Rolldown-specific build configuration used by Devflare for worker and Durable Object bundling lanes.',
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
			cloudflareReference(
				'Workers routes',
				'https://developers.cloudflare.com/workers/configuration/routing/routes/'
			)
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
		summary:
			'Development WebSocket proxy rules for forwarding paths into Durable Object namespaces.',
		detail:
			'Use these when local development should proxy WebSocket traffic into a Durable Object namespace through an explicit path contract.',
		requirement: 'optional',
		availableIn: 'Top-level devflare config',
		references: [docsReference('Runtime & deploy settings', 'runtime-deploy-settings')]
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
		references: [docsReference('Runtime & deploy settings', 'runtime-deploy-settings')]
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
			cloudflareReference(
				'Cron triggers',
				'https://developers.cloudflare.com/workers/configuration/cron-triggers/'
			)
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
			cloudflareReference(
				'Email Workers',
				'https://developers.cloudflare.com/email-routing/email-workers/'
			)
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
	}
]
