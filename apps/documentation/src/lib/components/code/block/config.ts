import type { DocCodeSnippet, DocCodeTreeEntry } from '$lib/docs/types'
import { basename, normalizePath, toKebabCase } from './path'

type ConfigPathContext = {
	path: string
	kind: 'object' | 'array'
}

const wildcardConfigContainerPatterns = [
	'env',
	'vars',
	'secrets',
	'bindings.kv',
	'bindings.d1',
	'bindings.r2',
	'bindings.durableObjects',
	'bindings.services',
	'bindings.vectorize',
	'bindings.hyperdrive',
	'bindings.browser',
	'bindings.analyticsEngine',
	'bindings.sendEmail',
	'bindings.queues.producers'
]

export function inferSnippetPath(snippet: DocCodeSnippet): string | undefined {
	const code = snippet.code?.trim()
	if (!code) {
		return undefined
	}

	const language = snippet.language?.trim().toLowerCase()
	if (isCommandLanguage(language)) {
		return undefined
	}

	if (isConfigSnippetCode(code)) {
		return 'devflare.config.ts'
	}

	if (/from ['"]bun:test['"]/.test(code)) {
		return 'tests/worker.test.ts'
	}

	const durableObjectClass = code.match(
		/\bexport\s+class\s+([A-Z][A-Za-z0-9_]*)\s+extends\s+DurableObject(?:<[^>]+>)?\b/
	)?.[1]
	if (durableObjectClass) {
		return `src/do/${toKebabCase(durableObjectClass)}.ts`
	}

	if (/\bextends\s+WorkerEntrypoint\b/.test(code)) {
		return 'src/worker.ts'
	}

	if (
		/\bexport\s+(?:async\s+)?function\s+fetch\b/.test(code) ||
		/\bexport\s+const\s+handle\b/.test(code)
	) {
		return 'src/fetch.ts'
	}

	if (/\bexport\s+(?:async\s+)?function\s+queue\b/.test(code)) {
		return 'src/queue.ts'
	}

	if (/\bexport\s+(?:async\s+)?function\s+scheduled\b/.test(code)) {
		return 'src/scheduled.ts'
	}

	if (
		/\bexport\s+(?:async\s+)?function\s+email\b/.test(code) ||
		/\bForwardableEmailMessage\b/.test(code)
	) {
		return 'src/email.ts'
	}

	if (/\bexport\s+(?:async\s+)?function\s+tail\b/.test(code)) {
		return 'src/tail.ts'
	}

	if (/\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(code)) {
		return 'src/routes/index.ts'
	}

	return undefined
}

export function isCommandLanguage(language: string | undefined): boolean {
	if (!language) {
		return false
	}

	return ['bash', 'console', 'powershell', 'ps1', 'shell', 'sh', 'zsh'].includes(language)
}

export function isConfigSnippetCode(code: string): boolean {
	return /\bdefineConfig\s*\(/.test(code) || /from ['"]devflare\/config['"]/.test(code)
}

function matchesConfigPathSegments(path: string, pattern: string): boolean {
	const pathSegments = path.split('.')
	const patternSegments = pattern.split('.')

	if (pathSegments.length !== patternSegments.length) {
		return false
	}

	return patternSegments.every((segment, index) => {
		return segment === '*' || segment === pathSegments[index]
	})
}

function matchesConfigPathSuffix(path: string, suffix: string): boolean {
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

function isWildcardConfigContainerPath(path: string): boolean {
	return wildcardConfigContainerPatterns.some((pattern) => {
		return matchesConfigPathSegments(path, pattern) || matchesConfigPathSuffix(path, pattern)
	})
}

function resolveConfigPropertyPath(parentPath: string | undefined, propertyName: string): string {
	if (!parentPath) {
		return propertyName
	}

	if (isWildcardConfigContainerPath(parentPath)) {
		return `${parentPath}.*`
	}

	return `${parentPath}.${propertyName}`
}

function maskQuotedText(line: string): string {
	let masked = ''
	let activeQuote: '"' | "'" | '`' | undefined
	let escaping = false

	for (let index = 0; index < line.length; index += 1) {
		const character = line[index]
		const nextCharacter = line[index + 1]

		if (activeQuote) {
			if (escaping) {
				escaping = false
				masked += ' '
				continue
			}

			if (character === '\\') {
				escaping = true
				masked += ' '
				continue
			}

			if (character === activeQuote) {
				activeQuote = undefined
			}

			masked += ' '
			continue
		}

		if (character === '/' && nextCharacter === '/') {
			masked += ' '.repeat(line.length - index)
			break
		}

		if (character === '"' || character === "'" || character === '`') {
			activeQuote = character
			masked += ' '
			continue
		}

		masked += character
	}

	return masked
}

function closesOnSameLine(
	value: string,
	openCharacter: '{' | '[',
	closeCharacter: '}' | ']'
): boolean {
	let depth = 0

	for (const character of value) {
		if (character === openCharacter) {
			depth += 1
			continue
		}

		if (character === closeCharacter) {
			depth -= 1
			if (depth === 0) {
				return true
			}
		}
	}

	return false
}

export function getConfigLinePropertyPaths(code: string): Array<string | undefined> {
	const contexts: ConfigPathContext[] = []

	return code.split('\n').map((line) => {
		const maskedLine = maskQuotedText(line)
		let workingLine = maskedLine.trimStart()

		while (workingLine.startsWith('}') || workingLine.startsWith(']')) {
			contexts.pop()
			workingLine = workingLine.slice(1).trimStart()

			if (workingLine.startsWith(',')) {
				workingLine = workingLine.slice(1).trimStart()
			}
		}

		if (!workingLine) {
			return undefined
		}

		const propertyMatch = workingLine.match(/^[{,(]*\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/)
		if (!propertyMatch) {
			if (contexts.at(-1)?.kind === 'array' && workingLine.startsWith('{')) {
				const arrayPath = contexts.at(-1)?.path
				if (arrayPath) {
					contexts.push({
						path: arrayPath,
						kind: 'object'
					})

					if (closesOnSameLine(workingLine, '{', '}')) {
						contexts.pop()
					}
				}
			}

			return undefined
		}

		const propertyName = propertyMatch[1]
		const propertyPath = resolveConfigPropertyPath(contexts.at(-1)?.path, propertyName)
		const afterColon = workingLine.slice(propertyMatch[0].length).trimStart()

		if (afterColon.startsWith('{')) {
			contexts.push({
				path: propertyPath,
				kind: 'object'
			})

			if (closesOnSameLine(afterColon, '{', '}')) {
				contexts.pop()
			}
		} else if (afterColon.startsWith('[')) {
			contexts.push({
				path: propertyPath,
				kind: 'array'
			})

			if (closesOnSameLine(afterColon, '[', ']')) {
				contexts.pop()
			}
		}

		return propertyPath
	})
}

export function inferConfigContextEntries(code: string): DocCodeTreeEntry[] {
	const entries: DocCodeTreeEntry[] = []
	const seenPaths = new Set<string>()

	function addPatternPath(pathPattern: string | undefined): void {
		const entry = createStructureEntryFromPattern(pathPattern)
		if (!entry || seenPaths.has(entry.path)) {
			return
		}

		seenPaths.add(entry.path)
		entries.push(entry)
	}

	for (const match of code.matchAll(
		/\b(fetch|worker|queue|scheduled|email|tail)\s*:\s*['"]([^'"]+)['"]/g
	)) {
		addPatternPath(match[2])
	}

	for (const match of code.matchAll(/\bdurableObjects\s*:\s*['"]([^'"]+)['"]/g)) {
		addPatternPath(match[1])
	}

	for (const match of code.matchAll(
		/\broutes\s*:\s*\{[\s\S]*?\bdir\s*:\s*['"]([^'"]+)['"][\s\S]*?\}/g
	)) {
		addPatternPath(match[1])
	}

	return entries
}

export function createStructureEntryFromPattern(
	pathPattern: string | undefined
): DocCodeTreeEntry | undefined {
	if (!pathPattern) {
		return undefined
	}

	const normalizedPattern = normalizePath(pathPattern)
	if (!normalizedPattern) {
		return undefined
	}

	const wildcardIndex = normalizedPattern.search(/[\*\{\[]/)
	const path = (
		wildcardIndex === -1 ? normalizedPattern : normalizedPattern.slice(0, wildcardIndex)
	).replace(/\/+$/, '')

	if (!path) {
		return undefined
	}

	return {
		path,
		kind: /\.[^/]+$/.test(path) ? 'file' : 'folder'
	}
}

export function isDevflareConfigPath(path: string): boolean {
	return /^devflare\.config\.(ts|js|mts|cts|mjs|cjs)$/.test(basename(path))
}

export function isTypeAwarePath(path: string): boolean {
	return /\.(ts|tsx|mts|cts|svelte)$/.test(path) || isDevflareConfigPath(path)
}
