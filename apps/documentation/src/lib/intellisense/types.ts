export type IntellisenseKind =
	| 'module'
	| 'config'
	| 'binding'
	| 'runtime'
	| 'test'
	| 'cli'
	| 'flag'
	| 'env'

export type IntellisenseRequirement = 'required' | 'optional' | 'contextual'

export type IntellisenseContextTag =
	| 'config'
	| 'runtime'
	| 'test'
	| 'shell'
	| 'yaml'
	| 'json'
	| 'unknown'

export interface IntellisenseLink {
	label: string
	href: string
	external?: boolean
	citation?: string
}

export interface IntellisenseEntry {
	id: string
	label: string
	kind: IntellisenseKind
	summary: string
	detail?: string
	defaultValue?: string
	requirement?: IntellisenseRequirement
	availableIn?: string
	references?: IntellisenseLink[]
}

export interface IntellisenseRenderContext {
	language: string
	filePath?: string
	code: string
	lineText?: string
	tokenType?: string
	propertyPath?: string
}

export interface IntellisenseDefinition extends IntellisenseEntry {
	aliases: string[]
	contexts?: IntellisenseContextTag[]
	filePatterns?: RegExp[]
	codeIncludes?: string[]
	lineIncludes?: string[]
	lineExcludes?: string[]
	propertyPaths?: string[]
	propertyPathSuffixes?: string[]
}
