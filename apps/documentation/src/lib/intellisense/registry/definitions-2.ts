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

export const definitionsPart2: IntellisenseDefinition[] = [
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
			cloudflareReference(
				'Cron triggers',
				'https://developers.cloudflare.com/workers/configuration/cron-triggers/'
			)
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
		references: [docsReference('Routing', 'http-routing')]
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
		references: [docsReference('Routing', 'http-routing')]
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
			cloudflareReference(
				'Workers static assets',
				'https://developers.cloudflare.com/workers/static-assets/'
			)
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
		references: [docsReference('Runtime & deploy settings', 'runtime-deploy-settings')]
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
			cloudflareReference(
				'Workers routes',
				'https://developers.cloudflare.com/workers/configuration/routing/routes/'
			)
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
		references: [docsReference('Runtime & deploy settings', 'runtime-deploy-settings')]
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
		references: [docsReference('Runtime & deploy settings', 'runtime-deploy-settings')]
	},
	{
		id: 'ws-routes-do-namespace',
		label: 'wsRoutes.doNamespace',
		kind: 'config',
		aliases: ['donamespace'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPaths: ['wsRoutes.doNamespace'],
		summary:
			'Durable Object namespace binding that should receive the proxied WebSocket connection.',
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
		references: [docsReference('Runtime & deploy settings', 'runtime-deploy-settings')]
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
		references: [docsReference('Runtime & deploy settings', 'runtime-deploy-settings')]
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
		references: [docsReference('Runtime & deploy settings', 'runtime-deploy-settings')]
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
		references: [docsReference('Runtime & deploy settings', 'runtime-deploy-settings')]
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
			cloudflareReference(
				'Durable Object migrations',
				'https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/'
			)
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
			cloudflareReference(
				'Durable Object migrations',
				'https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/'
			)
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
		references: [docsReference('Config basics', 'config-basics')]
	},
	{
		id: 'rolldown-target',
		label: 'rolldown.target',
		kind: 'config',
		aliases: ['target'],
		contexts: ['config'],
		filePatterns: [configFilePattern],
		propertyPathSuffixes: ['rolldown.target'],
		summary: "Target environment for Devflare's Rolldown-managed bundling lane.",
		detail:
			'Use this when Durable Object or worker bundling should target an explicit JavaScript environment instead of inheriting the default.',
		requirement: 'optional',
		availableIn: 'rolldown config',
		references: [docsReference('Svelte with Rolldown', 'svelte-with-rolldown')]
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
		references: [docsReference('Svelte with Rolldown', 'svelte-with-rolldown')]
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
			"Use this when Devflare's bundler lane should emit source maps for debugging or inspection.",
		requirement: 'optional',
		availableIn: 'rolldown config',
		references: [docsReference('Svelte with Rolldown', 'svelte-with-rolldown')]
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
		references: [docsReference('Svelte with Rolldown', 'svelte-with-rolldown')]
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
		references: [docsReference('Vite standalone', 'vite-standalone')]
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
		summary:
			'Durable Object namespace bindings that map env keys to class definitions or cross-worker refs.',
		detail:
			'Bindings can use string shorthand, explicit className/scriptName objects, or ref()-based cross-worker wiring. Devflare normalizes them before type generation, local runtime, and compilation.',
		requirement: 'optional',
		availableIn: 'bindings section of devflare config',
		references: [
			docsReference('Durable Object binding guide', 'bindings/durable-objects'),
			cloudflareReference(
				'Durable Objects docs',
				'https://developers.cloudflare.com/durable-objects/'
			)
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
			cloudflareReference(
				'Queues producers',
				'https://developers.cloudflare.com/queues/get-started/'
			)
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
			cloudflareReference(
				'Queues consumers',
				'https://developers.cloudflare.com/queues/configuration/javascript-apis/'
			)
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
			cloudflareReference(
				'Service bindings docs',
				'https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/'
			)
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
	}
]
