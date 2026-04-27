export type LineState = 'normal' | 'focus' | 'dim'

export interface TreeNodeState {
	kind: 'file' | 'folder'
	muted: boolean
	available: boolean
	active: boolean
	depth: number
	name: string
	path: string
	iconClass?: string
}

export interface NormalizedCodeLine {
	index: number
	number: number
	html: string
	text: string
	state: LineState
}

export interface NormalizedCodeFile {
	path: string
	displayPath?: string
	label: string
	iconClass: string
	metaIconClass: string
	language: string
	languageLabel: string
	code: string
	copyCode: string
	lines: NormalizedCodeLine[]
	firstFocusLine?: number
}

export interface NormalizedCodeSnippet {
	title: string
	description?: string
	files: NormalizedCodeFile[]
	structure: TreeNodeState[]
	activeFile: string
	hasStructure: boolean
}
