export type DocCalloutTone = 'info' | 'success' | 'warning' | 'accent'

export interface DocCalloutCta {
	label: string
	href: string
	description?: string
}

export interface DocCallout {
	tone?: DocCalloutTone
	title: string
	body: string[]
	cta?: DocCalloutCta
}

export type DocCodeLineRange = number | [number, number]

export interface DocCodeFile {
	path?: string
	label?: string
	language?: string
	code: string
	focusLines?: DocCodeLineRange[]
	dimLines?: DocCodeLineRange[]
	startLine?: number
	copyCode?: string
}

export interface DocCodeTreeEntry {
	path: string
	kind?: 'file' | 'folder'
	muted?: boolean
}

export interface DocCodeSnippet {
	title: string
	description?: string
	language?: string
	code?: string
	filename?: string
	files?: DocCodeFile[]
	structure?: DocCodeTreeEntry[]
	activeFile?: string
}

export interface DocTable {
	headers: string[]
	rows: string[][]
	layout?: 'default' | 'wide'
}

export interface DocCard {
	title: string
	body: string
	href?: string
	label?: string
	labelTooltip?: string
	meta?: string
}

export interface DocFact {
	label: string
	value: string
}

export interface DocHeaderCloudflareDocs {
	label: string
	title: string
	href: string
	summary: string
}

export interface DocSection {
	id: string
	title: string
	description?: string
	paragraphs?: string[]
	bullets?: string[]
	steps?: string[]
	cards?: DocCard[]
	callouts?: DocCallout[]
	snippets?: DocCodeSnippet[]
	table?: DocTable
}

export interface DocPage {
	slug: string
	aliases?: string[]
	group: string
	navTitle: string
	sidebarHidden?: boolean
	readTime?: string
	eyebrow: string
	title: string
	summary: string
	summaryHidden?: boolean
	description: string
	descriptionHidden?: boolean
	headerCloudflareDocs?: DocHeaderCloudflareDocs
	articleNavigationHidden?: boolean
	highlights: string[]
	facts: DocFact[]
	sourcePages: string[]
	sections: DocSection[]
}

export interface DocCategory {
	id: string
	title: string
	description: string
	sidebarDisplay?: 'disclosure' | 'links' | 'standalone'
	items: DocPage[]
	sidebarItems?: DocPage[]
}

export interface DocGroup {
	title: string
	description: string
	categories: DocCategory[]
	items: DocPage[]
}
