import type { DocCallout, DocCodeSnippet, DocPage, DocSection } from '../../types'

import {
	createBindingHeaderCloudflareDocs,
	getCloudflareBindingReference,
	getCloudflareRuntimeComparison
} from './cloudflare-reference'
import { createBindingSupportSection } from './support'

export {
	createBindingHeaderCloudflareDocs,
	getCloudflareBindingIntro,
	getCloudflareBindingReference,
	getCloudflareRuntimeComparison
} from './cloudflare-reference'

export const bindingReferenceGroup = 'Bindings'

export type ContentDocCodeSnippet = DocCodeSnippet & {
	code: string
}

export interface BindingOverviewDefinition {
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
	extraSections?: DocSection[]
}

export interface BindingInternalsDefinition {
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

export interface BindingTestingDefinition {
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

export interface BindingExampleDefinition {
	readTime: string
	summary: string
	description: string
	highlights: string[]
	configFocus: string
	runtimeShape: string
	bestUse: string
	configSnippet: ContentDocCodeSnippet
	usageSnippet: ContentDocCodeSnippet
	notes: string[]
	callout?: DocCallout
}

export interface BindingGuideDefinition {
	slugBase: string
	pathBase?: string
	label: string
	categoryDescription: string
	configKey: string
	authoringShape: string
	localStory: string
	compileOutput?: string
	sourcePages: string[]
	overview: BindingOverviewDefinition
	internals: BindingInternalsDefinition
	testing: BindingTestingDefinition
	example: BindingExampleDefinition
}

export function getBindingPathBase(
	guide: Pick<BindingGuideDefinition, 'slugBase' | 'pathBase'>
): string {
	if (guide.pathBase) {
		return guide.pathBase
	}

	switch (guide.slugBase) {
		case 'durable-object':
			return 'bindings/durable-objects'

		case 'queue':
			return 'bindings/queues'

		case 'service':
			return 'bindings/services'

		case 'browser':
			return 'bindings/browser-rendering'

		default:
			return `bindings/${guide.slugBase}`
	}
}

export function getBindingSlugs(guide: Pick<BindingGuideDefinition, 'slugBase' | 'pathBase'>): {
	overview: string
	internals: string
	testing: string
	example: string
} {
	const pathBase = getBindingPathBase(guide)

	return {
		overview: pathBase,
		internals: `${pathBase}/internals`,
		testing: `${pathBase}/testing`,
		example: `${pathBase}/example`
	}
}

export function getLegacyBindingSlugs(slugBase: string): {
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

export function createBindingInternalsSnippet(guide: BindingGuideDefinition): DocCodeSnippet {
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

export function createBindingCompileOutput(guide: BindingGuideDefinition): string {
	if (guide.compileOutput) {
		return guide.compileOutput
	}

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

export function findFocusLines(code: string, marker: string): [number, number] | undefined {
	const lines = code.split('\n')
	const matchIndex = lines.findIndex((line) => line.includes(marker))

	if (matchIndex === -1) {
		return undefined
	}

	const start = Math.max(1, matchIndex + 1)
	const end = Math.min(lines.length, start + 4)
	return [start, end]
}

export function bindingDocPath(slug: string): string {
	return `/docs/${slug}`
}

export function inlineCodeFact(value: string): string {
	return `\`${value.replaceAll('`', '')}\``
}

export function applicationSourcePages(sourcePages: string[]): string[] {
	return sourcePages.filter(
		(source) => !/(^|\/)(?:tests?|test|apps\/testing)(?:\/|$)/i.test(source)
	)
}

export const bindingTestOnlyContentPattern =
	/\b(?:bun:test|devflare\/test|createTestContext|createOfflineEnv|createMock[A-Z]|cf\.worker|env\.dispose|expect\s*\(|describe\s*\(|test\s*\(|tests?|testing|assert)\b/i

export function isApplicationOnlyText(value: string): boolean {
	return !bindingTestOnlyContentPattern.test(value)
}

export function applicationExampleSummary(guide: BindingGuideDefinition): string {
	if (isApplicationOnlyText(guide.example.summary)) {
		return guide.example.summary
	}

	return `A real ${guide.label} application path with config and runtime code kept side by side.`
}

export function applicationExampleDescription(guide: BindingGuideDefinition): string {
	if (isApplicationOnlyText(guide.example.description)) {
		return guide.example.description
	}

	return `Use this as the application-focused ${guide.label} example before you add feature-specific abstractions around the binding.`
}

export function applicationExampleHighlights(guide: BindingGuideDefinition): string[] {
	const highlights = guide.example.highlights.filter(isApplicationOnlyText)

	return highlights.length > 0
		? highlights
		: [
				'One config block names the Cloudflare resource or product surface.',
				'One runtime path performs the work through the generated env binding.',
				'Production ownership and fallback behavior stay visible next to the route.'
			]
}

export function applicationExampleFact(value: string, fallback: string): string {
	return isApplicationOnlyText(value) ? value : fallback
}

export function applicationExampleNotes(guide: BindingGuideDefinition): string[] {
	const notes = guide.example.notes.filter(isApplicationOnlyText)

	return notes.length > 0
		? notes
		: [
				`Keep the first ${guide.label} path small enough to review in one file.`,
				'Add abstractions only after the runtime shape is obvious.'
			]
}

export function applicationExampleCallouts(
	guide: BindingGuideDefinition
): DocCallout[] | undefined {
	if (!guide.example.callout) {
		return undefined
	}

	const text = JSON.stringify(guide.example.callout)
	return isApplicationOnlyText(text) ? [guide.example.callout] : undefined
}

export function createBindingReferenceSection(guide: BindingGuideDefinition): DocSection {
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

export function createBindingDeepDiveSection(guide: BindingGuideDefinition): DocSection {
	const slugs = getBindingSlugs(guide)

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

export function createBindingPages(guide: BindingGuideDefinition): DocPage[] {
	const slugs = getBindingSlugs(guide)
	const legacySlugs = getLegacyBindingSlugs(guide.slugBase)
	const headerCloudflareDocs = createBindingHeaderCloudflareDocs(guide)

	return [
		{
			slug: slugs.overview,
			aliases: [legacySlugs.overview],
			group: bindingReferenceGroup,
			navTitle: guide.label,
			articleNavigationHidden: true,
			readTime: guide.overview.readTime,
			eyebrow: 'Binding reference',
			title: guide.overview.title,
			summary: guide.overview.summary,
			description: guide.overview.description,
			headerCloudflareDocs,
			highlights: guide.overview.highlights,
			facts: [
				{ label: 'Config key', value: inlineCodeFact(guide.configKey) },
				{ label: 'Authoring shape', value: inlineCodeFact(guide.authoringShape) },
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
					id: 'runtime-usage',
					title: 'Use the binding from application code',
					paragraphs: [
						`After Devflare generates the worker env, import \`env\` from \`devflare/runtime\` and keep the first ${guide.label} path close to the route, handler, or service method that needs it.`,
						'Keep this first path small enough that the binding contract stays visible during code review.'
					],
					snippets: [guide.example.usageSnippet]
				},
				createBindingSupportSection(guide),
				...(guide.overview.extraSections ?? []),
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
			aliases: [legacySlugs.internals],
			group: bindingReferenceGroup,
			sidebarHidden: true,
			navTitle: `${guide.label} internals`,
			readTime: guide.internals.readTime,
			eyebrow: 'Under the hood',
			title: `How Devflare wires ${guide.label} from config to runtime`,
			summary: guide.internals.summary,
			description: guide.internals.description,
			headerCloudflareDocs,
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
			aliases: [legacySlugs.testing],
			group: bindingReferenceGroup,
			sidebarHidden: true,
			navTitle: `Testing ${guide.label}`,
			readTime: guide.testing.readTime,
			eyebrow: 'Testing',
			title: `Test ${guide.label} the way Devflare expects it to run`,
			summary: guide.testing.summary,
			description: guide.testing.description,
			headerCloudflareDocs,
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
			aliases: [legacySlugs.example],
			group: bindingReferenceGroup,
			sidebarHidden: true,
			navTitle: `${guide.label} example`,
			readTime: guide.example.readTime,
			eyebrow: 'Application example',
			title: `Use ${guide.label} in a real application path`,
			summary: applicationExampleSummary(guide),
			description: applicationExampleDescription(guide),
			headerCloudflareDocs,
			highlights: applicationExampleHighlights(guide),
			facts: [
				{ label: 'Config focus', value: guide.example.configFocus },
				{
					label: 'Runtime shape',
					value: applicationExampleFact(
						guide.example.runtimeShape,
						`${guide.label} calls from worker application code`
					)
				},
				{
					label: 'Best use',
					value: applicationExampleFact(guide.example.bestUse, guide.overview.bestFor)
				}
			],
			sourcePages: applicationSourcePages(guide.sourcePages),
			sections: [
				{
					id: 'configure-it',
					title: 'Start by wiring the binding clearly in config',
					snippets: [guide.example.configSnippet]
				},
				{
					id: 'application-flow',
					title: 'Build the application flow around the binding',
					paragraphs: [
						`Treat this as the app-level ${guide.label} path: the route, event handler, or service module receives a real request and uses the binding to do useful work.`,
						'Keep product limits, remote ownership, and fallback behavior visible in the code around the binding instead of hiding everything behind a vague utility too early.'
					],
					snippets: [guide.example.usageSnippet],
					bullets: applicationExampleNotes(guide)
				},
				{
					id: 'production-notes',
					title: 'Keep production boundaries visible',
					bullets: [
						`Config focus: ${guide.example.configFocus}.`,
						`Runtime shape: ${applicationExampleFact(guide.example.runtimeShape, `${guide.label} calls from worker application code`)}.`,
						`Best use: ${applicationExampleFact(guide.example.bestUse, guide.overview.bestFor)}.`
					],
					callouts: applicationExampleCallouts(guide)
				}
			]
		}
	]
}

export interface CompactBindingGuideDefinition {
	slugBase: string
	pathBase?: string
	label: string
	categoryDescription: string
	configKey: string
	authoringShape: string
	localStory: string
	sourcePages: string[]
	compileTarget: string
	envType: string
	defaultHarness: string
	testHelper: string
	bestFor: string
	remoteBoundary: string
	configSnippet: ContentDocCodeSnippet
	usageSnippet: ContentDocCodeSnippet
	testSnippet?: ContentDocCodeSnippet
	compileOutput: string
	overviewSections?: DocSection[]
}

export function createCompactBindingGuide(
	definition: CompactBindingGuideDefinition
): BindingGuideDefinition {
	return {
		slugBase: definition.slugBase,
		pathBase: definition.pathBase,
		label: definition.label,
		categoryDescription: definition.categoryDescription,
		configKey: definition.configKey,
		authoringShape: definition.authoringShape,
		localStory: definition.localStory,
		compileOutput: definition.compileOutput,
		sourcePages: definition.sourcePages,
		overview: {
			readTime: '3 min read',
			title: `Use ${definition.label} with the smallest config that states the binding contract`,
			summary: `Configure ${definition.label}, call the ${definition.envType} binding from worker code, and choose a test lane that matches the support level.`,
			description:
				'Start with the config, wire the binding into worker code, then use the support section to decide whether local tests or Cloudflare-backed tests fit.',
			highlights: [
				`Author the feature at \`${definition.configKey}\` instead of hiding it in ad-hoc Wrangler JSON.`,
				`Generated Env types expose ${definition.envType}.`,
				`${definition.localStory}.`,
				definition.remoteBoundary
			],
			bestFor: definition.bestFor,
			authoringParagraphs: [
				`Start with the smallest readable \`${definition.configKey}\` shape. If the feature needs a Cloudflare-created id or namespace, keep that explicit in config so reviewers can see where the remote boundary begins.`,
				'Use this page as the quick contract, then open the deeper internals/testing/example tabs only when the first recipe is not enough.'
			],
			authoringSnippet: definition.configSnippet,
			fitBullets: [
				`Use ${definition.label} when ${definition.bestFor.toLowerCase()}.`,
				'Keep binding names stable and uppercase in examples so generated Env declarations remain predictable.',
				'Prefer Devflare native config while it covers the feature; use `wrangler.passthrough` only for unsupported Wrangler-only fields.'
			],
			caveatBullets: [
				definition.localStory,
				definition.remoteBoundary,
				`For tests, start with ${definition.defaultHarness}; reach for ${definition.testHelper} when you want a pure unit test without Miniflare or Cloudflare.`
			],
			caveatCallout: {
				tone: 'info',
				title: 'Document the boundary at the same time as the recipe',
				body: [
					`The old docs often made developers infer whether ${definition.label} was local, remote, or fixture-backed. This page keeps that stance beside the first usable example.`
				]
			},
			extraSections: definition.overviewSections
		},
		internals: {
			readTime: '2 min read',
			summary: `${definition.label} compiles from \`${definition.configKey}\` to ${definition.compileTarget}, with local/test behavior called out explicitly.`,
			description:
				'The internals page is deliberately short: it shows the authored config beside the Wrangler-facing output and names the exact places where Devflare stops pretending to be Cloudflare.',
			highlights: [
				`Compile target: ${definition.compileTarget}.`,
				`Env type: ${definition.envType}.`,
				`Default test lane: ${definition.defaultHarness}.`
			],
			normalizationFact: `Devflare normalizes \`${definition.configKey}\` before emitting ${definition.compileTarget}`,
			compileTarget: definition.compileTarget,
			previewNote: definition.remoteBoundary,
			normalizationParagraphs: [
				'The authored config stays camelCase and project-oriented. The compiler translates that into the Wrangler keys Cloudflare expects.',
				'The generated output is intentionally shown so the docs can be checked against real compiler behavior instead of relying on memory.'
			],
			localRuntimeBullets: [
				definition.localStory,
				`The default docs recipe uses ${definition.defaultHarness}.`,
				`Pure unit tests can use ${definition.testHelper} when the test only needs deterministic application behavior.`
			],
			compileBullets: [
				`Devflare emits ${definition.compileTarget} from the native config surface.`,
				'Preview and deployment lifecycle stay feature-specific; do not assume all Cloudflare products can be created, cloned, or cleaned up the same way.',
				definition.remoteBoundary
			]
		},
		testing: {
			readTime: '3 min read',
			summary: `Test ${definition.label} by choosing the local harness that matches the product boundary instead of reaching for Cloudflare by default.`,
			description:
				'The first test should prove application control flow. Escalate to Wrangler remote binding or deployed tests only when the Cloudflare-hosted behavior is the thing under test.',
			highlights: [
				`Default harness: ${definition.defaultHarness}.`,
				`Pure helper: ${definition.testHelper}.`,
				definition.remoteBoundary
			],
			bestFor: definition.bestFor,
			defaultHarness: definition.defaultHarness,
			escalation:
				'The assertion depends on Cloudflare-hosted product behavior rather than the app calling the binding correctly',
			paragraphs: [
				'Keep the first test small. Name the binding, call the one method your route uses, and assert the behavior your app owns.',
				'When Cloudflare owns the interesting behavior, mark that as a remote/deployed lane instead of building a local fake that claims too much.'
			],
			mainSnippet: definition.testSnippet ?? definition.usageSnippet,
			helperBullets: [
				`Use ${definition.defaultHarness} for config-backed local worker tests.`,
				`Use ${definition.testHelper} for pure unit tests.`,
				'Use `shouldSkip` or an explicit integration lane when the test needs Cloudflare credentials or a local Docker/Podman engine.'
			],
			caveatBullets: [
				definition.remoteBoundary,
				'Do not let a low-fidelity mock become product documentation. Keep mocks framed as application-flow tools.',
				'If a test would mutate paid or remote Cloudflare state, gate it separately from ordinary unit tests.'
			],
			callout: {
				tone: 'warning',
				title: 'Local tests should be honest',
				body: [
					`For ${definition.label}, passing locally means the Devflare contract and app flow are correct. It does not automatically prove every hosted Cloudflare behavior.`
				]
			}
		},
		example: {
			readTime: '2 min read',
			summary: `A compact ${definition.label} recipe with config and worker usage in one application path.`,
			description:
				'Use this as the copyable starter before threading the feature into a larger application.',
			highlights: [
				'One config block.',
				'One runtime call path.',
				'One production boundary to keep visible.'
			],
			configFocus: definition.configKey,
			runtimeShape: definition.envType,
			bestUse: definition.bestFor,
			configSnippet: definition.configSnippet,
			usageSnippet: definition.usageSnippet,
			notes: [
				'Keep the first example short enough to paste into a new Worker.',
				definition.remoteBoundary
			],
			callout: {
				tone: 'accent',
				title: 'Thread this into the next recipe',
				body: [
					'Once this smallest path works, add routing, generated types, and feature-specific abstraction in that order.'
				]
			}
		}
	}
}
