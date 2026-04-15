import type { DocCallout, DocCodeSnippet, DocPage, DocSection } from '../types'

const bindingReferenceGroup = 'Bindings'

type ContentDocCodeSnippet = DocCodeSnippet & {
	code: string
}

interface BindingOverviewDefinition {
	readTime: string
	title: string
	summary: string
	description: string
	highlights: string[]
	bestFor: string
	authoringParagraphs: string[]
	authoringSnippet: ContentDocCodeSnippet
	fitBullets: string[]
	caveatBullets: string[]
	caveatCallout?: DocCallout
}

interface BindingInternalsDefinition {
	readTime: string
	summary: string
	description: string
	highlights: string[]
	normalizationFact: string
	compileTarget: string
	previewNote: string
	normalizationParagraphs: string[]
	localRuntimeBullets: string[]
	compileBullets: string[]
	callout?: DocCallout
}

interface BindingTestingDefinition {
	readTime: string
	summary: string
	description: string
	highlights: string[]
	bestFor: string
	defaultHarness: string
	escalation: string
	paragraphs: string[]
	mainSnippet: ContentDocCodeSnippet
	helperBullets: string[]
	caveatBullets: string[]
	callout?: DocCallout
}

interface BindingExampleDefinition {
	readTime: string
	summary: string
	description: string
	highlights: string[]
	configFocus: string
	runtimeShape: string
	bestUse: string
	configSnippet: ContentDocCodeSnippet
	usageSnippet: ContentDocCodeSnippet
	testSnippet?: ContentDocCodeSnippet
	notes: string[]
	callout?: DocCallout
}

interface BindingGuideDefinition {
	slugBase: string
	label: string
	categoryDescription: string
	configKey: string
	authoringShape: string
	localStory: string
	sourcePages: string[]
	overview: BindingOverviewDefinition
	internals: BindingInternalsDefinition
	testing: BindingTestingDefinition
	example: BindingExampleDefinition
}

function getBindingSlugs(slugBase: string): {
	overview: string
	internals: string
	testing: string
	example: string
} {
	return {
		overview: `${slugBase}-binding`,
		internals: `${slugBase}-internals`,
		testing: `${slugBase}-testing`,
		example: `${slugBase}-example`
	}
}

function createBindingInternalsSnippet(guide: BindingGuideDefinition): DocCodeSnippet {
	const compileOutput = createBindingCompileOutput(guide)
	const authoringFocusLines = findFocusLines(
		guide.overview.authoringSnippet.code,
		`${guide.configKey.split('.').at(-1)}:`
	)

	return {
		title: `${guide.label} from authored config to generated output`,
		description:
			'Keep the binding readable in source, then inspect only the Wrangler-facing slice Devflare emits when the config is compiled.',
		activeFile: 'devflare.config.ts',
		structure: [
			{ path: 'devflare.config.ts' },
			{ path: 'src', kind: 'folder', muted: true },
			{ path: 'src/fetch.ts', kind: 'file', muted: true },
			{ path: '.devflare', kind: 'folder' },
			{ path: '.devflare/wrangler.jsonc' }
		],
		files: [
			{
				path: 'devflare.config.ts',
				language: 'ts',
				code: guide.overview.authoringSnippet.code,
				focusLines: authoringFocusLines ? [authoringFocusLines] : undefined
			},
			{
				path: '.devflare/wrangler.jsonc',
				language: 'json',
				code: compileOutput,
				focusLines: [[2, Math.max(2, compileOutput.split('\n').length - 1)]]
			}
		]
	}
}

function createBindingCompileOutput(guide: BindingGuideDefinition): string {
	switch (guide.slugBase) {
		case 'kv':
			return String.raw`{
	"kv_namespaces": [
		{ "binding": "CACHE", "id": "kv-namespace-id" }
	]
}`

		case 'd1':
			return String.raw`{
	"d1_databases": [
		{ "binding": "DB", "database_id": "d1-database-id" }
	]
}`

		case 'r2':
			return String.raw`{
	"r2_buckets": [
		{ "binding": "ASSETS", "bucket_name": "assets-bucket" }
	]
}`

		case 'durable-object':
			return String.raw`{
	"durable_objects": {
		"bindings": [
			{ "name": "ROOM", "class_name": "ChatRoom" }
		]
	}
}`

		case 'queue':
			return String.raw`{
	"queues": {
		"producers": [
			{ "binding": "JOBS", "queue": "jobs-queue" }
		],
		"consumers": [
			{ "queue": "jobs-queue", "dead_letter_queue": "jobs-dlq", "max_retries": 3 }
		]
	}
}`

		case 'service':
			return String.raw`{
	"services": [
		{ "binding": "MATH_SERVICE", "service": "math-service" }
	]
}`

		case 'ai':
			return String.raw`{
	"ai": {
		"binding": "AI"
	}
}`

		case 'vectorize':
			return String.raw`{
	"vectorize": [
		{ "binding": "DOCUMENT_INDEX", "index_name": "document-index" }
	]
}`

		case 'hyperdrive':
			return String.raw`{
	"hyperdrive": [
		{ "binding": "DB", "id": "hyperdrive-id" }
	]
}`

		case 'browser':
			return String.raw`{
	"browser": {
		"binding": "BROWSER"
	}
}`

		case 'analytics-engine':
			return String.raw`{
	"analytics_engine_datasets": [
		{ "binding": "APP_ANALYTICS", "dataset": "app-analytics" }
	]
}`

		case 'send-email':
			return String.raw`{
	"send_email": [
		{ "name": "SUPPORT_EMAIL", "destination_address": "support@example.com" }
	]
}`

		default:
			return String.raw`{
	"bindings": []
}`
	}
}

function findFocusLines(code: string, marker: string): [number, number] | undefined {
	const lines = code.split('\n')
	const matchIndex = lines.findIndex((line) => line.includes(marker))

	if (matchIndex === -1) {
		return undefined
	}

	const start = Math.max(1, matchIndex + 1)
	const end = Math.min(lines.length, start + 4)
	return [start, end]
}

function bindingDocPath(slug: string): string {
	return `/docs/${slug}`
}

function getCloudflareBindingReference(guide: BindingGuideDefinition): {
	title: string
	href: string
	description: string
	citation: string
} {
	switch (guide.slugBase) {
		case 'kv':
			return {
				title: 'Cloudflare Workers KV docs',
				href: 'https://developers.cloudflare.com/kv/',
				description: 'Platform reference for KV namespaces, binding APIs, limits, and Wrangler-facing setup.',
				citation: 'Cloudflare Docs'
			}

		case 'd1':
			return {
				title: 'Cloudflare D1 docs',
				href: 'https://developers.cloudflare.com/d1/',
				description: 'Platform reference for D1 databases, Worker APIs, migrations, and database limits.',
				citation: 'Cloudflare Docs'
			}

		case 'r2':
			return {
				title: 'Cloudflare R2 docs',
				href: 'https://developers.cloudflare.com/r2/',
				description: 'Platform reference for buckets, object APIs, public-versus-private delivery, and account features.',
				citation: 'Cloudflare Docs'
			}

		case 'durable-object':
			return {
				title: 'Cloudflare Durable Objects docs',
				href: 'https://developers.cloudflare.com/durable-objects/',
				description: 'Platform reference for object identity, storage, alarms, migrations, and deployment caveats.',
				citation: 'Cloudflare Docs'
			}

		case 'queue':
			return {
				title: 'Cloudflare Queues docs',
				href: 'https://developers.cloudflare.com/queues/',
				description: 'Platform reference for queue producers, consumers, delivery guarantees, retries, batching, and DLQs.',
				citation: 'Cloudflare Docs'
			}

		case 'ai':
			return {
				title: 'Cloudflare Workers AI docs',
				href: 'https://developers.cloudflare.com/workers-ai/',
				description: 'Platform reference for model access, remote inference behavior, pricing, and account prerequisites.',
				citation: 'Cloudflare Docs'
			}

		case 'vectorize':
			return {
				title: 'Cloudflare Vectorize docs',
				href: 'https://developers.cloudflare.com/vectorize/',
				description: 'Platform reference for indexes, embeddings, remote querying, and preview-aware index lifecycle.',
				citation: 'Cloudflare Docs'
			}

		case 'hyperdrive':
			return {
				title: 'Cloudflare Hyperdrive docs',
				href: 'https://developers.cloudflare.com/hyperdrive/',
				description: 'Platform reference for database acceleration, connection strings, limits, and supported databases.',
				citation: 'Cloudflare Docs'
			}

		case 'browser':
			return {
				title: 'Cloudflare Browser Rendering docs',
				href: 'https://developers.cloudflare.com/browser-rendering/',
				description: 'Platform reference for browser sessions, quick actions, automation limits, and integration methods.',
				citation: 'Cloudflare Docs'
			}

		case 'analytics-engine':
			return {
				title: 'Cloudflare Workers Analytics Engine docs',
				href: 'https://developers.cloudflare.com/analytics/analytics-engine/',
				description: 'Platform reference for write APIs, SQL querying, analytics ingestion patterns, and product limits.',
				citation: 'Cloudflare Docs'
			}

		case 'send-email':
			return {
				title: 'Cloudflare send_email binding docs',
				href: 'https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/',
				description: 'Platform reference for send_email binding restrictions, verified destinations, and Email Workers setup.',
				citation: 'Cloudflare Docs'
			}

		default:
			return {
				title: 'Cloudflare Workers bindings docs',
				href: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/',
				description: 'Platform reference for the underlying binding contract on Cloudflare Workers.',
				citation: 'Cloudflare Docs'
			}
	}
}

function getCloudflareRuntimeComparison(guide: BindingGuideDefinition): string {
	if (guide.localStory.toLowerCase().startsWith('remote-oriented')) {
		return 'Cloudflare’s docs focus on the real remote product behavior, account requirements, and runtime constraints on the platform.'
	}

	return 'Cloudflare’s docs focus on the raw binding API, product semantics, and platform limits for the binding itself.'
}

function createBindingReferenceSection(guide: BindingGuideDefinition): DocSection {
	const reference = getCloudflareBindingReference(guide)

	return {
		id: 'cloudflare-reference',
		title: 'Cloudflare docs vs the Devflare layer',
		paragraphs: [
			`${reference.title} is the platform reference. This page is the Devflare translation layer: keep \`${guide.configKey}\` readable in source, understand the typed env surface, and know which local, preview, or remote lane actually matches the binding.`
		],
		cards: [
			{
				href: reference.href,
				label: 'Reference',
				meta: reference.citation,
				title: reference.title,
				body: reference.description
			}
		],
		table: {
			headers: ['Question', 'Cloudflare docs', 'This Devflare page'],
			rows: [
				[
					'Primary focus',
					reference.description,
					`How to author \`${guide.configKey}\`, what the runtime surface looks like, and how ${guide.label} fits a Devflare project.`
				],
				[
					'Testing and runtime lens',
					getCloudflareRuntimeComparison(guide),
					`${guide.localStory}. Use the Devflare guidance when you need the honest local harness or the right remote gate instead of only the product API shape.`
				],
				[
					'When to open it',
					'When you need the platform contract, limits, APIs, or account-level product details.',
					'When you are wiring, testing, previewing, or reviewing the binding inside a Devflare app.'
				]
			]
		}
	}
}

function createBindingDeepDiveSection(guide: BindingGuideDefinition): DocSection {
	const slugs = getBindingSlugs(guide.slugBase)

	return {
		id: 'go-deeper',
		title: 'Go deeper only if this one-page guide stops being enough',
		cards: [
			{
				href: bindingDocPath(slugs.internals),
				label: 'Subpage',
				meta: 'Internals',
				title: `${guide.label} internals`,
				body: `See normalization, ${guide.internals.compileTarget}, and the preview or runtime details behind the authored shape.`
			},
			{
				href: bindingDocPath(slugs.testing),
				label: 'Subpage',
				meta: 'Testing',
				title: `Testing ${guide.label}`,
				body: `Start from ${guide.testing.defaultHarness} and only escalate when the binding or deployment model genuinely needs it.`
			},
			{
				href: bindingDocPath(slugs.example),
				label: 'Subpage',
				meta: 'Example',
				title: `${guide.label} example`,
				body: 'Adapt one small end-to-end path before you hide the binding behind a bigger abstraction.'
			}
		]
	}
}

function createBindingPages(guide: BindingGuideDefinition): DocPage[] {
	const slugs = getBindingSlugs(guide.slugBase)

	return [
		{
			slug: slugs.overview,
			group: bindingReferenceGroup,
			navTitle: guide.label,
			articleNavigationHidden: true,
			readTime: guide.overview.readTime,
			eyebrow: 'Binding reference',
			title: guide.overview.title,
			summary: guide.overview.summary,
			description: guide.overview.description,
			highlights: guide.overview.highlights,
			facts: [
				{ label: 'Config key', value: guide.configKey },
				{ label: 'Authoring shape', value: guide.authoringShape },
				{ label: 'Best for', value: guide.overview.bestFor }
			],
			sourcePages: guide.sourcePages,
			sections: [
				{
					id: 'authoring-shape',
					title: 'Author it in the simplest shape that still says what you mean',
					paragraphs: guide.overview.authoringParagraphs,
					snippets: [guide.overview.authoringSnippet]
				},
				{
					id: 'when-it-fits',
					title: 'When this binding fits best',
					bullets: guide.overview.fitBullets
				},
				{
					id: 'notes-that-matter',
					title: 'Notes worth keeping visible',
					bullets: guide.overview.caveatBullets,
					callouts: guide.overview.caveatCallout ? [guide.overview.caveatCallout] : undefined
				},
				createBindingReferenceSection(guide),
				createBindingDeepDiveSection(guide)
			]
		},
		{
			slug: slugs.internals,
			group: bindingReferenceGroup,
			sidebarHidden: true,
			navTitle: `${guide.label} internals`,
			readTime: guide.internals.readTime,
			eyebrow: 'Under the hood',
			title: `How Devflare wires ${guide.label} from config to runtime`,
			summary: guide.internals.summary,
			description: guide.internals.description,
			highlights: guide.internals.highlights,
			facts: [
				{ label: 'Normalization', value: guide.internals.normalizationFact },
				{ label: 'Compile target', value: guide.internals.compileTarget },
				{ label: 'Preview note', value: guide.internals.previewNote }
			],
			sourcePages: guide.sourcePages,
			sections: [
				{
					id: 'normalization',
					title: 'Devflare normalizes the authored shape before it does anything louder',
					paragraphs: guide.internals.normalizationParagraphs,
					snippets: [createBindingInternalsSnippet(guide)]
				},
				{
					id: 'local-runtime',
					title: 'Local runtime support depends on what Devflare can model directly',
					bullets: guide.internals.localRuntimeBullets
				},
				{
					id: 'compile-preview',
					title: 'Compile, preview, and cleanup behavior',
					bullets: guide.internals.compileBullets,
					callouts: guide.internals.callout ? [guide.internals.callout] : undefined
				}
			]
		},
		{
			slug: slugs.testing,
			group: bindingReferenceGroup,
			sidebarHidden: true,
			navTitle: `Testing ${guide.label}`,
			readTime: guide.testing.readTime,
			eyebrow: 'Testing',
			title: `Test ${guide.label} the way Devflare expects it to run`,
			summary: guide.testing.summary,
			description: guide.testing.description,
			highlights: guide.testing.highlights,
			facts: [
				{ label: 'Best for', value: guide.testing.bestFor },
				{ label: 'Default harness', value: guide.testing.defaultHarness },
				{ label: 'Escalate when', value: guide.testing.escalation }
			],
			sourcePages: guide.sourcePages,
			sections: [
				{
					id: 'default-loop',
					title: 'Start with the default test loop',
					paragraphs: guide.testing.paragraphs,
					snippets: [guide.testing.mainSnippet]
				},
				{
					id: 'helper-surface',
					title: 'The helper surface to remember',
					bullets: guide.testing.helperBullets
				},
				{
					id: 'when-to-escalate',
					title: 'When to move beyond the default harness',
					bullets: guide.testing.caveatBullets,
					callouts: guide.testing.callout ? [guide.testing.callout] : undefined
				}
			]
		},
		{
			slug: slugs.example,
			group: bindingReferenceGroup,
			sidebarHidden: true,
			navTitle: `${guide.label} example`,
			readTime: guide.example.readTime,
			eyebrow: 'Starter example',
			title: `A small ${guide.label} example you can adapt quickly`,
			summary: guide.example.summary,
			description: guide.example.description,
			highlights: guide.example.highlights,
			facts: [
				{ label: 'Config focus', value: guide.example.configFocus },
				{ label: 'Runtime shape', value: guide.example.runtimeShape },
				{ label: 'Best use', value: guide.example.bestUse }
			],
			sourcePages: guide.sourcePages,
			sections: [
				{
					id: 'configure-it',
					title: 'Start by wiring the binding clearly in config',
					snippets: [guide.example.configSnippet]
				},
				{
					id: 'use-it',
					title: 'Then use it in one honest runtime path',
					snippets: [guide.example.usageSnippet],
					bullets: guide.example.notes
				},
				{
					id: 'lock-it-in',
					title: guide.example.testSnippet ? 'Lock in the behavior with one small test or smoke path' : 'Keep the first version boring on purpose',
					snippets: guide.example.testSnippet ? [guide.example.testSnippet] : undefined,
					callouts: guide.example.callout ? [guide.example.callout] : undefined
				}
			]
		}
	]
}

const bindingGuides: BindingGuideDefinition[] = [
	{
		slugBase: 'kv',
		label: 'KV',
		categoryDescription: 'Fast lookup state, cache-like reads, and lightweight shared data with strong local support.',
		configKey: 'bindings.kv',
		authoringShape: 'Record<string, string | { name: string } | { id: string }>',
		localStory: 'First-class local runtime and tests',
		sourcePages: ['schema-bindings.ts', 'schema-normalization.ts', 'resource-resolution.ts', 'simple-context.ts', 'apps/testing/*'],
		overview: {
			readTime: '4 min read',
			title: 'Use KV for fast lookup state without losing a real local loop',
			summary: 'KV bindings are first-class in Devflare: author stable names in config, keep env typed, and run real get or put flows locally.',
			description: 'Devflare lets you keep KV intent human-readable in `devflare.config.ts` and only resolve opaque namespace ids when build or deploy flows actually need them.',
			highlights: [
				'String shorthand and `{ name }` keep namespace intent readable in source.',
				'`createTestContext()` wires KV into the real env contract used by worker code.',
				'Preview-scoped KV names can be materialized and lifecycle-managed automatically.',
				'`devflare types` keeps `env.d.ts` aligned with the bindings you actually declared.'
			],
			bestFor: 'Cache-like lookups, sessions, feature flags, and lightweight request metadata',
			authoringParagraphs: [
				'KV is happiest when you keep the namespace name stable in authored config and let Devflare resolve ids later. That keeps reviews readable and avoids hiding infrastructure intent in random environment variables.',
				'When you truly already know the namespace id, Devflare accepts that too. The important part is that both shapes compile down to the same deploy-facing contract.'
			],
			authoringSnippet: {
				title: 'KV authoring with stable names or explicit ids',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'kv-worker',
	bindings: {
		kv: {
			CACHE: 'cache-kv',
			SESSIONS: { name: 'sessions-kv' },
				REPORTING_CACHE: { id: 'kv-namespace-id' }
		}
	}
})`
			},
			fitBullets: [
				'Reach for KV when reads are by key and you do not need relational queries.',
				'It is a good home for feature flags, lightweight session markers, or cache records that are cheap to recompute.',
				'If you need SQL, batch transactions, or richer query patterns, use D1 instead of forcing KV to act like a database.'
			],
			caveatBullets: [
				'Rerun `devflare types` after adding or renaming a binding so the generated env contract stays honest.',
				'Preview-scoped names work well for namespace-per-branch flows, but they are still a naming strategy you should review on purpose.',
				'KV is local-friendly, but account-level provisioning behavior still belongs in build, preview, or deploy checks when the lifecycle matters.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'The safest authoring instinct',
				body: [
					'Prefer stable names in source and let Devflare resolve ids later. It keeps config readable without giving up deploy-ready output.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary: 'KV goes through the full Devflare pipeline: normalize authoring, resolve names when needed, then compile to Wrangler output.',
			description: 'The important detail is that Devflare does not force ids too early. It keeps stable names readable in source and only turns them into deploy-ready output in flows that truly require it.',
			highlights: [
				'String shorthand is treated as a stable namespace name.',
				'Name-based bindings stay name-based until a build or deploy flow resolves them.',
				'Local runtime can wire KV without Cloudflare lookup when all you need is a local namespace identifier.',
				'Compile emits Wrangler-compatible `kv_namespaces`.'
			],
			normalizationFact: 'String and `{ name }` forms both normalize to name-based bindings first',
			compileTarget: 'Wrangler `kv_namespaces`',
			previewNote: 'Preview-scoped KV namespaces can be provisioned and cleaned up automatically',
			normalizationParagraphs: [
				'`bindings.kv` accepts a plain string, `{ name }`, or `{ id }`. Devflare normalizes those into one internal shape so later code can reason about them consistently.',
				'That is why authored config can stay human-readable without making compiler or deploy code guess what each record means at the last second.'
			],
			localRuntimeBullets: [
				'Local runtime resolution can keep the configured name as the local namespace identifier instead of forcing a Cloudflare API lookup.',
				'The env proxy supports the real KV methods you expect in worker code, including `get`, `put`, `delete`, `list`, and `getWithMetadata`.',
				'If you only need isolated unit tests, the repo also exposes `createMockKV()` and `createMockEnv()` helpers.'
			],
			compileBullets: [
				'Build and deploy flows resolve stable namespace names into ids when the output must be Wrangler-ready.',
				'If unresolved name-based KV bindings remain at compile time, Devflare rejects the config instead of silently guessing.',
				'Preview-scoped KV names are treated as lifecycle-managed resources, so branch-specific namespaces can be provisioned and cleaned up deliberately.'
			],
			callout: {
				tone: 'success',
				title: 'Why the split matters',
				body: [
					'Authored config can stay stable and readable even though deploy output eventually needs concrete ids. That separation is a big part of why KV feels pleasant in Devflare.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'Use the default test harness first. KV is one of the bindings Devflare supports best in local tests.',
			description: 'When you call `createTestContext()`, KV namespaces are wired into the same env contract your worker code uses. That lets you test reads and writes without inventing a fake abstraction first.',
			highlights: [
				'`createTestContext()` is usually enough for meaningful KV tests.',
				'Use `env.CACHE` directly for fast binding-focused checks.',
				'Use `cf.worker.fetch()` when the binding matters as part of a route or handler flow.',
				'Mock helpers exist, but the default local harness is usually better.'
			],
			bestFor: 'Worker tests that read and write real KV values through the local harness',
			defaultHarness: '`createTestContext()` plus `env.CACHE` or `cf.worker.fetch()`',
			escalation: 'You need to verify provisioning, preview naming, or account-side behavior',
			paragraphs: [
				'Start small: create the test context, write a value, read it back, and only then move outward to HTTP or queue-driven flows.',
				'If the binding matters because a route uses it, test through that route. If the binding itself is the thing you are verifying, talk to `env.CACHE` directly.'
			],
			mainSnippet: {
				title: 'Testing KV through the real Devflare env',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('stores and reads a cache value', async () => {
	await env.CACHE.put('feature:search', 'on')
	expect(await env.CACHE.get('feature:search')).toBe('on')
})`
			},
			helperBullets: [
				'Use `env.CACHE` or the specific KV binding directly when you want the shortest binding-focused assertion.',
				'Use `cf.worker.fetch()` if the behavior only matters once a request has gone through your real handler.',
				'Use `createMockKV()` only when the test truly should not boot the runtime-shaped harness.'
			],
			caveatBullets: [
				'Local KV tests are excellent for behavior and shape, but they do not replace deploy-time checks for account provisioning or preview cleanup.',
				'If a test is really about routing, auth, or caching headers, keep the assertion at the worker level instead of overfocusing on the namespace API.',
				'Preview-specific namespace naming is worth one dedicated integration check when branch isolation matters.'
			],
			callout: {
				tone: 'accent',
				title: 'A good default split',
				body: [
					'Test binding semantics locally and test lifecycle semantics in preview or deploy-oriented paths. Trying to make one test do both usually makes it worse at each job.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This example keeps KV boring on purpose: one binding, one fetch handler, one assertion.',
			description: 'The fastest way to trust a binding is to wire one small use case end to end before you hide it behind a bigger app.',
			highlights: [
				'One binding in config is enough to learn the shape.',
				'A simple `put()` plus `get()` route already proves the local story.',
				'The first version should be about clarity, not cache invalidation genius.',
				'You can keep this same pattern while the app grows.'
			],
			configFocus: 'Stable namespace naming',
			runtimeShape: 'Direct `put()` and `get()` calls in a fetch handler',
			bestUse: 'A tiny cache or session-marker flow',
			configSnippet: {
				title: 'Minimal KV config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'kv-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		kv: {
			CACHE: 'cache-kv'
		}
	}
})`
			},
			usageSnippet: {
				title: 'A tiny fetch handler that uses KV',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

export async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)

	if (url.pathname === '/write') {
		await env.CACHE.put('hello', 'from-kv')
		return new Response('stored')
	}

	return new Response((await env.CACHE.get('hello')) ?? 'missing')
}`
			},
			testSnippet: {
				title: 'One tiny test is enough to trust the first version',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('writes and reads through the worker', async () => {
	await cf.worker.get('/write')
	const response = await cf.worker.get('/')
	expect(await response.text()).toBe('from-kv')
})`
			},
			notes: [
				'Run `devflare types` once the binding exists so `env.CACHE` is typed in both worker code and tests.',
				'Prefer a tiny route like this before you wrap KV behind a helper or service layer.'
			],
			callout: {
				tone: 'info',
				title: 'Start with the boring shape',
				body: [
					'If the first KV example already feels abstract, it is probably hiding the actual binding semantics instead of teaching them.'
				]
			}
		}
	},
	{
		slugBase: 'd1',
		label: 'D1',
		categoryDescription: 'SQLite-style relational queries with a strong local harness and id or name-based authoring.',
		configKey: 'bindings.d1',
		authoringShape: 'Record<string, string | { name: string } | { id: string }>',
		localStory: 'First-class local runtime and tests',
		sourcePages: ['schema-bindings.ts', 'schema-normalization.ts', 'resource-resolution.ts', 'simple-context.ts', 'case18/*'],
		overview: {
			readTime: '4 min read',
			title: 'Use D1 when the worker wants real queries instead of key-value tricks',
			summary: 'D1 gets the same stable-name authoring story as KV, but the runtime shape is relational: `prepare`, `batch`, `exec`, and prepared statements.',
			description: 'Devflare keeps D1 readable in config and testable in local runtime, which means you can model actual query behavior before you wire up preview or deploy steps.',
			highlights: [
				'String shorthand means a stable database name, not a magic hidden id.',
				'Local runtime supports the D1 methods developers actually use in worker code.',
				'Build and deploy can resolve names to ids when they need Wrangler-ready output.',
				'Preview-scoped D1 names can be lifecycle-managed when branch isolation matters.'
			],
			bestFor: 'Structured data, SQL queries, and cases where key-based lookup is not enough',
			authoringParagraphs: [
				'D1 follows the same stable-name instinct as KV: author by readable name unless you intentionally already have a database id you want to pin to.',
				'That gives teams one repeatable review habit: look for human-meaningful names in source, then inspect generated or resolved output only when a deploy flow needs it.'
			],
			authoringSnippet: {
				title: 'D1 binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'd1-worker',
	bindings: {
		d1: {
			DB: 'app-db',
			AUDIT: { name: 'audit-db' },
				REPORTING: { id: 'd1-database-id' }
		}
	}
})`
			},
			fitBullets: [
				'Use D1 when the worker needs SQL, joins, or a schema that should be queried instead of fetched by a single key.',
				'It fits better than KV for records that need filtering, ordering, or transactional updates.',
				'If the only operation is key lookup or a tiny cache record, KV usually stays simpler.'
			],
			caveatBullets: [
				'Run `devflare types` after binding changes so the database bindings show up correctly in `env.d.ts`.',
				'Preview-scoped databases are useful when branch data must stay isolated, but they should still be provisioned and cleaned up deliberately.',
				'Name-based D1 authoring is readable, but build and deploy still need a path that resolves those names to ids before output is treated as final.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'Do not hide the database shape',
				body: [
					'The point of D1 docs is to keep SQL visible enough that reviewers can still understand what the worker is doing, not to hide every query behind framework glue.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary: 'D1 uses the same normalize-then-resolve pattern as KV, but compiles to Wrangler `d1_databases` and exposes a relational local runtime surface.',
			description: 'The key implementation detail is that Devflare can keep a stable database name around until a flow truly needs the real database id. That keeps config readable without giving up deploy precision.',
			highlights: [
				'String shorthand and `{ name }` both normalize to name-based D1 bindings first.',
				'Local runtime can wire D1 without forcing Cloudflare lookups up front.',
				'Compile emits `d1_databases` after resolution.',
				'Prepared statements, `batch()`, and `exec()` are all part of the supported local runtime story.'
			],
			normalizationFact: 'Name-based authoring stays name-based until a build or deploy flow resolves it',
			compileTarget: 'Wrangler `d1_databases`',
			previewNote: 'Preview-scoped D1 databases can be provisioned and cleaned up by Devflare',
			normalizationParagraphs: [
				'Like KV, D1 bindings normalize into one internal shape so compiler and runtime code do not need to special-case string versus object authoring everywhere.',
				'That normalized form is what lets Devflare keep the friendly source-of-truth shape while still generating strict Wrangler-facing output later.'
			],
			localRuntimeBullets: [
				'The local bridge exposes the D1 APIs people actually use: `prepare()`, `batch()`, `exec()`, and the prepared-statement helpers like `first`, `all`, `run`, and `raw`.',
				'`createTestContext()` can boot those bindings without a custom mock layer, which is why D1 tests can stay close to production query code.',
				'If you only need isolated unit tests, `createMockD1()` exists, but it is usually weaker than the full runtime-shaped harness.'
			],
			compileBullets: [
				'Build and deploy resolve name-based D1 records to real database ids before Devflare emits compiled config.',
				'Compile rejects unresolved name-based D1 bindings instead of silently producing half-finished Wrangler output.',
				'Preview resource management can create and later remove branch-specific D1 databases when the preview model truly owns separate data.'
			],
			callout: {
				tone: 'success',
				title: 'Same authoring rule, different runtime shape',
				body: [
					'The config story is close to KV, but the runtime story is unapologetically SQL-shaped. That is exactly how it should feel.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'D1 is one of the easiest bindings to test meaningfully with Devflare because the local runtime already speaks the same database API your worker uses.',
			description: 'Start with `createTestContext()`, then either query the database directly through `env.DB` or exercise it through your real routes. Both are normal, not exotic.',
			highlights: [
				'Use the local harness before you build fake database abstractions.',
				'`env.DB.prepare(...).first()` is already a good binding test.',
				'Worker-level tests are better when SQL behavior only matters through an HTTP or queue path.',
				'Escalate to integration only when schema migrations or account-side provisioning are the real question.'
			],
			bestFor: 'Query behavior, route-level database flows, and schema-aware worker tests',
			defaultHarness: '`createTestContext()` with `env.DB` or `cf.worker.fetch()`',
			escalation: 'You need migration, provisioning, or branch-scoped preview verification',
			paragraphs: [
				'The cleanest D1 test loop mirrors how the worker really behaves: boot the test context, run a small query, and assert the returned row or route result.',
				'If a helper wraps the query logic, keep one direct database test around anyway so the underlying binding contract stays visible.'
			],
			mainSnippet: {
				title: 'A tiny D1 test through the local harness',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('D1 answers a simple health query', async () => {
	const row = await env.DB.prepare('select 1 as ok').first<{ ok: number }>()
	expect(row?.ok).toBe(1)
})`
			},
			helperBullets: [
				'Use `env.DB` when the binding itself is the thing you care about.',
				'Use `cf.worker.fetch()` when the database matters because a route, queue consumer, or other handler reaches it.',
				'Keep the schema setup close to the test when possible so the query story stays visible.'
			],
			caveatBullets: [
				'Local tests are excellent for query logic, but they are not a substitute for migration review or account-side database provisioning checks.',
				'If the assertion is really about a business route, do not collapse the entire behavior down to one raw SQL assertion and pretend that is the full story.',
				'Preview-specific D1 isolation is worth its own higher-level check when branch data boundaries matter.'
			],
			callout: {
				tone: 'warning',
				title: 'Do not let SQL disappear into helper fog',
				body: [
					'One reason D1 feels good in Devflare is that the runtime API is still recognizable. Keep at least one test close enough to see the actual query behavior.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This starter example keeps D1 focused on one job: answer a single query and prove the binding works locally.',
			description: 'You do not need a giant ORM story to prove D1 is wired correctly. One table-shaped query is already enough to make the point.',
			highlights: [
				'One binding plus one query proves the setup.',
				'The same shape scales into larger route handlers later.',
				'Keep SQL visible in the example so the binding story stays honest.',
				'If the app grows, you can still keep one tiny D1 route as a smoke path.'
			],
			configFocus: 'Stable database naming',
			runtimeShape: 'Prepared statement query in a fetch handler',
			bestUse: 'Health checks, small lookup routes, and early schema experiments',
			configSnippet: {
				title: 'Minimal D1 config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'd1-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		d1: {
			DB: 'app-db'
		}
	}
})`
			},
			usageSnippet: {
				title: 'A tiny route that proves the binding works',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	const row = await env.DB.prepare('select 1 as ok').first<{ ok: number }>()
	return Response.json({ ok: row?.ok === 1 })
}`
			},
			testSnippet: {
				title: 'A matching smoke test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET / returns a D1-backed health response', async () => {
	const response = await cf.worker.get('/')
	expect(await response.json()).toEqual({ ok: true })
})`
			},
			notes: [
				'You can replace the health query with a real table lookup later without changing the binding shape.',
				'Keep one route like this around if you want a cheap deploy smoke path for D1.'
			],
			callout: {
				tone: 'info',
				title: 'The first example does not need a migration epic',
				body: [
					'Prove the binding first. Add richer schema setup only after the worker already has one truthful D1 path.'
				]
			}
		}
	},
	{
		slugBase: 'r2',
		label: 'R2',
		categoryDescription: 'Object storage bindings with strong local support and one important rule: do not assume a browser URL contract.',
		configKey: 'bindings.r2',
		authoringShape: 'Record<string, string>',
		localStory: 'First-class local runtime and tests',
		sourcePages: ['schema-bindings.ts', 'compiler.ts', 'simple-context.ts', 'verification-testing-and-caveats.md', 'apps/testing/*'],
		overview: {
			readTime: '4 min read',
			title: 'Use R2 for object storage, but route browser delivery on purpose',
			summary: 'R2 is straightforward in config and well-supported locally, but browser-facing delivery should usually go through a Worker route instead of assuming bucket URLs.',
			description: 'Devflare treats R2 as a first-class binding in worker code and tests. The main discipline is deciding which files are public, which are private, and which paths should stay app-controlled.',
			highlights: [
				'R2 authoring is intentionally simple: binding name to bucket name.',
				'Local runtime supports `head`, `get`, `put`, `delete`, and `list`.',
				'Preview-scoped bucket names can be materialized and lifecycle-managed.',
				'Devflare does not promise a stable browser-facing local bucket URL contract.'
			],
			bestFor: 'Files, uploads, generated assets, and private object delivery through a Worker',
			authoringParagraphs: [
				'R2 is the least ambiguous storage binding to author: you bind a name in env to a bucket name in config.',
				'The real architectural choice is not the config key. It is whether the browser talks to a public bucket, a signed upload path, or a worker-controlled route that checks auth first.'
			],
			authoringSnippet: {
				title: 'R2 binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'r2-worker',
	bindings: {
		r2: {
			ASSETS: 'assets-bucket',
			PRIVATE_FILES: 'private-files-bucket'
		}
	}
})`
			},
			fitBullets: [
				'Use R2 for large objects, uploads, or file delivery that does not belong in D1 or KV.',
				'Keep private file delivery in a Worker route so auth and response headers stay under your control.',
				'If the browser needs a direct public asset origin, use a public bucket on a custom domain on purpose rather than by accident.'
			],
			caveatBullets: [
				'Do not assume local bucket URLs are a public contract your app can safely depend on.',
				'Use `devflare types` after binding changes so bucket names show up correctly in `env.d.ts`.',
				'Preview-scoped buckets are useful, but they should still be cleaned up intentionally when previews expire.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'The browser-delivery rule',
				body: [
					'If the browser needs the file in local dev, route through your worker unless you intentionally chose a public bucket contract.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary: 'R2 is simpler than KV or D1 because the authored value is already the bucket name, so there is no name-versus-id resolution dance.',
			description: 'That simplicity is part of why R2 feels predictable in Devflare. The runtime and compiler story mostly focuses on wiring methods and generated output cleanly, not on translating names into ids.',
			highlights: [
				'`bindings.r2` is just a record of binding name to bucket name.',
				'Compile emits Wrangler `r2_buckets` directly.',
				'The bridge supports the core object methods and can move large puts over HTTP when needed.',
				'Preview-scoped bucket names are part of the managed preview resource story.'
			],
			normalizationFact: 'There is no separate id-resolution phase for the authored bucket name',
			compileTarget: 'Wrangler `r2_buckets`',
			previewNote: 'Preview-scoped buckets can be provisioned and cleaned up by Devflare',
			normalizationParagraphs: [
				'R2 is one of the cleanest bindings internally because the authored string is already the thing Wrangler expects later: the bucket name.',
				'That means Devflare mostly needs to preserve the mapping faithfully, generate output, and expose the runtime methods cleanly in local mode.'
			],
			localRuntimeBullets: [
				'The local bridge supports `head`, `get`, `put`, `delete`, and `list` on R2 buckets.',
				'Large `put()` operations can switch to HTTP transfer inside the bridge rather than trying to force every object body through one RPC path.',
				'`createMockR2()` exists for isolated tests, but the real local harness is usually the better default.'
			],
			compileBullets: [
				'Compile emits `r2_buckets` directly from the authored mapping.',
				'Preview resource lifecycle code can materialize branch-scoped bucket names, provision them, and later clean them up.',
				'The browser URL story is intentionally left to your app architecture rather than being smuggled into the binding implementation.'
			],
			callout: {
				tone: 'info',
				title: 'Simple binding, nontrivial delivery choices',
				body: [
					'R2 config is easy. The interesting decisions are about how files flow through your app, not about how many nested objects the config needs.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'R2 is local-friendly, which means you can test real object operations without inventing a storage adapter just to get off the ground.',
			description: 'Use the runtime-shaped harness for direct bucket tests, then move up to worker-level tests when headers, auth, or file routing matter.',
			highlights: [
				'Bucket operations work through the local harness.',
				'Worker-level tests are the right place for auth or response-header behavior.',
				'The local story is strong, but public asset delivery still needs architectural intent.',
				'Use preview or deploy checks when the real question is bucket provisioning or cleanup.'
			],
			bestFor: 'Object reads, writes, deletes, and route-level file-serving checks',
			defaultHarness: '`createTestContext()` with `env.ASSETS` or `cf.worker.fetch()`',
			escalation: 'You need to verify public delivery contracts or preview resource lifecycle',
			paragraphs: [
				'R2 tests can be extremely small: put one object, read it back, and confirm the content or headers through the same worker path users will actually hit.',
				'That is often enough to prove the binding, while the route test proves your app-level delivery rules.'
			],
			mainSnippet: {
				title: 'Testing a real R2 binding',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('stores and reads an object', async () => {
	await env.ASSETS.put('hello.txt', 'from-r2')
	const object = await env.ASSETS.get('hello.txt')
	expect(await object?.text()).toBe('from-r2')
})`
			},
			helperBullets: [
				'Use `env.ASSETS` when you are verifying the bucket contract itself.',
				'Use `cf.worker.fetch()` when the route, auth, or response metadata is the thing that matters.',
				'Keep at least one test close to the bucket API so the storage shape stays visible.'
			],
			caveatBullets: [
				'A passing local bucket test does not mean your public asset topology is good; that still belongs to route and deployment design.',
				'If the browser-facing path matters, assert the worker response instead of treating a bucket read as the whole user story.',
				'Bucket provisioning and cleanup belong in preview or deploy-oriented checks when branch infrastructure matters.'
			],
			callout: {
				tone: 'warning',
				title: 'Test the right layer',
				body: [
					'An object round-trip proves the binding. It does not automatically prove your file-delivery architecture.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This example uses one private bucket and one route, which is still the cleanest default shape for many real apps.',
			description: 'A good first R2 example teaches both the binding and the delivery boundary: the worker decides what the browser gets.',
			highlights: [
				'One bucket plus one route is enough to teach the real shape.',
				'Private delivery through a Worker is a strong default.',
				'Headers are part of the example because files are not just bytes.',
				'You can grow into signed uploads or public assets later.'
			],
			configFocus: 'Direct bucket naming',
			runtimeShape: 'Get an object from R2 and stream it through a route',
			bestUse: 'Private file delivery or media endpoints',
			configSnippet: {
				title: 'Minimal R2 config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'r2-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		r2: {
			FILES: 'private-files'
		}
	}
})`
			},
			usageSnippet: {
				title: 'Serve an object through the worker',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

export async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)
	const key = url.pathname.replace(/^\/files\//, '')
	const object = await env.FILES.get(key)

	if (!object) {
		return new Response('Not found', { status: 404 })
	}

	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream'
		}
	})
}`
			},
			testSnippet: {
				title: 'A quick route-level check',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET /files/hello.txt serves the stored object', async () => {
	await env.FILES.put('hello.txt', 'hello from r2')
	const response = await cf.worker.get('/files/hello.txt')
	expect(await response.text()).toBe('hello from r2')
})`
			},
			notes: [
				'This route pattern keeps auth, caching, and content-type decisions in your app instead of in an assumed bucket URL contract.',
				'If you later choose a public bucket, make that an explicit architecture decision rather than a hidden side effect.'
			],
			callout: {
				tone: 'info',
				title: 'A better first instinct than “just use the bucket URL”',
				body: [
					'Routing through the worker teaches the real boundary between stored objects and browser-facing responses.'
				]
			}
		}
	},
	{
		slugBase: 'durable-object',
		label: 'Durable Objects',
		categoryDescription: 'Stateful coordination primitives with strong local support, cross-worker wiring, and important preview caveats.',
		configKey: 'bindings.durableObjects',
		authoringShape: 'Record<string, string | { className: string; scriptName?: string }>',
		localStory: 'First-class local runtime and tests, including cross-worker references',
		sourcePages: ['schema-bindings.ts', 'ref.ts', 'do-bundler.ts', 'simple-context.ts', 'deploy-preview-cli.md'],
		overview: {
			readTime: '5 min read',
			title: 'Use Durable Objects when coordination or state really belongs with a single object identity',
			summary: 'Devflare treats Durable Objects as a real first-class surface in config, local runtime, and tests, not as an awkward plugin hanging off the side of the worker.',
			description: 'That makes DO-heavy apps easier to reason about locally, but it also means you should be honest about the preview and migration caveats that come with them.',
			highlights: [
				'Durable Object bindings can be local, explicit, or cross-worker through `ref()`.',
				'The local test story is strong enough to exercise real object behavior through the default harness.',
				'Devflare bundles discovered DO code and compiles the correct Wrangler binding shape.',
				'Preview URLs and DO migrations still follow real Cloudflare caveats.'
			],
			bestFor: 'Stateful sessions, locks, room state, and coordination that should not be faked as random stateless requests',
			authoringParagraphs: [
				'A DO binding can be as simple as a class name string when the object lives in the same worker package.',
				'When the object lives in another worker, `ref()` keeps that relationship explicit instead of scattering script names and class names across the repo.'
			],
			authoringSnippet: {
				title: 'Durable Object authoring in one worker',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'chat-worker',
	files: {
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			ROOM: 'ChatRoom',
			LOCK: { className: 'WriteLock' }
		}
	}
})`
			},
			fitBullets: [
				'Use Durable Objects when state or coordination should live behind one object identity, not when you merely want a fancy singleton.',
				'They are a good fit for rooms, counters, distributed locks, and request serialization.',
				'If the state is really just data you query, D1 or KV may stay simpler and easier to preview.'
			],
			caveatBullets: [
				'DO-heavy apps need extra preview care because same-worker preview URLs do not cover every real DO deployment case.',
				'`wrangler versions upload` does not currently apply Durable Object migrations, so migration-sensitive previews need a stronger plan.',
				'Test and review worker naming carefully when DO bindings cross worker boundaries.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'The preview caveat is real, not optional trivia',
				body: [
					'If previews must exercise real Durable Object behavior, branch-scoped preview workers are often safer than hoping same-worker preview URLs will be enough.'
				]
			}
		},
		internals: {
			readTime: '4 min read',
			summary: 'Durable Object bindings normalize into a stable binding shape, compile into Wrangler `durable_objects.bindings`, and participate in Devflare’s own DO bundling path.',
			description: 'This is one of the places where Devflare feels the most application-aware. It is not only compiling config — it is discovering DO classes, bundling them, and keeping local runtime behavior coherent.',
			highlights: [
				'String shorthand becomes `{ className }` in the normalized shape.',
				'Cross-worker bindings can carry `__ref` metadata and be resolved through the referenced worker config.',
				'DO bundling and transform steps are part of the build pipeline, not just a config pass-through.',
				'Compile emits `durable_objects.bindings` with `class_name` and optional `script_name`.'
			],
			normalizationFact: 'Local strings, explicit objects, and cross-worker refs normalize into one DO binding model',
			compileTarget: 'Wrangler `durable_objects.bindings`',
			previewNote: 'DO apps often need branch-scoped preview workers instead of same-worker preview URLs',
			normalizationParagraphs: [
				'DO bindings accept a string, an explicit `{ className, scriptName? }` object, or a cross-worker reference produced by `ref()`. Devflare normalizes those into one internal shape before later steps inspect them.',
				'That normalized shape is what lets config, compiler, and test-context setup all speak the same language even when a DO comes from another worker package.'
			],
			localRuntimeBullets: [
				'The local test context can auto-detect cross-worker DO refs and stand up the required multi-worker Miniflare shape for them.',
				'The DO bundler discovers classes from `files.durableObjects`, emits worker-compatible code, and even handles special cases like `@cloudflare/puppeteer` usage.',
				'Tests can use the normal DO namespace ergonomics instead of a custom fake API surface.'
			],
			compileBullets: [
				'Compile emits `class_name` and optional `script_name` for each binding, which is what Wrangler-facing output expects.',
				'Cross-worker DO references are resolved before compile output is treated as final.',
				'Preview and deploy workflows need to respect real DO migration and preview caveats instead of pretending the platform limitations disappeared.'
			],
			callout: {
				tone: 'accent',
				title: 'This is where Devflare earns its keep',
				body: [
					'If a tool cannot keep DO authoring, local runtime, and test setup coherent, DO-heavy apps get painful fast. Devflare’s value is that these pieces stay part of one story.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'Durable Objects are well-supported in the default Devflare harness, which means you can test real object behavior without hand-building a fake namespace first.',
			description: 'That support extends to cross-worker DO scenarios too, as long as the config relationships are explicit. The main testing question is whether you are checking local object behavior or deployment caveats.',
			highlights: [
				'Use the default harness before inventing a custom DO mock layer.',
				'Cross-worker DO bindings can still work in the test context when `ref()` wiring is explicit.',
				'Object-level behavior can be tested locally with real namespace and stub semantics.',
				'Preview caveats still need higher-level validation.'
			],
			bestFor: 'Local stateful behavior, object methods, and cross-worker DO wiring checks',
			defaultHarness: '`createTestContext()` with the real DO namespace in `env`',
			escalation: 'The question is preview URLs, migrations, or branch-scoped deploy behavior',
			paragraphs: [
				'Start by creating the test context and calling the object through its real namespace. That proves the binding, the identity lookup, and the object behavior in one go.',
				'Keep one test close to the object semantics even if your app later wraps DO access behind services or helper modules.'
			],
			mainSnippet: {
				title: 'Testing a Durable Object through the real namespace',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('the counter object increments', async () => {
	const id = env.COUNTER.idFromName('global')
	const stub = env.COUNTER.get(id)
	const response = await stub.fetch('https://counter/increment')
	expect(await response.text()).toBe('1')
})`
			},
			helperBullets: [
				'Use the real DO namespace in `env` whenever possible instead of a fake interface.',
				'If the object is reached through a route or another worker, keep a worker-level test around as well.',
				'Use cross-worker refs in config rather than loose string conventions so the test context can understand the relationship.'
			],
			caveatBullets: [
				'Local DO tests do not replace migration reviews or branch-scoped preview checks.',
				'If the real risk is deployment naming or preview topology, write a higher-level preview test instead of stretching the local harness past its job.',
				'DO apps often need stronger preview isolation than a same-worker upload path can give them.'
			],
			callout: {
				tone: 'warning',
				title: 'Separate object behavior from preview behavior',
				body: [
					'The default harness is excellent for object logic. It is not a substitute for the preview strategy decisions that DO-heavy apps still need.'
				]
			}
		},
		example: {
			readTime: '4 min read',
			summary: 'This example uses a tiny counter object because the shape is easy to understand and still proves the important DO wiring.',
			description: 'A counter is not glamorous, but it teaches the real ingredients: one binding, one class, one namespace lookup, and one request path that exercises state.',
			highlights: [
				'One class plus one binding is enough to learn the surface.',
				'The example keeps object identity explicit.',
				'You can use the same pattern for locks, rooms, or actor-like objects later.',
				'The first example should prove the state model, not your entire app architecture.'
			],
			configFocus: 'Explicit class discovery and DO binding',
			runtimeShape: 'Namespace lookup plus `stub.fetch()`',
			bestUse: 'Counters, room state, and small single-identity coordination examples',
			configSnippet: {
				title: 'Minimal Durable Object config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'do-example',
	files: {
		fetch: 'src/fetch.ts',
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			COUNTER: 'Counter'
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_classes: ['Counter']
		}
	]
})`
			},
			usageSnippet: {
				title: 'A tiny object and fetch path',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

// src/do/counter.ts should increment a stored value and return the new count.

export async function fetch(): Promise<Response> {
	const id = env.COUNTER.idFromName('global')
	const stub = env.COUNTER.get(id)
	return stub.fetch('https://counter/increment')
}`
			},
			testSnippet: {
				title: 'A matching local test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET / increments the counter object', async () => {
	const first = await cf.worker.get('/')
	const second = await cf.worker.get('/')
	expect(await first.text()).toBe('1')
	expect(await second.text()).toBe('2')
})`
			},
			notes: [
				'This tiny shape already proves that the object class, namespace, and fetch path are wired correctly.',
				'Once this works, richer room or lock logic becomes a normal extension instead of a blind leap.'
			],
			callout: {
				tone: 'info',
				title: 'The tiny state machine is enough',
				body: [
					'You do not need a chat app to learn Durable Objects. One counter proves the important mechanics without burying them.'
				]
			}
		}
	},
	{
		slugBase: 'queue',
		label: 'Queues',
		categoryDescription: 'Producer and consumer bindings for background work with a strong local trigger story.',
		configKey: 'bindings.queues',
		authoringShape: '{ producers?: Record<string, string>; consumers?: QueueConsumer[] }',
		localStory: 'First-class local runtime and queue-trigger tests',
		sourcePages: ['schema-bindings.ts', 'compiler.ts', 'preview-resources.ts', 'queue.ts', 'case6/*'],
		overview: {
			readTime: '4 min read',
			title: 'Use Queues when work should happen later, in batches, or with retries',
			summary: 'Devflare models Queue producers and consumers explicitly, which makes local tests and preview naming much easier to reason about.',
			description: 'The config shape keeps the relationship visible: which bindings can enqueue work, which consumer handles that queue, and how retries or dead-letter behavior should look.',
			highlights: [
				'Producers and consumers are modeled in one consistent `bindings.queues` shape.',
				'Compile turns that into Wrangler producer and consumer entries.',
				'`cf.queue.trigger()` makes local queue-consumer tests straightforward.',
				'Preview lifecycle can include queue and DLQ naming when branch-specific infrastructure matters.'
			],
			bestFor: 'Background jobs, async processing, fan-out work, and controlled retry behavior',
			authoringParagraphs: [
				'Queues are easiest to understand when the producer names and consumer config live together in the same authored source of truth.',
				'That way the code review already shows who sends messages, who processes them, and where failures go when retries run out.'
			],
			authoringSnippet: {
				title: 'Queue producer and consumer authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'queue-worker',
	bindings: {
		queues: {
			producers: {
				JOBS: 'jobs-queue'
			},
			consumers: [
				{
					queue: 'jobs-queue',
					deadLetterQueue: 'jobs-dlq',
					maxRetries: 3
				}
			]
		}
	}
})`
			},
			fitBullets: [
				'Use Queues when the worker should hand work off instead of blocking the original request.',
				'They are a good fit for batch processing, notifications, post-request writes, and work that deserves retry control.',
				'If the task must happen synchronously in the request path, a queue is probably the wrong tool.'
			],
			caveatBullets: [
				'Keep producer and consumer intent explicit so dead-letter and retry behavior is reviewable.',
				'Preview-scoped queues and DLQs are possible, but they should be created only when the preview really owns separate async infrastructure.',
				'Queue tests should separate handler behavior from wider route or scheduling concerns.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'The queue rule of thumb',
				body: [
					'If a request can safely say “I accepted the work” before the work is complete, queues are a good candidate. If not, keep it in the request path.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary: 'Queue config is compiled into explicit producer and consumer blocks, with preview resource materialization available for both queue names and DLQs.',
			description: 'This is one of the clearer compiler paths in Devflare: producers become env bindings, consumers become worker-side queue listeners, and preview lifecycle code can materialize names when the preview should own separate queues.',
			highlights: [
				'Compiler emits Wrangler `queues.producers` and `queues.consumers`.',
				'Consumer options like retries and concurrency are converted into the output shape Wrangler expects.',
				'Preview resource logic can materialize queue names and dead-letter queues.',
				'Local queue triggers fit naturally into the Devflare test harness.'
			],
			normalizationFact: 'Producer and consumer config is split into one normalized queue model before compile',
			compileTarget: 'Wrangler `queues.producers` and `queues.consumers`',
			previewNote: 'Preview queue names and DLQs can be provisioned and cleaned up when the preview owns them',
			normalizationParagraphs: [
				'Devflare does not treat queue producers and queue consumers as unrelated configuration fragments. It keeps them in one coherent config namespace so later compile and preview code can see the whole story.',
				'That is why review and runtime stay aligned: the config already names the queue, the producer binding, the consumer, and the dead-letter relationship in one place.'
			],
			localRuntimeBullets: [
				'The local harness can stand up queue producers as real env bindings and trigger the queue handler through test helpers.',
				'Queue helper behavior is different from plain worker fetch behavior because `cf.queue.trigger()` waits for queued background work before returning.',
				'That makes queue tests a good place to assert post-processing side effects directly.'
			],
			compileBullets: [
				'Compile converts consumer options into the output shape Wrangler expects, including retry and dead-letter fields.',
				'Preview materialization can generate branch-specific queue and DLQ names when the preview environment should own separate async infrastructure.',
				'This lifecycle support covers queue resources more directly than service bindings, which mostly stay name-based references.'
			],
			callout: {
				tone: 'success',
				title: 'Queues stay reviewable when the config stays explicit',
				body: [
					'The combination of producers, consumers, and dead-letter settings is much easier to trust when it lives in one visible authored shape.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'Queue testing is one of the places where Devflare’s helper surface feels especially good because the queue trigger already knows how to drive the real handler shape.',
			description: 'That means you can test a queue consumer without bootstrapping your own fake message batch or pretending the queue handler is just a random function.',
			highlights: [
				'`cf.queue.trigger()` is the normal first tool for queue-consumer tests.',
				'Queue triggers wait for background work before they return.',
				'Producer-side tests can still use the real binding through `env.JOBS.send(...)`.',
				'Use higher-level worker tests only when queueing is part of a larger route behavior.'
			],
			bestFor: 'Queue consumer behavior, retries, and queue-driven side effects',
			defaultHarness: '`createTestContext()` plus `cf.queue.trigger()`',
			escalation: 'You need to verify preview queue lifecycle or deployment topology',
			paragraphs: [
				'Start by triggering the consumer directly. That is usually the shortest path to proving retries, acknowledgements, and side effects like KV writes or database updates.',
				'If the queue is reached from an HTTP route, keep one route-level test too so the enqueue step itself stays visible.'
			],
			mainSnippet: {
				title: 'Testing a queue consumer through Devflare helpers',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('queue consumer stores a processed result', async () => {
	await cf.queue.trigger([
		{
			id: 'job-1',
			body: { id: 'task-1', type: 'process', createdAt: Date.now() }
		}
	])

	expect(await env.RESULTS.get('result:task-1')).not.toBeNull()
})`
			},
			helperBullets: [
				'Use `cf.queue.trigger()` when the consumer behavior is what you care about.',
				'Use `env.JOBS.send()` when you want to prove enqueue code in the same runtime path.',
				'Queue tests are a good place to assert retries or DLQ behavior because the helper already understands the message shape.'
			],
			caveatBullets: [
				'Queue helper success does not automatically prove your preview or deploy queue topology is right.',
				'If the route-to-queue path matters, keep one request test so the enqueue boundary stays visible.',
				'Batch semantics and failure handling deserve their own tests instead of one giant everything-at-once assertion.'
			],
			callout: {
				tone: 'accent',
				title: 'Queue tests are allowed to be direct',
				body: [
					'You do not need to sneak queue behavior behind HTTP if the queue consumer itself is the thing you want confidence in.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This starter example wires one producer, one consumer, and one stored result so you can see the whole queue loop without ceremony.',
			description: 'A good queue example should prove three things quickly: the request can enqueue work, the consumer can process it, and some visible side effect confirms the work ran.',
			highlights: [
				'One producer plus one consumer is enough to learn the shape.',
				'The side effect should be visible and cheap to assert.',
				'Retries belong in tests once the happy path is working.',
				'This shape scales naturally into larger background pipelines later.'
			],
			configFocus: 'Explicit producer and consumer config',
			runtimeShape: 'Request enqueues work, queue handler stores result',
			bestUse: 'Background jobs and post-request processing',
			configSnippet: {
				title: 'Minimal queue config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'queue-example',
	bindings: {
		kv: {
			RESULTS: 'results-kv'
		},
		queues: {
			producers: {
				JOBS: 'jobs-queue'
			},
			consumers: [
				{
					queue: 'jobs-queue'
				}
			]
		}
	}
})`
			},
			usageSnippet: {
				title: 'One fetch path and one queue consumer',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'
import type { MessageBatch } from '@cloudflare/workers-types'

export async function fetch(): Promise<Response> {
	await env.JOBS.send({ id: 'job-1', createdAt: Date.now() })
	return new Response('queued', { status: 202 })
}

export async function queue(batch: MessageBatch<{ id: string }>): Promise<void> {
	for (const message of batch.messages) {
		await env.RESULTS.put('job:' + message.body.id, 'done')
		message.ack()
	}
}`
			},
			testSnippet: {
				title: 'A direct consumer test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('queue work writes a result record', async () => {
	await cf.queue.trigger([{ id: 'msg-1', body: { id: 'job-1' } }])
	expect(await env.RESULTS.get('job:job-1')).toBe('done')
})`
			},
			notes: [
				'Once this shape works, you can add retries, DLQs, and richer payloads without changing the fundamental loop.',
				'This example stays intentionally small so the queue contract is the thing you notice first.'
			],
			callout: {
				tone: 'info',
				title: 'Keep the first side effect visible',
				body: [
					'Writing one result record is a better first example than a complex job pipeline you cannot see end to end.'
				]
			}
		}
	},
	{
		slugBase: 'service',
		label: 'Services',
		categoryDescription: 'Worker-to-worker bindings with `ref()` support, typed env generation, and good local multi-worker tests.',
		configKey: 'bindings.services',
		authoringShape: 'Record<string, { service: string; environment?: string; entrypoint?: string }> | ref().worker(...)',
		localStory: 'First-class local runtime and multi-worker tests',
		sourcePages: ['schema-bindings.ts', 'ref.ts', 'resolve-service-bindings.ts', 'generator.ts', 'case5/*'],
		overview: {
			readTime: '4 min read',
			title: 'Use service bindings to keep multi-worker apps explicit instead of magical',
			summary: 'Service bindings and `ref()` let you describe worker-to-worker relationships in config, then test them locally without turning names into lore.',
			description: 'This is the clean lane for apps that grew into more than one worker. The biggest win is not fancy RPC — it is naming and entrypoint relationships that stay visible enough to review.',
			highlights: [
				'`ref()` keeps service relationships explicit instead of relying on loose string conventions.',
				'Devflare can model default worker exports and named entrypoints.',
				'Local multi-worker tests work through the same env surface the app uses.',
				'`devflare types` can generate typed service bindings and fall back to `Fetcher` when a service cannot be typed.'
			],
			bestFor: 'Multi-worker systems, internal RPC boundaries, and explicit service composition',
			authoringParagraphs: [
				'Service bindings are easiest to trust when the relationship lives in config, not in a mix of environment variables and copied worker names.',
				'`ref()` is especially useful because it keeps the dependency explicit while still allowing Devflare to resolve and type the linked worker later.'
			],
			authoringSnippet: {
				title: 'Service binding authoring with `ref()`',
				language: 'ts',
				code: String.raw`import { defineConfig, ref } from 'devflare/config'

const mathService = ref(() => import('../math-service/devflare.config'))

export default defineConfig({
	name: 'gateway',
	bindings: {
		services: {
			MATH_SERVICE: mathService.worker,
			ADMIN: mathService.worker('AdminEntrypoint')
		}
	}
})`
			},
			fitBullets: [
				'Use service bindings when another worker is a real dependency, not when one large worker is merely inconvenient to think about.',
				'They are a strong fit for internal APIs, admin surfaces, search workers, and explicit worker-family boundaries.',
				'If the dependency is actually shared data rather than another service boundary, a direct binding like D1, KV, or DO may stay simpler.'
			],
			caveatBullets: [
				'Preview isolation follows resolved worker names, not just whatever branch or alias string you passed to a deploy command.',
				'Named entrypoints are modeled, but critical production wiring is still worth validating in compiled output.',
				'Service bindings are references, not preview-managed account resources like KV, D1, or queues.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'A very good review question',
				body: [
					'Ask which worker names a preview will actually deploy before you assume the worker family is isolated.'
				]
			}
		},
		internals: {
			readTime: '4 min read',
			summary: 'Devflare resolves referenced worker configs, bundles the linked worker surfaces, and then exposes those services as local multi-worker bindings.',
			description: 'That is why service bindings feel more than cosmetic: the tooling actually follows the relationship far enough to keep local tests, type generation, and compiled output aligned.',
			highlights: [
				'Compiler emits Wrangler `services` entries.',
				'`ref()` can resolve both default worker exports and named entrypoints.',
				'Local multi-worker setup uses generated service binding metadata, not lucky guesses.',
				'Type generation can map service bindings to real interfaces when Devflare knows enough about the target.'
			],
			normalizationFact: 'Plain objects and `ref().worker(...)` values normalize into one service-binding model',
			compileTarget: 'Wrangler `services`',
			previewNote: 'Preview can rewrite service names, but service bindings are not preview-managed resources like KV or D1',
			normalizationParagraphs: [
				'Service bindings can be authored as plain binding objects or as `ref().worker(...)` results. Devflare normalizes those into one shape so compiler, type generation, and test setup can all reason about them consistently.',
				'When a binding comes from `ref()`, Devflare can follow the referenced config, discover the relevant worker surface, and keep that relationship visible in local tooling.'
			],
			localRuntimeBullets: [
				'`resolveServiceBindings()` is responsible for following referenced configs and bundling the default `worker.ts` export or named entrypoints as needed.',
				'Local multi-worker Miniflare wiring uses the resolved service metadata so a gateway worker can call another worker naturally in tests.',
				'Type generation can emit service-specific interfaces; if that is not possible, the binding falls back to a generic `Fetcher` contract.'
			],
			compileBullets: [
				'Compile emits the standard `services` array that Wrangler expects.',
				'Preview flows can rewrite service names when the preview naming rules say they should, but there is no separate resource-provisioning lifecycle for services themselves.',
				'Critical production wiring is still worth checking through `config print`, `build`, or dry-run deploy output.'
			],
			callout: {
				tone: 'success',
				title: 'This is configuration as architecture, not just syntax',
				body: [
					'Service bindings work well in Devflare because the relationships are explicit enough for tooling to follow, type, and test.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'Service binding tests can stay in the default harness, even for multi-worker setups, which is a big part of why the pattern is usable instead of theatrical.',
			description: 'Start with `createTestContext()`, then call the bound service through the generated env shape. That proves the service wiring in the same language the app itself uses.',
			highlights: [
				'`createTestContext()` can auto-detect service bindings from config.',
				'The default and named entrypoint stories are both testable through the env.',
				'Generated env types make service calls much easier to trust.',
				'You only need higher-level deploy checks when naming or preview topology is the real risk.'
			],
			bestFor: 'Gateway-to-service calls, entrypoint wiring, and typed multi-worker behavior',
			defaultHarness: '`createTestContext()` plus `env.MY_SERVICE`',
			escalation: 'The risk is worker naming drift, preview topology, or compiled output correctness',
			paragraphs: [
				'The shortest honest test is usually one real service call through the generated env binding. That already proves the config relationship and the callable surface.',
				'Keep one test for the default worker entry and one for any named entrypoint that matters operationally.'
			],
			mainSnippet: {
				title: 'Testing a service binding through the env',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('service binding calls the default worker export', async () => {
	expect(await env.MATH_SERVICE.add(5, 3)).toBe(8)
})`
			},
			helperBullets: [
				'Use the bound env service directly when the service relationship is the thing you want to prove.',
				'Keep named entrypoints explicit in tests so they do not quietly drift from the config contract.',
				'Run `devflare types` whenever service entrypoints change so env autocomplete and generated types stay in sync.'
			],
			caveatBullets: [
				'Local tests prove the callable relationship, not that your preview or production worker names are what you intended.',
				'If the service graph is business-critical, validate compiled output before deploys as well.',
				'Test naming and topology at preview or build time when those are the real failure modes.'
			],
			callout: {
				tone: 'warning',
				title: 'A typed local call is not the whole deploy story',
				body: [
					'The local harness tells you the relationship is modeled correctly. A preview or build check tells you the resolved worker names are still the ones you expect.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This example keeps the service story tiny: one gateway worker, one math worker, and one method call through the generated env binding.',
			description: 'That is enough to prove the multi-worker wiring without turning the example into a distributed-systems thesis.',
			highlights: [
				'One worker calling another is enough to learn the pattern.',
				'`ref()` keeps the dependency visible.',
				'The env binding is the public contract the gateway uses.',
				'You can grow into named entrypoints later without changing the mental model.'
			],
			configFocus: 'Explicit `ref()` wiring',
			runtimeShape: 'One env service call from the gateway worker',
			bestUse: 'Internal APIs and worker-family boundaries',
			configSnippet: {
				title: 'Gateway config with a service ref',
				language: 'ts',
				code: String.raw`import { defineConfig, ref } from 'devflare/config'

const mathService = ref(() => import('../math-service/devflare.config'))

export default defineConfig({
	name: 'gateway',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		services: {
			MATH_SERVICE: mathService.worker
		}
	}
})`
			},
			usageSnippet: {
				title: 'Use the service in the gateway worker',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	const result = await env.MATH_SERVICE.add(4, 5)
	return Response.json({ result })
}`
			},
			testSnippet: {
				title: 'A single multi-worker test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET / calls the math service', async () => {
	const response = await cf.worker.get('/')
	expect(await response.json()).toEqual({ result: 9 })
})`
			},
			notes: [
				'Once this tiny path works, adding named entrypoints becomes an incremental extension, not a different architecture.',
				'Keep one simple service example like this around if you want a smoke check for multi-worker wiring.'
			],
			callout: {
				tone: 'info',
				title: 'The example should prove the relationship, not the whole system',
				body: [
					'One method call is already enough to teach the service-binding contract honestly.'
				]
			}
		}
	},
	{
		slugBase: 'ai',
		label: 'AI',
		categoryDescription: 'Workers AI bindings for remote inference, with a deliberately remote-oriented testing story.',
		configKey: 'bindings.ai',
		authoringShape: '{ binding: string }',
		localStory: 'Remote-oriented; local tests require remote mode',
		sourcePages: ['schema-bindings.ts', 'compiler.ts', 'wrangler-auth.ts', 'remote-ai.ts', 'verification-testing-and-caveats.md'],
		overview: {
			readTime: '4 min read',
			title: 'Use the AI binding when the worker needs real Workers AI inference, not just a local mock',
			summary: 'AI is a supported binding in Devflare, but it is intentionally treated as remote-oriented because real model inference lives on Cloudflare infrastructure.',
			description: 'That means the docs should be honest: Devflare can compile and type the binding cleanly, but meaningful tests usually need remote mode and real account access.',
			highlights: [
				'Config is intentionally small: declare the binding name and keep the rest of the flow explicit.',
				'Compiler emits the Wrangler AI binding shape directly.',
				'Remote-mode checks guard the testing path so local runs can skip expensive or unavailable calls cleanly.',
				'This is a remote-oriented binding, not a first-class local emulation story.'
			],
			bestFor: 'Real inference against Workers AI models',
			authoringParagraphs: [
				'AI is one of the clearest examples of Devflare choosing honesty over fantasy. The binding exists in config, the env is typed, and the deploy story is real — but model inference itself still lives on Cloudflare infrastructure.',
				'That is why the testing story leans on remote mode rather than pretending Miniflare can be a credible stand-in for actual model execution.'
			],
			authoringSnippet: {
				title: 'Workers AI binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'ai-worker',
	bindings: {
		ai: {
			binding: 'AI'
		}
	}
})`
			},
			fitBullets: [
				'Use AI when the worker should call a real Workers AI model.',
				'Keep the binding dedicated to model work instead of pretending every route needs AI by default.',
				'If the only goal is local happy-path UI wiring, use a normal fake at the app edge and reserve remote AI tests for the worker boundary.'
			],
			caveatBullets: [
				'AI is remote-oriented, so local-only test runs should not be expected to exercise real inference.',
				'Cloudflare auth and a resolvable account are part of the contract for meaningful AI tests. An explicit `accountId` helps when the target account would otherwise be ambiguous, but it is not the only way Devflare can resolve one.',
				'Because inference has cost and availability implications, it deserves more deliberate test gating than local-first bindings.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Do not present AI as a local-first binding',
				body: [
					'The honest story is that Devflare supports the binding cleanly, but real AI behavior still requires remote infrastructure.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary: 'AI has a smaller compiler story than storage bindings, but a more explicit auth and remote-runtime story.',
			description: 'Devflare does not invent a fake local AI runtime. It compiles the binding, checks remote requirements when needed, and exposes remote helpers for tests that intentionally opt in.',
			highlights: [
				'Compiler emits the Wrangler AI binding directly.',
				'Auth checks treat AI as a remote binding with real account requirements.',
				'`createTestContext()` can inject a remote AI binding when remote mode is enabled.',
				'Test skip helpers exist specifically because AI is not a universal local path.'
			],
			normalizationFact: 'The authored shape is small, so the important complexity lives in auth and remote enablement rather than config normalization',
			compileTarget: 'Wrangler `ai` binding',
			previewNote: 'AI is remote-oriented; preview is less about provisioning and more about whether the worker path may call the model',
			normalizationParagraphs: [
				'AI does not need the same name-versus-id resolution dance as KV or D1. The authored shape is basically “which env binding name should exist.”',
				'The heavier implementation work lives in auth checks and remote-test setup, because the value of the binding only appears once the worker can reach real Cloudflare AI services.'
			],
			localRuntimeBullets: [
				'`checkRemoteBindingRequirements()` treats AI as a binding that requires remote account context.',
				'`createTestContext()` can inject a remote AI helper when remote mode is enabled and an account can be resolved.',
				'`Ai.gateway()` is not supported by the current remote AI test helper, so gateway-specific flows need a higher-level integration path.',
				'`shouldSkip.ai` exists so tests can say clearly when remote inference is unavailable instead of failing opaquely.'
			],
			compileBullets: [
				'Compile emits the AI binding shape directly into generated Wrangler output.',
				'Because the runtime behavior is remote-oriented, the major operational risk is not syntax — it is auth, availability, and cost control.',
				'Preview behavior is mostly about whether that worker path should call real models, not about separate preview-managed AI resources.'
			],
			callout: {
				tone: 'info',
				title: 'Honest tooling beats fake local magic',
				body: [
					'Devflare makes AI explicit and testable on purpose, but it does not pretend local emulation is equivalent to real inference.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'The right AI test strategy is selective: use remote mode when you mean to test inference, and skip cleanly when the environment is not allowed to do that.',
			description: 'Trying to force AI into the same local-only expectations as KV or D1 leads to misleading tests. Devflare already gives you the right gates — use them.',
			highlights: [
				'AI tests are usually remote-mode integration tests with explicit opt-in.',
				'`shouldSkip.ai` is the intended guard for unsupported or unauthenticated environments.',
				'Keep prompts and assertions small so the test verifies the binding contract, not a giant product behavior.',
				'Local-only flows should stub above the worker boundary rather than pretending AI itself was tested.'
			],
			bestFor: 'Remote inference checks and binding-level AI smoke tests',
			defaultHarness: '`createTestContext()` after remote mode is enabled, plus `shouldSkip.ai`',
			escalation: 'The AI call is expensive, flaky, or business-critical enough to need a separate release gate',
			paragraphs: [
				'Start with a tiny inference call and a tiny assertion. The goal is to prove that the binding works and the worker can talk to the intended model, not to test your entire AI product in one unit test.',
				'Enable remote mode first — for example with `devflare remote enable ...` or `DEVFLARE_REMOTE=1` (or another truthy value) in automation — and skip explicitly when the environment still cannot support remote AI instead of forcing the test to fail in noisy ways.'
			],
			mainSnippet: {
				title: 'A remote-oriented AI test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, env, shouldSkip } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

const skipAI = await shouldSkip.ai

describe.skipIf(skipAI)('AI binding', () => {
	test('runs a tiny inference request', async () => {
		const result = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
			messages: [{ role: 'user', content: 'Reply with OK only.' }],
			max_tokens: 4
		})

		expect(result).toBeDefined()
	})
})`
			},
			helperBullets: [
				'Enable remote mode before expecting `createTestContext()` to inject a real AI binding, for example with `DEVFLARE_REMOTE=1` in automation.',
				'Use `shouldSkip.ai` to make remote prerequisites explicit in the test file itself.',
				'Keep AI assertions small enough that failures teach you about the binding path, not about prompt engineering drift.',
				'Use non-AI stubs above the worker layer when the app UI only needs a placeholder during purely local development.'
			],
			caveatBullets: [
				'Remote AI tests are not free; keep them targeted and intentional.',
				'If the worker depends on `Ai.gateway()`, test that path outside the remote AI helper because the helper warns and does not implement gateway mode.',
				'If the worker contract is business-critical, move AI smoke tests into an explicit integration or release lane rather than running them everywhere.',
				'Do not confuse local app mocks with proof that the real AI binding path works.'
			],
			callout: {
				tone: 'accent',
				title: 'Skip is not weakness here',
				body: [
					'For remote bindings, a clear skip condition is often more trustworthy than a forced local pseudo-test that never exercised the real platform.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This example keeps the AI path tiny: one binding, one inference call, one JSON response.',
			description: 'That is enough to prove the worker can talk to Workers AI without burying the example inside a whole chat product.',
			highlights: [
				'One model call is enough to show the shape.',
				'The example stays focused on the binding path, not app-level UX.',
				'Remote prerequisites are part of the example, not a hidden afterthought.',
				'You can wrap the call behind your own helpers later without changing the binding contract.'
			],
			configFocus: 'Minimal binding declaration',
			runtimeShape: 'Call `env.AI.run(...)` from the worker',
			bestUse: 'Small inference endpoints and smoke checks',
			configSnippet: {
				title: 'Minimal AI config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'ai-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		ai: {
			binding: 'AI'
		}
	}
})`
			},
			usageSnippet: {
				title: 'A tiny inference endpoint',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	const result = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
		messages: [{ role: 'user', content: 'Reply with OK only.' }],
		max_tokens: 4
	})

	return Response.json({ result })
}`
			},
			notes: [
				'Use a cheap, small model in smoke paths unless the point is to verify a specific expensive production model.',
				'Keep local app mocks above this worker route if you need offline UI development.'
			],
			callout: {
				tone: 'warning',
				title: 'This example still needs remote access',
				body: [
					'It is a minimal worker example, not a promise of local AI emulation. Treat account access and cost control as part of the example setup.'
				]
			}
		}
	},
	{
		slugBase: 'vectorize',
		label: 'Vectorize',
		categoryDescription: 'Vector similarity indexes with explicit remote testing and preview-aware index naming.',
		configKey: 'bindings.vectorize',
		authoringShape: 'Record<string, { indexName: string }>',
		localStory: 'Remote-oriented; local tests require remote mode or explicit mocks',
		sourcePages: ['schema-bindings.ts', 'compiler.ts', 'preview-resources.ts', 'remote-vectorize.ts', 'case15/*'],
		overview: {
			readTime: '4 min read',
			title: 'Use Vectorize when the worker really owns similarity search, not just string matching',
			summary: 'Vectorize is fully modeled in Devflare config and preview naming, but meaningful tests are still remote-oriented because the index lives on Cloudflare infrastructure.',
			description: 'That makes the docs pattern similar to AI: compile support is strong, preview lifecycle is explicit, and tests should be honest about when they are using the real index versus a fake.',
			highlights: [
				'Each binding declares an explicit `indexName`.',
				'Compile emits Wrangler `vectorize` entries.',
				'Preview-scoped Vectorize indexes are part of Devflare’s resource lifecycle story.',
				'Remote-mode testing is the truthful default for real similarity search.'
			],
			bestFor: 'Similarity search, embedding-backed lookup, and retrieval paths that belong in the worker',
			authoringParagraphs: [
				'Vectorize authoring is simple in config, but the operational story matters: an index must exist, dimensions must match, and tests should acknowledge that they are calling a real remote system.',
				'Devflare helps by keeping the binding explicit, the index name visible, and preview resource handling deliberate when the preview needs its own index.'
			],
			authoringSnippet: {
				title: 'Vectorize binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'search-worker',
	bindings: {
		vectorize: {
			DOCUMENT_INDEX: {
				indexName: 'document-index'
			}
		}
	}
})`
			},
			fitBullets: [
				'Use Vectorize when semantic similarity is part of the worker’s real job, not when plain text search is already enough.',
				'It fits best when the worker is already producing or consuming embeddings as part of the application flow.',
				'If the vector store is optional or external to the worker, keep the boundary explicit and do not force Vectorize into every local path.'
			],
			caveatBullets: [
				'Real Vectorize tests need remote access and an index that actually exists.',
				'Preview-scoped indexes are possible and lifecycle-managed, but they should be created only when the preview really needs isolated vector state.',
				'Local fake vector stores can be useful above the worker boundary, but they are not proof that the real binding path works.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Dimension and index setup are part of the contract',
				body: [
					'A passing unit test with a fake array is not equivalent to a real Vectorize call against the configured index.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary: 'Vectorize compiles cleanly into Wrangler output and participates in preview resource lifecycle, but the runtime value of the binding mostly lives in remote infrastructure.',
			description: 'That is why the codebase treats Vectorize as supported but remote-oriented. Config and preview handling are strong; local emulation is intentionally not oversold.',
			highlights: [
				'Compile emits `vectorize` entries with `index_name`.',
				'Preview resource logic can provision and later clean up preview-scoped indexes.',
				'`createTestContext()` can inject remote Vectorize helpers when remote mode is enabled.',
				'`shouldSkip.vectorize` exists because real remote prerequisites are part of the contract.'
			],
			normalizationFact: 'The authored shape is small, so most complexity is in remote access and preview resource lifecycle',
			compileTarget: 'Wrangler `vectorize`',
			previewNote: 'Preview-scoped Vectorize indexes are lifecycle-managed resources in Devflare',
			normalizationParagraphs: [
				'Each Vectorize binding is a named env entry pointing to an explicit `indexName`. There is not much normalization complexity because the important value is already visible in source.',
				'The heavier internal story is around preview resource handling and remote test support, because that is where real index existence and lifecycle start to matter.'
			],
			localRuntimeBullets: [
				'`createTestContext()` can supply a remote Vectorize binding when remote mode is enabled.',
				'The codebase uses `shouldSkip.vectorize` to make missing remote prerequisites explicit in tests.',
				'The exhaustive smoke app also uses mocks for some integration checks, which is fine as long as the docs do not confuse that with first-class local emulation.'
			],
			compileBullets: [
				'Compile emits `index_name` into generated Wrangler-facing config.',
				'Preview resource lifecycle code can materialize branch-specific index names and later clean them up.',
				'Because the binding is remote-oriented, the hardest failures are usually missing indexes, dimension mismatches, or auth — not config syntax.'
			],
			callout: {
				tone: 'info',
				title: 'Supported does not mean locally emulated',
				body: [
					'Vectorize is fully part of the config schema and preview story, but the meaningful runtime path still belongs to the remote platform.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'The right Vectorize tests are targeted remote checks: a small insert or query, a clear skip condition, and a real index behind the binding.',
			description: 'Avoid pretending a local fake embedding store proved the same thing. It may still be useful for UI or higher-level app tests, but it is not the binding test.',
			highlights: [
				'Use remote mode plus `shouldSkip.vectorize` for truthful binding tests.',
				'Keep the vector dimensions and index name explicit in the test setup.',
				'Small insert/query flows are enough for a smoke test.',
				'Local mocks are fine higher up the stack, just not as evidence that the binding itself works.'
			],
			bestFor: 'Remote similarity-search checks and index smoke tests',
			defaultHarness: '`createTestContext()` in remote mode plus `shouldSkip.vectorize`',
			escalation: 'The index contract is business-critical enough to need explicit CI or release gating',
			paragraphs: [
				'Keep the test as small as possible: insert one vector or query one known embedding and verify the shape of the result.',
				'If the index is missing, skip with a clear message. That teaches future maintainers more than a mysterious failure ever will.'
			],
			mainSnippet: {
				title: 'A remote Vectorize smoke test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestContext, env, shouldSkip } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

const skipVectorize = await shouldSkip.vectorize

describe.skipIf(skipVectorize)('Vectorize binding', () => {
	test('accepts one upsert and one query', async () => {
		const vector = Array(32).fill(0.5)
		await env.DOCUMENT_INDEX.upsert?.([
			{ id: 'doc-1', values: vector, metadata: { kind: 'demo' } }
		])

		const result = await env.DOCUMENT_INDEX.query?.(vector, { topK: 1 })
		expect(result).toBeDefined()
	})
})`
			},
			helperBullets: [
				'Use `shouldSkip.vectorize` so missing remote prerequisites are explicit instead of noisy.',
				'Keep the vector size and index name close to the test so the contract remains visible.',
				'If the surrounding app only needs a demo path locally, mock above the worker boundary instead of pretending the remote index was exercised.'
			],
			caveatBullets: [
				'Running Vectorize tests everywhere is rarely necessary; put them where the signal is worth the cost.',
				'A passing local mock tells you nothing about index existence or vector dimension compatibility.',
				'If a preview environment owns its own index, add one lifecycle-aware check for that path specifically.'
			],
			callout: {
				tone: 'accent',
				title: 'A tiny real query beats a giant fake suite',
				body: [
					'For remote vector search, one truthful remote smoke check is often worth more than a dozen intricate local fakes.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This example keeps Vectorize honest: one index binding, one upsert, and one query against the same worker path.',
			description: 'That is enough to show the binding shape without requiring a whole retrieval stack in the very first example.',
			highlights: [
				'The index name stays explicit in config.',
				'The runtime path shows both write and read shape.',
				'The example is small enough to turn into a remote smoke test later.',
				'The worker contract remains visible even if the app wraps it elsewhere.'
			],
			configFocus: 'Explicit index naming',
			runtimeShape: 'Upsert one vector and query it back',
			bestUse: 'Search prototypes and embedding-backed retrieval endpoints',
			configSnippet: {
				title: 'Minimal Vectorize config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'vectorize-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		vectorize: {
			DOCUMENT_INDEX: {
				indexName: 'document-index'
			}
		}
	}
})`
			},
			usageSnippet: {
				title: 'A tiny write-and-query route',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	const vector = Array(32).fill(0.5)

	await env.DOCUMENT_INDEX.upsert?.([
		{ id: 'doc-1', values: vector, metadata: { title: 'Demo doc' } }
	])

	const result = await env.DOCUMENT_INDEX.query?.(vector, {
		topK: 1,
		returnMetadata: true
	})

	return Response.json({ result })
}`
			},
			notes: [
				'Keep the embedding dimension explicit and consistent with the actual index you created.',
				'If you later split write and read into separate routes, this same example still teaches the core binding path.'
			],
			callout: {
				tone: 'warning',
				title: 'The remote index still has to exist',
				body: [
					'This example is small on purpose, but it is not fictional. The named index has to exist and match the vector shape you send.'
				]
			}
		}
	},
	{
		slugBase: 'hyperdrive',
		label: 'Hyperdrive',
		categoryDescription: 'PostgreSQL-oriented bindings with schema support, name resolution, and a narrower proven local story than D1 or KV.',
		configKey: 'bindings.hyperdrive',
		authoringShape: 'Record<string, string | { name: string } | { id: string }>',
		localStory: 'Supported, but with a narrower proven local test story',
		sourcePages: ['schema-bindings.ts', 'schema-normalization.ts', 'resource-resolution.ts', 'preview-resources.ts', 'case14/*'],
		overview: {
			readTime: '4 min read',
			title: 'Use Hyperdrive when the worker needs a real PostgreSQL path behind Cloudflare’s pooling layer',
			summary: 'Hyperdrive is modeled in Devflare config and compile flows like other name-based resources, but its tested local ergonomics are thinner than D1 or KV.',
			description: 'That is not a reason to avoid it — it is a reason to document it honestly. The binding is supported, yet the strongest evidence in the repo focuses on presence, connection info, and targeted integration rather than a giant local mock universe.',
			highlights: [
				'String shorthand means a stable Hyperdrive configuration name.',
				'Build and deploy can resolve names to Hyperdrive ids.',
				'The local story is real but narrower than D1, KV, or R2.',
				'Preview handling is special because Hyperdrive configs cannot always be cloned automatically.'
			],
			bestFor: 'Workers that connect to PostgreSQL through Hyperdrive',
			authoringParagraphs: [
				'Hyperdrive follows the same stable-name instinct as KV and D1: author a readable name in source when you can, then let Devflare resolve ids later when a flow actually needs them.',
				'The main difference is operational. Hyperdrive has credential and infrastructure constraints that make preview lifecycle trickier than storage bindings like KV or R2.'
			],
			authoringSnippet: {
				title: 'Hyperdrive binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'postgres-worker',
	bindings: {
		hyperdrive: {
			DB: 'app-postgres',
				ANALYTICS_DB: { id: 'hyperdrive-id' }
		}
	}
})`
			},
			fitBullets: [
				'Use Hyperdrive when the worker needs PostgreSQL and you want the Cloudflare-managed connection path rather than raw direct wiring.',
				'It fits best when a real Postgres database already exists and the worker boundary should speak to it deliberately.',
				'If your data is already a comfortable fit for D1, D1 may still be the simpler first choice.'
			],
			caveatBullets: [
				'The repo evidence for local Hyperdrive ergonomics is thinner than the local stories for D1, KV, or R2.',
				'Preview-scoped Hyperdrive configs are not auto-cloned from the base configuration because stored credentials are not always available for that.',
				'When a preview Hyperdrive config does not exist, Devflare may fall back to the base configuration and warn.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Supported does not mean equally local-friendly',
				body: [
					'Hyperdrive belongs in the binding library, but its test guidance should stay more conservative than the guidance for D1 or KV.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary: 'Hyperdrive uses the same normalize-and-resolve pattern as KV and D1, but preview lifecycle includes a fallback path instead of guaranteed preview cloning.',
			description: 'That fallback behavior is worth documenting explicitly because it changes how you should think about preview isolation and cleanup for database-backed flows.',
			highlights: [
				'String shorthand means a stable Hyperdrive configuration name.',
				'Compile emits Wrangler `hyperdrive` entries after resolution.',
				'Preview resource code handles Hyperdrive more cautiously than KV, D1, or R2.',
				'Cleanup can remove preview Hyperdrives that actually exist, but cloning is not automatic.'
			],
			normalizationFact: 'Hyperdrive follows the same name-versus-id normalization family as KV and D1',
			compileTarget: 'Wrangler `hyperdrive`',
			previewNote: 'Preview Hyperdrive configs may fall back to the base config when a preview clone cannot be materialized',
			normalizationParagraphs: [
				'Hyperdrive authoring accepts a string, `{ name }`, or `{ id }`, and Devflare normalizes those into one internal binding shape so later code can treat them consistently.',
				'That part looks familiar if you already understand KV or D1. The unusual part is preview lifecycle, not the authored schema.'
			],
			localRuntimeBullets: [
				'The repo shows Hyperdrive bindings exposing connection-oriented information such as `connectionString`, and some smoke paths also allow a `query()`-style helper.',
				'I did not find the same rich bridge-level local helper story that exists for D1, KV, or R2, which is why the docs should stay cautious here.',
				'The strongest proven local habit is to assert the binding exists and to use targeted integration for database behavior that really matters.'
			],
			compileBullets: [
				'Build and deploy resolve name-based Hyperdrive bindings to real configuration ids before generating output.',
				'Preview resource logic cannot always clone a base Hyperdrive config because Cloudflare does not expose stored credentials for that workflow.',
				'When a preview Hyperdrive config is missing but the base config exists, Devflare can fall back to the base binding and warn instead of pretending isolation happened.'
			],
			callout: {
				tone: 'info',
				title: 'This is a lifecycle caveat, not a syntax caveat',
				body: [
					'The config shape is straightforward. The reason Hyperdrive needs extra documentation is the preview and credential story, not the authoring syntax.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'Hyperdrive testing should start smaller and more cautiously than D1 testing: prove the binding exists, then add targeted integration where the real database path matters.',
			description: 'The codebase shows enough evidence to document Hyperdrive as supported, but not enough to oversell it as a drop-in local-first database harness identical to D1.',
			highlights: [
				'Start with binding presence and connection info.',
				'Prefer targeted integration tests for the real PostgreSQL path.',
				'Keep preview-fallback behavior visible in tests when preview isolation matters.',
				'Do not pretend the local story is as rich as D1 unless your own app proved that separately.'
			],
			bestFor: 'Binding presence checks and targeted PostgreSQL integration paths',
			defaultHarness: '`createTestContext()` plus small binding or smoke checks',
			escalation: 'The app depends on real preview isolation or actual Postgres query behavior',
			paragraphs: [
				'Start with one small assertion that the binding exists and exposes the connection information your code expects. That already tells you whether the config and runtime wiring are sane.',
				'Then add focused integration tests against the actual database path instead of manufacturing a huge fake local contract that the repo itself does not clearly guarantee.'
			],
			mainSnippet: {
				title: 'A conservative Hyperdrive smoke test',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('Hyperdrive binding exposes connection info', () => {
	expect(env.DB).toBeDefined()
	expect(Boolean(env.DB?.connectionString)).toBe(true)
})`
			},
			helperBullets: [
				'Use small binding-presence checks first instead of overpromising local query semantics.',
				'Keep one higher-level integration path for the real database behavior you actually care about.',
				'If preview isolation matters, test the fallback or dedicated preview strategy explicitly.'
			],
			caveatBullets: [
				'Do not present Hyperdrive as if Devflare already gives it the same local comfort story as D1.',
				'If the worker truly depends on live query behavior, prefer an integration test against a real database path.',
				'Preview-specific Hyperdrive expectations deserve a dedicated test because automatic cloning is not guaranteed.'
			],
			callout: {
				tone: 'warning',
				title: 'Conservative is the honest test strategy',
				body: [
					'The goal is trustworthy docs, not pretending every binding has identical local ergonomics.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This example keeps Hyperdrive focused on one thing: prove the binding exists and expose the connection information your app will need next.',
			description: 'That is a better first example than a giant database abstraction because it teaches the actual runtime contract the repo proves today.',
			highlights: [
				'The config stays readable through a stable Hyperdrive name.',
				'The runtime example does not pretend to be a full ORM.',
				'The route can later grow into a real query path with a PostgreSQL driver.',
				'This is intentionally a binding-first example, not a full database app.'
			],
			configFocus: 'Stable Hyperdrive naming',
			runtimeShape: 'Read connection information from the binding',
			bestUse: 'Health checks and first integration wiring',
			configSnippet: {
				title: 'Minimal Hyperdrive config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hyperdrive-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		hyperdrive: {
			DB: 'app-postgres'
		}
	}
})`
			},
			usageSnippet: {
				title: 'Expose the binding shape you will use later',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	return Response.json({
		hasBinding: Boolean(env.DB),
		hasConnectionString: Boolean(env.DB?.connectionString)
	})
}`
			},
			notes: [
				'Once this route works, the next step is usually a targeted integration with the actual PostgreSQL driver and database path you plan to use.',
				'This example is intentionally smaller than D1 because the repo evidence for Hyperdrive local ergonomics is also smaller.'
			],
			callout: {
				tone: 'info',
				title: 'A smaller example is a more truthful example',
				body: [
					'The point here is to show the real binding contract the worker receives, not to imply more local guarantees than the repo currently proves.'
				]
			}
		}
	},
	{
		slugBase: 'browser',
		label: 'Browser Rendering',
		categoryDescription: 'Headless browser support with an explicit single-binding limit and a stronger dev-server story than test-helper story.',
		configKey: 'bindings.browser',
		authoringShape: 'Record<string, string> with exactly one entry',
		localStory: 'Supported, but the strongest story is dev server and integration rather than a dedicated test helper',
		sourcePages: ['schema-bindings.ts', 'compiler.ts', 'browser-shim/*', 'dev-server/server.ts', 'case18/*'],
		overview: {
			readTime: '5 min read',
			title: 'Use Browser Rendering when the worker really needs a headless browser path',
			summary: 'Devflare supports Browser Rendering, but the docs should say the quiet part out loud: there is exactly one browser binding today, and the best-supported local story lives in dev-server and integration flows.',
			description: 'That is still useful. It means browser work can live in the same docs library as every other binding, just with honest caveats about limits and testing style.',
			highlights: [
				'Current schema allows exactly one browser binding.',
				'Compile emits the single Wrangler browser binding shape from the named env key.',
				'`devflare types` currently models the binding as `Fetcher`, so the worker boundary is the thing to test and document.',
				'Devflare ships a browser shim and binding worker to support the local/dev story.',
				'Preview naming exists, but browser bindings are not lifecycle-managed account resources like KV or D1.'
			],
			bestFor: 'PDF generation, screenshots, and other worker-side headless browser tasks',
			authoringParagraphs: [
				'Browser Rendering looks a little unusual in config because the current contract is a named map with exactly one entry. The env key matters more than the configured string value that appears beside it.',
				'That is also why generated env typing stays conservative today: `devflare types` can model the binding as `Fetcher`, while the richer browser behavior comes from the dev server shim and browser-aware libraries.',
				'That single-binding constraint is not a Devflare whim. It reflects the current Wrangler and platform support Devflare is choosing to expose honestly.'
			],
			authoringSnippet: {
				title: 'Browser binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'browser-worker',
	bindings: {
		browser: {
			BROWSER: 'browser-resource'
		}
	}
})`
			},
			fitBullets: [
				'Use Browser Rendering when the worker truly needs a browser — for PDF generation, screenshots, or browser-like page evaluation.',
				'Keep browser usage narrow and explicit because browser work is usually heavier than normal request handling.',
				'If a feature can be expressed as a plain fetch or HTML transform, it probably should be.'
			],
			caveatBullets: [
				'Only one browser binding is currently supported.',
				'The strongest local story lives in dev-server and integration flows, not in a rich browser-specific test helper API.',
				'Preview naming exists, but browser resources are not provisioned or deleted like account-managed storage resources.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Exactly one really means one',
				body: [
					'If you configure more than one browser binding, schema validation rejects it because the underlying Wrangler contract only supports one.'
				]
			}
		},
		internals: {
			readTime: '4 min read',
			summary: 'Browser Rendering support in Devflare is more than a config pass-through: the dev server starts a browser shim and a binding worker that line up with Cloudflare and puppeteer expectations.',
			description: 'That implementation detail is why the binding belongs in the docs library even though the test helper surface is narrower. There is real, deliberate runtime support here.',
			highlights: [
				'Schema validates that there is exactly one browser binding name.',
				'Compiler emits `browser: { binding: <env-key> }` from that single env key.',
				'The browser shim installs and proxies the local browser runtime used in dev flows.',
				'The binding worker exists specifically to satisfy the Worker-facing browser contract expected by `@cloudflare/puppeteer`.'
			],
			normalizationFact: 'The env binding name is the important authoring value, while the configured string is mainly used for naming and preview materialization',
			compileTarget: 'Wrangler `browser` binding',
			previewNote: 'Preview can materialize the binding name, but browser resources are not lifecycle-managed account resources',
			normalizationParagraphs: [
				'The browser binding schema accepts a record but then validates that only one key exists. Devflare treats that key as the meaningful env binding name and compiles it into the single `browser.binding` entry Wrangler expects.',
				'That is why the docs should emphasize the env key and the single-binding limit instead of implying the string value behaves like a normal bucket or namespace resource.'
			],
			localRuntimeBullets: [
				'The dev server starts a browser shim that can install Chrome Headless Shell and proxy the Browser Rendering protocol over HTTP and WebSocket.',
				'The binding worker exists so browser libraries like `@cloudflare/puppeteer` can talk to the expected Worker-side contract.',
				'Generated env typing stays conservative here too: the binding currently lands as `Fetcher`, which is another reason to keep the worker-facing browser path narrow and explicit.',
				'This is why browser local support feels more like dev-server infrastructure than like a small `cf.browser.*` helper.'
			],
			compileBullets: [
				'Compile emits the single browser binding from the configured env key.',
				'Preview logic can materialize names, but Devflare does not provision or delete browser “resources” because they are not account-managed the same way storage bindings are.',
				'The browser path can also warn about missing local WebSocket support when the environment lacks the `ws` dependency needed for proxying.'
			],
			callout: {
				tone: 'info',
				title: 'The honest browser story',
				body: [
					'Browser support is real, but it is infrastructural. Expect a stronger dev-server story than a tiny one-function local helper story.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'Browser tests should usually be integration-flavored: either drive the worker in dev or exercise a thin smoke path that proves the binding can launch and fetch.',
			description: 'That is more truthful than pretending there is a rich first-class browser helper surface identical to `cf.queue.trigger()` or `env.DB.prepare()`.',
			highlights: [
				'Prefer integration or dev-server smoke paths for browser-heavy behavior.',
				'A tiny dev-server, preview, or other integration-style smoke request is often enough for a binding smoke test.',
				'Keep heavy browser workflows behind narrow routes or DO methods so they remain testable.',
				'You can still use normal worker tests around those routes even if there is no dedicated browser helper.'
			],
			bestFor: 'Launch smoke tests, PDF generation routes, and browser-backed worker endpoints',
			defaultHarness: 'A narrow browser route exercised through the dev server, a preview URL, or another integration-style path',
			escalation: 'A real browser workflow is mission-critical or too heavy for ordinary test runs',
			paragraphs: [
				'Keep the worker-side browser entry small enough that one smoke path can prove it launches, opens a page, or returns a generated artifact.',
				'If the real logic is bigger — for example a full PDF renderer DO — write one narrow end-to-end check and keep the rest of the code tested at smaller layers.'
			],
			mainSnippet: {
				title: 'A tiny dev-server browser smoke check',
				language: 'ts',
				code: String.raw`import { expect, test } from 'bun:test'

const baseUrl = process.env.DEVFLARE_TEST_URL ?? 'http://127.0.0.1:8787'

test('browser-backed route responds', async () => {
	const response = await fetch(new URL('/browser-health', baseUrl))
	expect(response.ok).toBe(true)
})`
			},
			helperBullets: [
				'Prefer one narrow worker route or DO method for browser tasks so the binding path stays testable.',
				'Drive that route through the dev server, a preview URL, or another integration path when browser launch itself is the thing under test.',
				'If you want Bun-only unit tests, stub above the browser boundary instead of expecting `createTestContext()` to conjure a first-class browser binding for you.',
				'Treat browser local checks as smoke tests unless the app really needs a heavier dedicated lane.'
			],
			caveatBullets: [
				'No dedicated browser helper surface means you should test the worker boundary or integration path instead of reaching for fictional convenience APIs.',
				'`createTestContext()` is still useful around surrounding worker code, but it is not a browser-specific helper that automatically populates `env.BROWSER` for you.',
				'Browser workloads are heavier than typical request tests, so they deserve intentional scheduling in CI.',
				'If the route depends on browser proxying or WebSockets, test that path in an environment close to the real dev server.'
			],
			callout: {
				tone: 'accent',
				title: 'Smoke test the launch path, not the whole internet',
				body: [
					'Browser bindings get expensive fast. One honest launch or render smoke path is usually better than an enormous browser suite that nobody trusts.'
				]
			}
		},
		example: {
			readTime: '4 min read',
			summary: 'This example shows the real browser shape most people care about: launch a browser, read one page title, close the browser cleanly.',
			description: 'It is intentionally smaller than a full PDF pipeline, but it uses the same worker-side idea: the browser binding is real infrastructure, not a pretend local object.',
			highlights: [
				'The env binding name is what matters in config.',
				'The runtime example uses `@cloudflare/puppeteer` directly.',
				'Browser cleanup is part of the example, not an optional footnote.',
				'This is enough to turn into a PDF or screenshot path later.'
			],
			configFocus: 'Single browser binding',
			runtimeShape: 'Launch puppeteer with the Worker binding and close it cleanly',
			bestUse: 'Small screenshot, title-read, or PDF-generation entrypoints',
			configSnippet: {
				title: 'Minimal browser config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'browser-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		browser: {
			BROWSER: 'browser-resource'
		}
	}
})`
			},
			usageSnippet: {
				title: 'Read one page title with Puppeteer',
				language: 'ts',
				code: String.raw`import puppeteer from '@cloudflare/puppeteer'
import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	const browser = await puppeteer.launch(env.BROWSER as Parameters<typeof puppeteer.launch>[0])

	try {
		const page = await browser.newPage()
		await page.goto('https://example.com/', { waitUntil: 'load' })
		return Response.json({ title: await page.title() })
	} finally {
		await browser.close()
	}
}`
			},
			notes: [
				'Keep the first route tiny so launch, navigation, and cleanup are the only moving parts you have to trust.',
				'If the real feature is PDF generation, this same pattern is the foundation for that worker path.'
			],
			callout: {
				tone: 'warning',
				title: 'The example is small, not cheap',
				body: [
					'Browser work is still heavier than most bindings. Keep your first path focused enough that failures are easy to diagnose.'
				]
			}
		}
	},
	{
		slugBase: 'analytics-engine',
		label: 'Analytics Engine',
		categoryDescription: 'Dataset bindings for writeDataPoint-style event recording with schema support and lighter local testing guidance.',
		configKey: 'bindings.analyticsEngine',
		authoringShape: 'Record<string, { dataset: string }>',
		localStory: 'Supported, but usually tested through integration or thin mocks',
		sourcePages: ['schema-bindings.ts', 'compiler.ts', 'generator.ts', 'preview-resources.ts', 'apps/testing/*'],
		overview: {
			readTime: '4 min read',
			title: 'Use Analytics Engine when the worker should write structured event points, not improvise log transport',
			summary: 'Analytics Engine is modeled cleanly in Devflare config and generated types, but the repo evidence points to a lighter local story than the first-class storage bindings.',
			description: 'That usually means two good habits: keep the write path simple in the worker, and test the event-producing behavior through a thin boundary rather than by inventing a giant analytics simulation.',
			highlights: [
				'Each binding declares a dataset explicitly.',
				'Compile emits Wrangler `analytics_engine_datasets`.',
				'Type generation maps these bindings to `AnalyticsEngineDataset` in `env.d.ts`.',
				'Preview naming exists, but datasets are not provisioned or deleted by Devflare because they are created on first write.'
			],
			bestFor: 'Structured analytics or event logging inside worker code',
			authoringParagraphs: [
				'The Analytics Engine binding is conceptually simple: pick a dataset name and write data points to it from the worker path that owns the event.',
				'What matters more than the config shape is resisting the urge to build a fake analytics platform around it just to write the first tests.'
			],
			authoringSnippet: {
				title: 'Analytics Engine binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'analytics-worker',
	bindings: {
		analyticsEngine: {
			APP_ANALYTICS: {
				dataset: 'app-analytics'
			}
		}
	}
})`
			},
			fitBullets: [
				'Use Analytics Engine when the worker should record structured event points as part of handling real traffic or jobs.',
				'Keep analytics writes narrow and explicit so they stay easy to review.',
				'If the data is really application state, it probably belongs in D1 or another durable store instead of analytics.'
			],
			caveatBullets: [
				'The repo does not show a dedicated analytics helper surface comparable to `cf.queue.trigger()` or `env.DB.prepare()`.',
				'Preview-scoped dataset names can be materialized, but Devflare does not provision or delete datasets because Analytics Engine creates them on first write.',
				'Tests should focus on event-producing behavior rather than pretending you need a full local analytics backend.'
			],
			caveatCallout: {
				tone: 'info',
				title: 'This binding is about a write path',
				body: [
					'Document the write contract clearly and keep the testing story light. That is more useful than inventing an elaborate fake dataset universe.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary: 'Analytics Engine has a straightforward compiler story, plus a preview note that matters because datasets are auto-created on first write instead of provisioned like buckets or databases.',
			description: 'That is the core reason the docs should separate it from storage bindings: the worker env shape is familiar, but the resource lifecycle behaves differently.',
			highlights: [
				'Compile emits `analytics_engine_datasets`.',
				'Type generation maps the env binding to `AnalyticsEngineDataset`.',
				'Preview naming can materialize dataset names for scoped environments.',
				'Provision and cleanup are intentionally lighter because datasets are created by writing to them.'
			],
			normalizationFact: 'The authored shape is a simple dataset mapping; the interesting behavior is lifecycle, not deep normalization',
			compileTarget: 'Wrangler `analytics_engine_datasets`',
			previewNote: 'Preview names can change, but Devflare does not provision or delete Analytics Engine datasets for you',
			normalizationParagraphs: [
				'Analytics Engine bindings are a small schema surface: a binding name maps to a dataset name. That keeps authored config simple and predictable.',
				'The more important implementation detail is that datasets are not managed like KV namespaces or buckets. They come to life on write, so preview lifecycle support looks different.'
			],
			localRuntimeBullets: [
				'The repo smoke app and integration tests show `writeDataPoint()` being called through the binding, which is enough to describe the runtime contract honestly.',
				'I did not find a dedicated analytics helper surface in the test harness, so docs should steer people toward thin worker tests or explicit mocks instead.',
				'Type generation still matters here because it keeps the env contract clear even when the test story is lighter.'
			],
			compileBullets: [
				'Compile emits dataset entries into Wrangler-facing output.',
				'Preview materialization can rewrite dataset names, but Devflare intentionally does not try to provision or delete those datasets for you.',
				'That lifecycle difference is the main caveat compared with storage or queue resources.'
			],
			callout: {
				tone: 'warning',
				title: 'Name changes do not imply resource management',
				body: [
					'Preview-scoped naming is useful, but it does not mean Devflare owns the full dataset lifecycle the way it can for KV, D1, or queues.'
				]
			}
		},
		testing: {
			readTime: '3 min read',
			summary: 'Analytics Engine tests should stay thin: verify that the worker writes a data point, not that you can recreate Cloudflare analytics locally.',
			description: 'The repo evidence supports that approach. There are examples and smoke checks, but not a big dedicated analytics test harness pretending to be the platform.',
			highlights: [
				'Test that the worker reaches `writeDataPoint()` when it should.',
				'Use a thin mock or smoke path when needed.',
				'Keep analytics assertions scoped to the event-producing behavior you care about.',
				'Escalate only if analytics delivery is business-critical enough to deserve a higher-level integration lane.'
			],
			bestFor: 'Event-write smoke tests and worker behavior that should emit analytics',
			defaultHarness: 'A thin worker test or explicit mock around `writeDataPoint()`',
			escalation: 'Analytics delivery itself is a release-critical guarantee',
			paragraphs: [
				'The best default is a small test proving the worker attempted the analytics write when the expected request or job happened.',
				'If you later need stronger end-to-end confidence, add a higher-level integration or smoke lane instead of bloating the ordinary unit path.'
			],
			mainSnippet: {
				title: 'A thin analytics smoke check',
				language: 'ts',
				code: String.raw`import { expect, test } from 'bun:test'

const writes: unknown[] = []
const analytics = {
	writeDataPoint(point: unknown) {
		writes.push(point)
	}
}

test('records an analytics point', () => {
	analytics.writeDataPoint({ indexes: ['search'], blobs: ['devflare'] })
	expect(writes).toHaveLength(1)
})`
			},
			helperBullets: [
				'Keep analytics writes behind a small helper if that makes them easier to assert in application-level tests.',
				'Use worker smoke tests around the route or job that should emit the event when you want stronger evidence than a tiny mock.',
				'Do not confuse “we called writeDataPoint” with “the whole reporting stack is perfect” unless you added a real integration path for that.'
			],
			caveatBullets: [
				'The ordinary docs should not imply that Devflare ships a full local Analytics Engine simulator.',
				'If analytics delivery is business-critical, put it in a dedicated smoke or release lane instead of overfitting every local test.',
				'Preview dataset names may differ, so if that matters operationally, test the generated naming separately.'
			],
			callout: {
				tone: 'accent',
				title: 'Thin and explicit wins here too',
				body: [
					'Analytics bindings are easiest to trust when the worker writes a clearly reviewable point and the tests prove that narrow behavior directly.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This example writes one analytics event from one route, which is usually all you need to teach the binding shape clearly.',
			description: 'It keeps the dataset name visible, the event payload small, and the worker boundary obvious.',
			highlights: [
				'One dataset binding is enough to show the pattern.',
				'The route is tiny because the interesting part is the event write.',
				'The event payload should be reviewable, not mysterious.',
				'This same pattern works for search, app, or audit analytics.'
			],
			configFocus: 'Explicit dataset naming',
			runtimeShape: 'Call `writeDataPoint()` during a request',
			bestUse: 'Search analytics, request logging, and event emission',
			configSnippet: {
				title: 'Minimal Analytics Engine config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'analytics-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		analyticsEngine: {
			APP_ANALYTICS: {
				dataset: 'app-analytics'
			}
		}
	}
})`
			},
			usageSnippet: {
				title: 'Write one analytics point in the worker',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	env.APP_ANALYTICS.writeDataPoint({
		indexes: ['search'],
		blobs: ['devflare query']
	})

	return new Response('recorded')
}`
			},
			notes: [
				'Keep the event payload small and explicit so you can reason about what the worker is writing.',
				'If the real event shape grows richer later, this tiny route still teaches the binding contract honestly.'
			],
			callout: {
				tone: 'info',
				title: 'A route can teach the whole binding',
				body: [
					'For Analytics Engine, one request that writes one point is already enough to teach the env shape and the operational habit.'
				]
			}
		}
	},
	{
		slugBase: 'send-email',
		label: 'Send Email',
		categoryDescription: 'Outbound email bindings with real local support, plus an important distinction from inbound email event handlers.',
		configKey: 'bindings.sendEmail',
		authoringShape: 'Record<string, { destinationAddress?; allowedDestinationAddresses?; allowedSenderAddresses? }>',
		localStory: 'First-class outbound local support; distinct from inbound email event testing',
		sourcePages: ['schema-bindings.ts', 'compiler.ts', 'send-email.ts', 'simple-context.ts', 'case12/*'],
		overview: {
			readTime: '4 min read',
			title: 'Use Send Email when the worker should send outbound email with explicit address rules',
			summary: 'Send Email is a real binding surface in Devflare, and it is worth documenting separately from inbound `src/email.ts` handlers so the two flows do not get blurred together.',
			description: 'That distinction matters because outbound email is a binding you call from worker code, while inbound email handling is a worker event surface with its own test helper story.',
			highlights: [
				'Config can restrict a binding to one destination or to explicit sender and recipient allow-lists.',
				'Compiler emits the Wrangler `send_email` entries.',
				'Local runtime supports outbound send-email bindings directly.',
				'Inbound email testing uses the `email` helper surface, which is related but not the same contract.'
			],
			bestFor: 'Outbound notification email and controlled email-sending paths from worker code',
			authoringParagraphs: [
				'Send Email bindings are easiest to trust when the allowed addresses are visible in config rather than buried in some last-minute secret or helper wrapper.',
				'Devflare validates the main mutual-exclusion rule here too: use either one `destinationAddress` or a list of `allowedDestinationAddresses`, not both.'
			],
			authoringSnippet: {
				title: 'Send Email binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'email-worker',
	bindings: {
		sendEmail: {
			TRANSACTIONAL_EMAIL: {
				allowedDestinationAddresses: ['ops@example.com'],
				allowedSenderAddresses: ['noreply@example.com']
			},
			SUPPORT_EMAIL: {
				destinationAddress: 'support@example.com'
			}
		}
	}
})`
			},
			fitBullets: [
				'Use Send Email when the worker needs to send notifications or transactional messages outward.',
				'Keep address restrictions explicit so the worker cannot quietly send anywhere it pleases.',
				'Do not confuse outbound send-email bindings with inbound email processing handlers.'
			],
			caveatBullets: [
				'`destinationAddress` and `allowedDestinationAddresses` are mutually exclusive in one binding definition.',
				'The local story for outbound email is strong, but it should still be documented separately from inbound email event helpers.',
				'Preview resource lifecycle does not manage email addresses the way it manages storage resources, because the binding compiles the address rules as-is.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Outbound is not inbound',
				body: [
					'`env.TRANSACTIONAL_EMAIL.send(...)` and `src/email.ts` handler tests are connected by the domain, but they are different contracts and should be documented that way.'
				]
			}
		},
		internals: {
			readTime: '3 min read',
			summary: 'Send Email compiles into Wrangler output, normalizes message input at runtime, and supports local address restrictions instead of treating email as an unbounded free-for-all.',
			description: 'That runtime normalization is worth calling out because it lets worker code send higher-level message shapes while Devflare translates them into the lower-level form the email path needs.',
			highlights: [
				'Compiler emits `send_email` entries from the authored binding rules.',
				'Runtime helpers normalize composed outbound messages into the raw email form when needed.',
				'Local bindings respect sender and destination restrictions.',
				'Env wrapping can surface locally created send-email bindings cleanly in tests and dev.'
			],
			normalizationFact: 'The schema normalizes address restrictions and runtime message helpers normalize composed email input',
			compileTarget: 'Wrangler `send_email`',
			previewNote: 'Address rules compile as authored; there is no separate preview resource lifecycle for email destinations',
			normalizationParagraphs: [
				'The schema work here is less about ids and more about safety rules: which addresses are permitted and which combinations are invalid.',
				'At runtime, Devflare can normalize higher-level email message shapes into raw MIME-backed delivery when the outbound path needs it.'
			],
			localRuntimeBullets: [
				'Local send-email bindings can be created and enforced in the default runtime/test context.',
				'Address restrictions are part of the local contract, which keeps the binding honest during development.',
				'Inbound email helper APIs exist too, but they serve the inbound event story rather than replacing outbound bindings.'
			],
			compileBullets: [
				'Compile turns the authored send-email rules into Wrangler-facing `send_email` entries.',
				'The binding rules are emitted as-is; there is no preview resource provisioning story for destination addresses or sender allow-lists.',
				'The runtime normalization step is the subtle part worth documenting because it shapes how friendly outbound code can look.'
			],
			callout: {
				tone: 'info',
				title: 'Safety rules are part of the binding',
				body: [
					'The point of the schema is not only to make email possible. It is also to keep where the worker may send email visible and reviewable.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary: 'Send Email is stronger locally than many platform-service bindings because outbound email can be exercised in the default harness, while inbound email has its own related helper surface.',
			description: 'That means the docs should teach both the outbound binding test and the conceptual split from inbound email event tests, so people do not mix the two up.',
			highlights: [
				'Use the local harness for outbound send-email bindings.',
				'Use the `email` helper surface when you are testing inbound `src/email.ts` handling instead.',
				'Keep one test around the actual outbound binding contract, not only helper wrappers.',
				'Address allow-lists are worth testing because they are part of the safety contract.'
			],
			bestFor: 'Outbound notification checks and address-restriction behavior',
			defaultHarness: '`createTestContext()` plus `env.TRANSACTIONAL_EMAIL.send(...)`',
			escalation: 'The system has external email delivery requirements beyond the local binding path',
			paragraphs: [
				'Start with one direct outbound send call through the binding and verify the success or allow-list behavior you actually care about.',
				'If you are testing inbound processing, switch mental models entirely and use the email event helper path instead of forcing everything through the outbound binding.'
			],
			mainSnippet: {
				title: 'Testing an outbound Send Email binding',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('sends an outbound transactional email', async () => {
	await expect(env.TRANSACTIONAL_EMAIL.send({
		from: 'noreply@example.com',
		to: 'ops@example.com',
		subject: 'Smoke check',
		text: 'Hello from Devflare'
	})).resolves.toBeUndefined()
})`
			},
			helperBullets: [
				'Use the outbound binding directly when the worker is sending mail.',
				'Use the inbound `email` helper surface (`cf.email.send(...)` from `devflare/test`) when the worker is handling inbound email in `src/email.ts`.',
				'Keep address restrictions visible in tests when those restrictions are part of the safety story.'
			],
			caveatBullets: [
				'Do not document inbound email helper tests as if they were proof of the outbound binding path, or vice versa.',
				'If external delivery or provider-side verification matters, add a separate integration lane rather than overfitting the local harness.',
				'The local harness is great for binding behavior, but email product workflows often still need a higher-level end-to-end check.'
			],
			callout: {
				tone: 'accent',
				title: 'Two email stories, one docs rule',
				body: [
					'Keep outbound binding docs and inbound handler docs adjacent in your head, but separate on the page. That is how people avoid testing the wrong thing.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary: 'This example keeps outbound email explicit: one binding, one recipient rule, one worker path that sends one message.',
			description: 'It is enough to teach the binding honestly without dragging inbound processing or full provider workflows into the very first page.',
			highlights: [
				'One outbound binding already teaches the contract.',
				'The allowed destination is visible in config.',
				'The worker path shows the actual send call.',
				'This remains easy to test in the default harness.'
			],
			configFocus: 'Explicit destination rules',
			runtimeShape: 'Call `send()` from a worker route',
			bestUse: 'Transactional or support notifications',
			configSnippet: {
				title: 'Minimal Send Email config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'send-email-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		sendEmail: {
			SUPPORT_EMAIL: {
				destinationAddress: 'support@example.com'
			}
		}
	}
})`
			},
			usageSnippet: {
				title: 'Send one email from the worker',
				language: 'ts',
				code: String.raw`import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	await env.SUPPORT_EMAIL.send({
		from: 'noreply@example.com',
		to: 'support@example.com',
		subject: 'New support request',
		text: 'A customer asked for help.'
	})

	return new Response('sent')
}`
			},
			notes: [
				'Keep the first outbound example narrow so the binding contract stays obvious.',
				'If you also handle inbound email elsewhere in the app, document that on the email-event pages rather than merging the two stories here.'
			],
			callout: {
				tone: 'info',
				title: 'One message is enough to teach the binding',
				body: [
					'You do not need a full notification system on the first page. One send call already proves the important contract.'
				]
			}
		}
	}
]

const activeBindingGuides = bindingGuides.filter((guide) => guide.slugBase !== 'service')

export interface BindingTestingGuideLink {
	label: string
	overviewSlug: string
	testingSlug: string
	summary: string
	defaultHarness: string
	localStory: string
	categoryDescription: string
}

export const bindingTestingGuides: BindingTestingGuideLink[] = activeBindingGuides.map((guide) => {
	const slugs = getBindingSlugs(guide.slugBase)

	return {
		label: guide.label,
		overviewSlug: slugs.overview,
		testingSlug: slugs.testing,
		summary: guide.testing.summary,
		defaultHarness: guide.testing.defaultHarness,
		localStory: guide.localStory,
		categoryDescription: guide.categoryDescription
	}
})

export const bindingDocCategories = activeBindingGuides.map((guide) => {
	const slugs = getBindingSlugs(guide.slugBase)

	return {
		id: `${guide.slugBase}-binding-library`,
		title: guide.label,
		description: guide.categoryDescription,
		sidebarDisplay: 'links' as const,
		slugs: [slugs.overview, slugs.internals, slugs.testing, slugs.example],
		sidebarSlugs: [slugs.overview]
	}
})

export const bindingDocs: DocPage[] = activeBindingGuides.flatMap(createBindingPages)
