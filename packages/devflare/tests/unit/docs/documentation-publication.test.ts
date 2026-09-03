import { describe, expect, test } from 'bun:test'
import { docs } from '../../../../../apps/documentation/src/lib/docs/content'

function docText(slug: string): string {
	const doc = docs.find((candidate) => candidate.slug === slug)
	expect(doc, `Expected docs to include ${slug}`).toBeDefined()
	return JSON.stringify(doc)
}

function expectPageNotPublished(slug: string): void {
	expect(docs.some((doc) => doc.slug === slug)).toBe(false)
	expect(docs.some((doc) => doc.aliases?.includes(slug))).toBe(false)
}

describe('documentation publication boundaries', () => {
	test('recipe-first docs architecture pages exist', () => {
		const requiredSlugs = [
			'first-route-tree',
			'first-unit-test',
			'first-bindings',
			'deploy-and-preview',
			'feature-index',
			'runtime-context-internals',
			'runtime-handler-styles',
			'test-helper-reference',
			'deploy-command-recipes',
			'docs-release-gates',
			'bridge-architecture-internals'
		]

		expect(requiredSlugs.filter((slug) => !docs.some((doc) => doc.slug === slug))).toEqual([])
	})

	test('runtime context usage page keeps runtime internals on the internals page', () => {
		expect(docText('runtime-context')).not.toContain('AsyncLocalStorage')
		expect(docText('runtime-context')).not.toContain('runWithEventContext')
		expect(docText('runtime-context-internals')).toContain('AsyncLocalStorage')
		expect(docText('runtime-context-internals')).toContain('runWithEventContext')
	})

	test('removed docs pages are not published', () => {
		expectPageNotPublished('case-catalog')
		expectPageNotPublished('recipe-packs')
		expectPageNotPublished('binding-chooser')
		expectPageNotPublished('learn-from-real-tests')
		expectPageNotPublished('docs-landing-paths')
	})

	test('feature support matrix snapshot covers the main local and remote support lanes', () => {
		const featureIndex = docs.find((doc) => doc.slug === 'feature-index')
		const matrixTable = featureIndex?.sections.find((section) => section.id === 'matrix')?.table
		const matrixRows = matrixTable?.rows ?? []
		const rowLabels = matrixRows.map((row) => row[0]).sort()

		expect(matrixTable?.layout).toBe('wide')
		expect(matrixTable?.headers).toEqual([
			'Feature',
			'Support',
			'Cloudflare boundary',
			'Test helper',
			'Preview lifecycle',
			'Docs'
		])
		expect(rowLabels).toEqual(
			[
				'Browser Rendering',
				'Containers',
				'D1',
				'Durable Objects',
				'Email',
				'Hyperdrive',
				'Images',
				'KV',
				'Media Transformations',
				'Queues',
				'R2',
				'Route tree',
				'Scheduled',
				'Secrets Store',
				'Tail Workers',
				'Vectorize',
				'Worker Loaders',
				'Workers AI',
				'Workflows'
			].sort()
		)
		expect(matrixRows.every((row) => row.length === 6)).toBe(true)
		expect([...new Set(matrixRows.map((row) => row[1]))].sort()).toEqual(['Full', 'Remote'])
	})
})
