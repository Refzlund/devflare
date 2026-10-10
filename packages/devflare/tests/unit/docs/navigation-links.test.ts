import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseInlineText } from '../../../../../apps/documentation/src/lib/components/content/inline'

async function readHomeNextSource(): Promise<string> {
	return readFile(
		join(
			import.meta.dir,
			'..',
			'..',
			'..',
			'..',
			'..',
			'apps',
			'documentation',
			'src',
			'lib',
			'components',
			'home',
			'HomeNext.svelte'
		),
		'utf8'
	)
}

describe('documentation navigation links', () => {
	test('parses inline markdown links alongside code spans', () => {
		expect(parseInlineText('Open [First worker](/docs/first-worker) then `devflare dev`')).toEqual([
			{ kind: 'text', value: 'Open ' },
			{ kind: 'link', value: 'First worker', href: '/docs/first-worker' },
			{ kind: 'text', value: ' then ' },
			{ kind: 'code', value: 'devflare dev' }
		])
	})

	test('home page owns the moved docs landing paths and route tree example', async () => {
		const source = await readHomeNextSource()
		const pathSlugs = [
			'first-worker',
			'first-unit-test',
			'first-route-tree',
			'http-routing',
			'first-bindings',
			'bindings/kv',
			'test-helper-reference',
			'deploy-and-preview',
			'deploy-command-recipes',
			'feature-index',
			'binding-testing-guides'
		]

		expect(source).toContain('Next: Do what matters')
		expect(source).toContain('A route-tree path you can copy after the first worker runs')
		expect(source).toContain('workerOnlyRecipeFiles')
		expect(pathSlugs.every((slug) => source.includes(`docPath('${slug}')`))).toBe(true)
	})
})
