import { definitionsPart1 } from './registry/definitions-1'
import { definitionsPart2 } from './registry/definitions-2'
import { definitionsPart3 } from './registry/definitions-3'
import { definitionsPart4 } from './registry/definitions-4'
import { configFilePattern } from './registry/shared'
import type {
	IntellisenseContextTag,
	IntellisenseDefinition,
	IntellisenseEntry,
	IntellisenseRenderContext
} from './types'

const definitions = [definitionsPart1, definitionsPart2, definitionsPart3, definitionsPart4].flat()

const entriesById = new Map<string, IntellisenseEntry>(
	definitions.map((definition) => {
		const {
			aliases,
			contexts,
			filePatterns,
			codeIncludes,
			lineIncludes,
			lineExcludes,
			propertyPaths,
			propertyPathSuffixes,
			...entry
		} = definition

		void aliases
		void contexts
		void filePatterns
		void codeIncludes
		void lineIncludes
		void lineExcludes
		void propertyPaths
		void propertyPathSuffixes

		return [definition.id, entry]
	})
)

function normalizeSource(value: string | undefined): string {
	return value?.toLowerCase() ?? ''
}

function matchesPropertyPath(path: string, pattern: string): boolean {
	const pathSegments = path.split('.')
	const patternSegments = pattern.split('.')

	if (pathSegments.length !== patternSegments.length) {
		return false
	}

	return patternSegments.every((segment, index) => {
		return segment === '*' || segment === pathSegments[index]
	})
}

function matchesPropertyPathSuffix(path: string, suffix: string): boolean {
	const pathSegments = path.split('.')
	const suffixSegments = suffix.split('.')

	if (suffixSegments.length > pathSegments.length) {
		return false
	}

	const offset = pathSegments.length - suffixSegments.length

	return suffixSegments.every((segment, index) => {
		return segment === '*' || segment === pathSegments[offset + index]
	})
}

export function normalizeIntellisenseToken(token: string): string {
	let normalized = token.trim()
	normalized = normalized.replace(/^[`'"([{]+/, '')
	normalized = normalized.replace(/[)\]}',;:"`]+$/, '')
	normalized = normalized.replace(/\(\)$/, '')
	return normalized.trim().toLowerCase()
}

function getContextTags(context: IntellisenseRenderContext): Set<IntellisenseContextTag> {
	const tags = new Set<IntellisenseContextTag>()
	const language = context.language.trim().toLowerCase()
	const code = normalizeSource(context.code)
	const filePath = normalizeSource(context.filePath)

	switch (language) {
		case 'bash':
		case 'shell':
		case 'sh':
			tags.add('shell')
			break
		case 'yaml':
		case 'yml':
			tags.add('yaml')
			break
		case 'json':
		case 'jsonc':
			tags.add('json')
			break
		default:
			break
	}

	if (configFilePattern.test(context.filePath ?? '') || code.includes('devflare/config')) {
		tags.add('config')
	}

	if (code.includes('devflare/runtime')) {
		tags.add('runtime')
	}

	if (
		filePath.includes('/tests/') ||
		filePath.includes('test.') ||
		code.includes('devflare/test') ||
		code.includes('bun:test')
	) {
		tags.add('test')
	}

	if (tags.size === 0) {
		tags.add('unknown')
	}

	return tags
}

function matchesDefinition(
	definition: IntellisenseDefinition,
	normalizedToken: string,
	context: IntellisenseRenderContext,
	contextTags: Set<IntellisenseContextTag>
): boolean {
	if (context.tokenType?.toLowerCase() === 'comment') {
		return false
	}

	if (!definition.aliases.some((alias) => normalizeIntellisenseToken(alias) === normalizedToken)) {
		return false
	}

	if (definition.contexts?.length && !definition.contexts.some((tag) => contextTags.has(tag))) {
		return false
	}

	const filePath = context.filePath ?? ''
	if (
		definition.filePatterns?.length &&
		!definition.filePatterns.some((pattern) => pattern.test(filePath))
	) {
		return false
	}

	const code = normalizeSource(context.code)
	if (
		definition.codeIncludes?.length &&
		!definition.codeIncludes.every((part) => code.includes(part.toLowerCase()))
	) {
		return false
	}

	const lineText = normalizeSource(context.lineText)
	if (
		definition.lineIncludes?.length &&
		!definition.lineIncludes.every((part) => lineText.includes(part.toLowerCase()))
	) {
		return false
	}

	if (definition.lineExcludes?.some((part) => lineText.includes(part.toLowerCase()))) {
		return false
	}

	const propertyPath = context.propertyPath
	if (definition.propertyPaths?.length) {
		if (
			!propertyPath ||
			!definition.propertyPaths.some((pattern) => matchesPropertyPath(propertyPath, pattern))
		) {
			return false
		}
	}

	if (definition.propertyPathSuffixes?.length) {
		if (
			!propertyPath ||
			!definition.propertyPathSuffixes.some((suffix) =>
				matchesPropertyPathSuffix(propertyPath, suffix)
			)
		) {
			return false
		}
	}

	return true
}

export function resolveIntellisenseEntry(
	token: string,
	context: IntellisenseRenderContext
): IntellisenseEntry | undefined {
	const normalizedToken = normalizeIntellisenseToken(token)
	if (!normalizedToken) {
		return undefined
	}

	const contextTags = getContextTags(context)
	const match = definitions.find((definition) => {
		return matchesDefinition(definition, normalizedToken, context, contextTags)
	})

	return match ? entriesById.get(match.id) : undefined
}

export function getIntellisenseEntryById(id: string): IntellisenseEntry | undefined {
	return entriesById.get(id)
}
