import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { docs } from '../../../../../apps/documentation/src/lib/docs/content'
import { bindingDocCategories } from '../../../../../apps/documentation/src/lib/docs/content/bindings'

interface HeaderCloudflareDocs {
	label?: string
	title?: string
	href?: string
	summary?: string
}

interface HeaderSupportBadge {
	label?: string
	tooltip?: string
}

function workspacePath(...segments: string[]): string {
	return join(import.meta.dir, '..', '..', '..', '..', '..', ...segments)
}

function bindingSlugs(): string[] {
	return bindingDocCategories.flatMap((category) => category.slugs)
}

function headerCloudflareDocs(slug: string): HeaderCloudflareDocs | undefined {
	const doc = docs.find((candidate) => candidate.slug === slug)
	return (doc as { headerCloudflareDocs?: HeaderCloudflareDocs } | undefined)?.headerCloudflareDocs
}

function headerSupportBadge(slug: string): HeaderSupportBadge | undefined {
	const doc = docs.find((candidate) => candidate.slug === slug)
	return (doc as { headerSupport?: HeaderSupportBadge } | undefined)?.headerSupport
}

function headerReferenceFailures(slug: string): string[] {
	const reference = headerCloudflareDocs(slug)
	const support = headerSupportBadge(slug)
	const problems: string[] = []

	if (!reference) {
		return [`${slug}: missing headerCloudflareDocs`]
	}

	if (reference.label !== 'Cloudflare Documentation') {
		problems.push(`${slug}: button label is not stable`)
	}

	if (!reference.href?.startsWith('https://developers.cloudflare.com/')) {
		problems.push(`${slug}: Cloudflare docs href is not an official docs URL`)
	}

	if (!reference.title?.startsWith('Cloudflare ')) {
		problems.push(`${slug}: title does not name the Cloudflare docs target`)
	}

	if (!reference.summary || reference.summary.length < 40 || reference.summary.length > 180) {
		problems.push(`${slug}: intro summary is missing or not concise`)
	}

	if (!support?.label || !['Full', 'Remote', 'Limited'].includes(support.label)) {
		problems.push(`${slug}: missing header support badge`)
	}

	if (!support?.tooltip || support.tooltip.length < 40) {
		problems.push(`${slug}: support badge tooltip is missing or too terse`)
	}

	return problems
}

describe('Cloudflare reference headers', () => {
	test('binding pages expose a short product intro and Cloudflare docs link', () => {
		const failures = bindingSlugs().flatMap(headerReferenceFailures)

		expect(failures).toEqual([])
	})

	test('article header renders the Cloudflare docs action as a new-tab button', () => {
		const source = readFileSync(
			workspacePath(
				'apps',
				'documentation',
				'src',
				'lib',
				'components',
				'article',
				'Article.svelte'
			),
			'utf8'
		)

		expect(source).toContain('doc.headerCloudflareDocs')
		expect(source).toContain('doc.headerSupport')
		expect(source).toContain('use:tooltip={doc.headerSupport.tooltip}')
		expect(source).toContain('Cloudflare Documentation')
		expect(source).toContain('target="_blank"')
		expect(source).toContain('fluent--open-16-regular')
	})

	test('article header places product intro after the h1', () => {
		const source = readFileSync(
			workspacePath(
				'apps',
				'documentation',
				'src',
				'lib',
				'components',
				'article',
				'Article.svelte'
			),
			'utf8'
		)
		const headingIndex = source.indexOf('<h1')
		const introIndex = source.indexOf('doc.headerCloudflareDocs.summary')

		expect(headingIndex).toBeGreaterThan(-1)
		expect(introIndex).toBeGreaterThan(headingIndex)
	})
})
