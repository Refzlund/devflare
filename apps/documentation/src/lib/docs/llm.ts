import { docGroups, docPath } from './content'
import type {
	DocCallout,
	DocCard,
	DocCodeFile,
	DocCodeSnippet,
	DocPage,
	DocSection,
	DocTable
} from './types'

const CODE_FENCE = '```'
const STRICT_EXCLUDED_DOC_SLUGS = new Set(['documentation-contract'])

type MarkdownBlock = string | false | null | undefined

function escapeTableCell(value: string): string {
	return value
		.replace(/\|/g, '\\|')
		.replace(/\r?\n+/g, ' / ')
		.trim()
}

function createHeading(level: number, title: string): string {
	return `${'#'.repeat(level)} ${title}`
}

function joinBlocks(blocks: MarkdownBlock[]): string {
	return blocks
		.map((block) => typeof block === 'string' ? block.trim() : '')
		.filter((block) => block.length > 0)
		.join('\n\n')
}

function renderParagraphs(paragraphs: string[] | undefined): string[] {
	return paragraphs ?? []
}

function renderBullets(items: string[] | undefined): string | undefined {
	if (!items || items.length === 0) {
		return undefined
	}

	return items.map((item) => `- ${item}`).join('\n')
}

function renderSteps(items: string[] | undefined): string | undefined {
	if (!items || items.length === 0) {
		return undefined
	}

	return items.map((item, index) => `${index + 1}. ${item}`).join('\n')
}

function renderCards(cards: DocCard[] | undefined): string | undefined {
	if (!cards || cards.length === 0) {
		return undefined
	}

	return cards
		.map((card) => {
			const reference = card.href ? ` ([link](${card.href}))` : ''
			return `- **${card.title}** — ${card.body}${reference}`
		})
		.join('\n')
}

function renderTable(table: DocTable | undefined): string | undefined {
	if (!table) {
		return undefined
	}

	const headerLine = `| ${table.headers.map(escapeTableCell).join(' | ')} |`
	const dividerLine = `| ${table.headers.map(() => '---').join(' | ')} |`
	const rowLines = table.rows.map((row) => `| ${row.map(escapeTableCell).join(' | ')} |`)

	return [headerLine, dividerLine, ...rowLines].join('\n')
}

function renderBlockquote(paragraphs: string[]): string {
	return paragraphs
		.map((paragraph) => {
			return paragraph
				.split(/\r?\n/)
				.map((line) => line.trim().length > 0 ? `> ${line}` : '>')
				.join('\n')
		})
		.join('\n>\n')
}

function formatCalloutTone(callout: DocCallout): string {
	switch (callout.tone) {
		case 'success':
			return 'Tip'
		case 'warning':
			return 'Warning'
		case 'accent':
			return 'Important'
		case 'info':
		default:
			return 'Note'
	}
}

function renderCallouts(callouts: DocCallout[] | undefined): string[] {
	if (!callouts || callouts.length === 0) {
		return []
	}

	return callouts.map((callout) => {
		const ctaLine = callout.cta
			? `${callout.cta.description ? `${callout.cta.description} ` : ''}[${callout.cta.label}](${callout.cta.href})`
			: undefined

		return renderBlockquote([
			`**${formatCalloutTone(callout)} — ${callout.title}**`,
			...callout.body,
			...(ctaLine ? [ctaLine] : [])
		])
	})
}

function renderSnippets(snippets: DocCodeSnippet[] | undefined, level: number): string[] {
	if (!snippets || snippets.length === 0) {
		return []
	}

	return snippets.map((snippet) => {
		const blocks: MarkdownBlock[] = [
			createHeading(level, `Example — ${snippet.title}`),
			snippet.description
		]

		for (const file of getSnippetFiles(snippet)) {
			blocks.push(...renderSnippetFile(file, snippet, level + 1))
		}

		return joinBlocks(blocks)
	})
}

function getSnippetFiles(snippet: DocCodeSnippet): DocCodeFile[] {
	if (snippet.files?.length) {
		return snippet.files.filter((file) => file.code.trim().length > 0)
	}

	if (!snippet.code?.trim()) {
		return []
	}

	return [
		{
			path: snippet.filename,
			language: snippet.language,
			code: snippet.code
		}
	]
}

function renderSnippetFile(file: DocCodeFile, snippet: DocCodeSnippet, level: number): MarkdownBlock[] {
	const language = file.language ?? snippet.language ?? 'text'
	const code = file.code.trim()

	if (!code) {
		return []
	}

	return [
		file.path ? createHeading(level, `File — ${file.path}`) : undefined,
		`${CODE_FENCE}${language}
${code}
${CODE_FENCE}`
	]
}

function renderLabeledBlock(title: string, body: string | undefined, level: number): string | undefined {
	if (!body) {
		return undefined
	}

	return joinBlocks([
		createHeading(level, title),
		body
	])
}

function renderMetadataTable(doc: DocPage): string {
	const route = docPath(doc.slug)

	return [
		'| Field | Value |',
		'| --- | --- |',
		`| Route | [\`${route}\`](${route}) |`,
		`| Group | ${escapeTableCell(doc.group)} |`,
		`| Navigation title | ${escapeTableCell(doc.navTitle)} |`,
		`| Eyebrow | ${escapeTableCell(doc.eyebrow)} |`
	].join('\n')
}

function renderFactsTable(doc: DocPage): string {
	return [
		'| Fact | Value |',
		'| --- | --- |',
		...doc.facts.map((fact) => `| ${escapeTableCell(fact.label)} | ${escapeTableCell(fact.value)} |`)
	].join('\n')
}

function renderSection(section: DocSection, level: number = 4): string {
	const subLevel = level + 1

	return joinBlocks([
		createHeading(level, section.title),
		section.description,
		...renderParagraphs(section.paragraphs),
		renderLabeledBlock('Highlights', renderCards(section.cards), subLevel),
		renderLabeledBlock('Key points', renderBullets(section.bullets), subLevel),
		renderLabeledBlock('Steps', renderSteps(section.steps), subLevel),
		renderLabeledBlock('Reference table', renderTable(section.table), subLevel),
		...renderCallouts(section.callouts),
		...renderSnippets(section.snippets, subLevel)
	])
}

function renderDistinctParagraphs(paragraphs: Array<string | undefined>): string[] {
	const rendered: string[] = []
	const seen = new Set<string>()

	for (const paragraph of paragraphs) {
		const normalizedParagraph = paragraph?.trim()

		if (!normalizedParagraph || seen.has(normalizedParagraph)) {
			continue
		}

		seen.add(normalizedParagraph)
		rendered.push(normalizedParagraph)
	}

	return rendered
}

function renderDocPage(doc: DocPage): string {
	return joinBlocks([
		createHeading(3, doc.title),
		renderBlockquote([doc.summary]),
		renderMetadataTable(doc),
		doc.description,
		renderLabeledBlock('At a glance', renderFactsTable(doc), 4),
		...doc.sections.map((section) => renderSection(section, 4))
	])
}

function renderStrictDocPage(doc: DocPage): string {
	return joinBlocks([
		createHeading(2, doc.title),
		`Route: \`${docPath(doc.slug)}\``,
		...renderDistinctParagraphs([doc.summary, doc.description]),
		renderLabeledBlock('Key takeaways', renderBullets(doc.highlights), 3),
		...doc.sections.map((section) => renderSection(section, 3))
	])
}

function getUniqueOrderedDocs(): DocPage[] {
	const orderedDocs = docGroups.flatMap((group) => group.categories.flatMap((category) => category.items))
	const seenSlugs = new Set<string>()

	return orderedDocs.filter((doc) => {
		if (seenSlugs.has(doc.slug)) {
			return false
		}

		seenSlugs.add(doc.slug)
		return true
	})
}

function renderDocumentationMap(totalDocs: number): string {
	const lines: string[] = [
		createHeading(2, 'Documentation map'),
		`This export covers ${totalDocs} pages across ${docGroups.length} top-level groups.`
	]

	for (const group of docGroups) {
		lines.push('', createHeading(3, group.title), group.description)

		for (const category of group.categories) {
			if (category.sidebarDisplay === 'standalone') {
				lines.push(
					...category.items.map((item) => `- [${item.navTitle}](${docPath(item.slug)}) — ${item.summary}`)
				)
				continue
			}

			lines.push('', `- **${category.title}** — ${category.description}`)
			lines.push(
				...category.items.map((item) => `  - [${item.navTitle}](${docPath(item.slug)}) — ${item.summary}`)
			)
		}
	}

	return lines.join('\n')
}

export function buildLLMDocument(): string {
	const uniqueDocs = getUniqueOrderedDocs()

	return joinBlocks([
		'# Devflare documentation markdown export',
		'This file is generated from the structured documentation model in `apps/documentation/src/lib/docs/content*.ts` during the documentation build and deploy pipeline.',
		'It is meant to read like a proper markdown handbook rather than a second source of truth, so the docs site and the `LLM.md` export stay aligned.',
		createHeading(2, 'How to use this export'),
		renderBullets([
			'Read the documentation map first to find the relevant page and route quickly.',
			'Each page includes a short summary, metadata, key takeaways, and the fully expanded sections from the docs source.',
			'Links use the same `/docs/...` routes as the documentation site.'
		]),
		renderDocumentationMap(uniqueDocs.length),
		createHeading(2, 'Full documentation'),
		uniqueDocs.map(renderDocPage).join('\n\n---\n\n')
	])
}

export function buildStrictLLMDocument(): string {
	const strictDocs = getUniqueOrderedDocs().filter((doc) => !STRICT_EXCLUDED_DOC_SLUGS.has(doc.slug))

	return joinBlocks([
		'# Devflare documentation',
		strictDocs.map(renderStrictDocPage).join('\n\n---\n\n')
	])
}
