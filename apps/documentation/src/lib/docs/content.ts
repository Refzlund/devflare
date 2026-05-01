import { bindingDocCategories, bindingDocs } from './content/bindings'
import { buildAppsDocs } from './content/build-apps'
import { configurationDocs } from './content/configuration'
import { devflareDocs } from './content/devflare'
import { examplesDocs } from './content/examples'
import { frameworkDocs } from './content/frameworks'
import { operationsDocs } from './content/operations'
import { shipOperateDocs } from './content/ship-operate'
import { startHereDocs } from './content/start-here'
import type { DocCategory, DocGroup, DocPage } from './types'

export function docPath(slug: string): string {
	return `/docs/${slug}`
}

const allDocs: DocPage[] = [
	...startHereDocs,
	...buildAppsDocs,
	...configurationDocs,
	...devflareDocs,
	...examplesDocs,
	...frameworkDocs,
	...bindingDocs,
	...operationsDocs,
	...shipOperateDocs
]

export const docsBySlug = new Map(allDocs.map((doc) => [doc.slug, doc]))

const docsByAlias = new Map(
	allDocs.flatMap((doc) => (doc.aliases ?? []).map((alias) => [alias, doc] as const))
)

export function getDoc(slug: string): DocPage | undefined {
	return docsBySlug.get(slug) ?? docsByAlias.get(slug)
}

export function getCanonicalDocSlug(slug: string): string | undefined {
	return getDoc(slug)?.slug
}

export function getAdjacentDocs(slug: string): { previous?: DocPage; next?: DocPage } {
	const index = docs.findIndex((doc) => doc.slug === slug)
	if (index === -1) {
		return {}
	}

	return {
		previous: docs[index - 1],
		next: docs[index + 1]
	}
}

interface DocCategoryDefinition {
	id: string
	title: string
	description: string
	sidebarDisplay?: 'disclosure' | 'links' | 'standalone'
	slugs: string[]
	sidebarSlugs?: string[]
}

interface DocGroupDefinition {
	title: string
	description: string
	categories: DocCategoryDefinition[]
}

function pickDocs(slugs: string[]): DocPage[] {
	return slugs.map((slug) => docsBySlug.get(slug)).filter((doc): doc is DocPage => Boolean(doc))
}

const docStructure: DocGroupDefinition[] = [
	{
		title: 'Quickstart',
		description:
			'See why Devflare exists, build the smallest safe first worker, and move into routes, bindings, previews, and tests when the app needs them.',
		categories: [
			{
				id: 'foundations',
				title: 'Foundations',
				description:
					'Start with the mental model, the smallest safe worker, and one real test before you branch into app-specific setup.',
				sidebarDisplay: 'links',
				slugs: [
					'what-devflare-is',
					'first-worker',
					'first-unit-test',
					'first-route-tree',
					'first-bindings',
					'deploy-and-preview'
				]
			}
		]
	},
	{
		title: 'Devflare',
		description:
			'Keep the day-to-day Devflare surfaces easy to scan: runtime model, HTTP split, authored config rules, CLI workflow, helpers, testing, and framework lanes all live here instead of being scattered across deploy-only docs.',
		categories: [
			{
				id: 'cli',
				title: 'CLI',
				description:
					'Use the everyday command loop, keep deploy intent explicit, and let package-local commands resolve the config you actually mean to act on.',
				sidebarDisplay: 'standalone',
				slugs: ['devflare-cli']
			},
			{
				id: 'project-architecture',
				title: 'Project Architecture',
				description:
					'See how real Devflare packages are laid out on disk and which files you normally edit.',
				sidebarDisplay: 'standalone',
				slugs: ['project-architecture', 'bridge-architecture-internals']
			},
			{
				id: 'routing',
				title: 'Routing',
				description:
					'Keep request-wide middleware separate from route leaves so HTTP stays readable as the app grows.',
				sidebarDisplay: 'standalone',
				slugs: ['http-routing']
			},
			{
				id: 'configuration',
				title: 'Configuration',
				description:
					'Keep authored config readable, stable, and clearly separated from generated output.',
				slugs: [
					'config-basics',
					'full-config',
					'project-shape',
					'worker-surfaces',
					'generated-types',
					'config-environments',
					'typed-env-vars',
					'config-previews',
					'runtime-deploy-settings'
				]
			},
			{
				id: 'runtime',
				title: 'Runtime',
				description:
					'Use runtime helpers, request-wide middleware, transport hooks, and other worker-wide surfaces without turning every page into an internals guide.',
				slugs: [
					'runtime-context',
					'runtime-context-internals',
					'sequence-middleware',
					'runtime-handler-styles',
					'transport-file'
				]
			},
			{
				id: 'testing',
				title: 'Testing',
				description:
					'Start with why the testing experience feels different, use the testing map and built-in harness for runtime-shaped checks, and jump to binding-specific guides when the test story changes by binding.',
				slugs: [
					'why-testing-feels-native',
					'testing-overview',
					'create-test-context',
					'binding-testing-guides',
					'test-helper-reference'
				]
			},
			{
				id: 'frameworks',
				title: 'Frameworks',
				description:
					'Choose the right host lane for worker-rendered Svelte, standalone Vite apps, and full SvelteKit shells without losing the worker-first mental model.',
				slugs: ['svelte-with-rolldown', 'vite-standalone', 'sveltekit-with-devflare']
			}
		]
	},
	{
		title: 'Ship & operate',
		description:
			'Deploy explicitly, choose the right preview model, manage preview lifecycle cleanly, and keep CI/CD plus verification honest.',
		categories: [
			{
				id: 'ci-cd',
				title: 'CI/CD',
				description:
					'Use small GitHub workflows that keep triggers, permissions, impact checks, deploy intent, and feedback easy to review.',
				slugs: ['github-workflows']
			},
			{
				id: 'deploy-targets',
				title: 'Deploy targets',
				description:
					'Move from local build output to production or preview deploys without guessing which destination you are about to hit.',
				slugs: [
					'deploy-command-recipes',
					'production-deploys',
					'monorepo-turborepo',
					'preview-strategies'
				]
			},
			{
				id: 'operations',
				title: 'Operations',
				description:
					'Choose account context, inspect live production, manage Worker names and tokens, gate paid remote tests deliberately, and reuse the public Cloudflare helper API when automation needs the same rules.',
				slugs: ['control-plane-operations', 'cloudflare-api']
			},
			{
				id: 'preview-lifecycle',
				title: 'Preview lifecycle',
				description:
					'Inspect and clean up preview scopes after they exist so preview infrastructure does not sprawl.',
				slugs: ['preview-operations']
			},
			{
				id: 'verification',
				title: 'Verification',
				description:
					'Use runtime-shaped tests and keep automation observable enough to trust during releases.',
				slugs: ['testing-and-automation', 'docs-release-gates']
			}
		]
	},
	{
		title: 'Guides',
		description:
			'Use cross-cutting guides to choose the right storage, state, async, file-delivery, and worker-composition patterns before you dive into one binding reference page.',
		categories: [
			{
				id: 'guides',
				title: 'Guides',
				description:
					'Choose the right architecture and product boundary first, then let the specific binding pages own the exact authoring and runtime mechanics.',
				sidebarDisplay: 'links',
				slugs: [
					'feature-index',
					'storage-bindings',
					'r2-uploads-and-delivery',
					'durable-objects-and-queues',
					'multi-workers'
				]
			}
		]
	},
	{
		title: 'Bindings',
		description:
			'Use the per-binding guides for the exact authoring, runtime, testing, preview, and example details once the guide pages have already helped you choose the right pattern.',
		categories: [...bindingDocCategories]
	}
]

export const docGroups: DocGroup[] = docStructure.map((group) => {
	const categories: DocCategory[] = group.categories.map((category) => ({
		id: category.id,
		title: category.title,
		description: category.description,
		sidebarDisplay: category.sidebarDisplay,
		items: pickDocs(category.slugs),
		sidebarItems: pickDocs(category.sidebarSlugs ?? category.slugs)
	}))

	return {
		title: group.title,
		description: group.description,
		categories,
		items: categories.flatMap((category) => category.items)
	}
})

export const docs: DocPage[] = Array.from(
	new Map(
		docGroups
			.flatMap((group) => group.categories.flatMap((category) => category.items))
			.map((doc) => [doc.slug, doc])
	).values()
)
