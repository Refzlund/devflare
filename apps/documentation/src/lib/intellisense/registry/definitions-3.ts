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

export const definitionsPart3: IntellisenseDefinition[] = [
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
			cloudflareReference(
				'Browser Rendering docs',
				'https://developers.cloudflare.com/browser-rendering/'
			)
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
			cloudflareReference(
				'Analytics Engine docs',
				'https://developers.cloudflare.com/analytics/analytics-engine/'
			)
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
			cloudflareReference(
				'send_email docs',
				'https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/'
			)
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
		references: [docsReference('Queue binding guide', 'bindings/queues')]
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
		references: [docsReference('Queue binding guide', 'bindings/queues')]
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
		references: [docsReference('Queue binding guide', 'bindings/queues')]
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
		references: [docsReference('Queue binding guide', 'bindings/queues')]
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
		references: [docsReference('Queue binding guide', 'bindings/queues')]
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
		references: [docsReference('Queue binding guide', 'bindings/queues')]
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
		references: [docsReference('Queue binding guide', 'bindings/queues')]
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
		references: [docsReference('Service binding guide', 'bindings/services')]
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
		detail: 'Use this when the AI binding should appear on env under an explicit name such as AI.',
		requirement: 'optional',
		availableIn: 'bindings.ai',
		references: [docsReference('AI binding guide', 'bindings/ai')]
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
		references: [docsReference('Vectorize binding guide', 'bindings/vectorize')]
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
		references: [docsReference('Analytics Engine binding guide', 'bindings/analytics-engine')]
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
		references: [docsReference('sendEmail binding guide', 'bindings/send-email')]
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
		references: [docsReference('Config basics', 'config-basics')]
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
			cloudflareReference(
				'Cron triggers',
				'https://developers.cloudflare.com/workers/configuration/cron-triggers/'
			)
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
		summary:
			'Readonly request-scoped proxy for bindings and variables in the active Devflare handler trail.',
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
		references: [docsReference('Runtime context', 'runtime-context')]
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
		references: [docsReference('Runtime context', 'runtime-context')]
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
		summary:
			'Unified helper surface for triggering worker, queue, email, scheduled, and tail handlers in tests.',
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
		summary:
			'Devflare CLI for local development, builds, deploys, types, config inspection, and preview operations.',
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
		summary:
			'Start local development with worker-only mode by default and Vite when an effective local Vite app exists.',
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
		summary:
			'Project diagnostics for config, TypeScript, framework integration, and generated artifacts.',
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
	}
]
