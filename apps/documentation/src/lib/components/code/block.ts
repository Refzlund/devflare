import Prism from 'prismjs'
import type { Grammar, Token as PrismToken, TokenStream } from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'

import type {
	DocCodeFile,
	DocCodeLineRange,
	DocCodeSnippet,
	DocCodeTreeEntry
} from '$lib/docs/types'
import { resolveIntellisenseEntry } from '$lib/intellisense/registry'
import type { IntellisenseRenderContext } from '$lib/intellisense/types'

type LineState = 'normal' | 'focus' | 'dim'

interface TreeNodeState {
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

const languageAliases: Record<string, string> = {
	bash: 'bash',
	html: 'markup',
	json: 'json',
	jsonc: 'json',
	md: 'markdown',
	markdown: 'markdown',
	plain: 'plain',
	sh: 'bash',
	shell: 'bash',
	svelte: 'markup',
	ts: 'typescript',
	txt: 'plain',
	yaml: 'yaml',
	yml: 'yaml'
}

const extensionLanguages: Record<string, string> = {
	bash: 'bash',
	html: 'markup',
	json: 'json',
	jsonc: 'json',
	md: 'markdown',
	sh: 'bash',
	svelte: 'markup',
	ts: 'typescript',
	yaml: 'yaml',
	yml: 'yaml'
}

const fileIconClassNames = {
	astro: 'material-icon-theme--astro',
	console: 'material-icon-theme--console',
	css: 'material-icon-theme--css',
	docker: 'material-icon-theme--docker',
	document: 'material-icon-theme--document',
	git: 'material-icon-theme--git',
	html: 'material-icon-theme--html',
	javascript: 'material-icon-theme--javascript',
	json: 'material-icon-theme--json',
	lock: 'material-icon-theme--lock',
	markdown: 'material-icon-theme--markdown',
	mdx: 'material-icon-theme--mdx',
	nodejs: 'material-icon-theme--nodejs',
	npm: 'material-icon-theme--npm',
	react: 'material-icon-theme--react',
	reactTs: 'material-icon-theme--react-ts',
	settings: 'material-icon-theme--settings',
	svelte: 'material-icon-theme--svelte',
	tailwindcss: 'material-icon-theme--tailwindcss',
	toml: 'material-icon-theme--toml',
	typescript: 'material-icon-theme--typescript',
	typescriptDef: 'material-icon-theme--typescript-def',
	vite: 'material-icon-theme--vite',
	wrangler: 'material-icon-theme--wrangler',
	xml: 'material-icon-theme--xml',
	yaml: 'material-icon-theme--yaml',
	svg: 'material-icon-theme--svg'
} as const

let intellisenseHookRegistered = false
let activeIntellisenseRenderContext: IntellisenseRenderContext | undefined

interface PrismWrapEnvironment {
	type: string
	content: string
	classes: string[]
	attributes: Record<string, string>
}

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

function ensureIntellisenseHook(): void {
	if (intellisenseHookRegistered) {
		return
	}

	intellisenseHookRegistered = true

	Prism.hooks.add('wrap', ((environment: PrismWrapEnvironment) => {
		if (!activeIntellisenseRenderContext || typeof environment.content !== 'string') {
			return
		}

		const entry = resolveIntellisenseEntry(environment.content, {
			...activeIntellisenseRenderContext,
			tokenType: environment.type
		})

		if (!entry) {
			return
		}

		environment.attributes ??= {}
		environment.attributes['data-intellisense-id'] = entry.id

		if (!environment.classes.includes('docs-code-intellisense-token')) {
			environment.classes.push('docs-code-intellisense-token')
		}
	}) as (environment: PrismWrapEnvironment) => void)
}

export function normalizeSnippet(snippet: DocCodeSnippet): NormalizedCodeSnippet {
	const files = snippet.files?.length
		? snippet.files.map((file, index) => normalizeFile(file, snippet, index))
		: [normalizeLegacyFile(snippet)]
	const activeFile = resolveInitialActiveFile(snippet.activeFile, files)
	const structureEntries = resolveStructureEntries(snippet, files)
	const structure = normalizeStructure(structureEntries, files, activeFile)

	return {
		title: snippet.title,
		description: snippet.description,
		files,
		structure,
		activeFile,
		hasStructure: structure.length > 1
	}
}

export function getCopyCode(file: NormalizedCodeFile): string {
	return file.copyCode
}

function normalizeLegacyFile(snippet: DocCodeSnippet): NormalizedCodeFile {
	const displayPath = snippet.filename
		? normalizePath(snippet.filename)
		: inferSnippetPath(snippet)
	const path = displayPath ?? '__snippet__0'
	const language = resolveLanguage(snippet.language, displayPath)
	const languageLabel = resolveLanguageLabel(snippet.language, displayPath, language)
	const code = snippet.code ?? ''
	const htmlLines = highlightCodeLines(code, language, displayPath)
	const sourceLines = code.split('\n')

	return {
		path,
		displayPath,
		label: displayPath ? basename(displayPath) : snippet.title,
		iconClass: resolveFileIconClass(displayPath ?? snippet.filename ?? snippet.title),
		metaIconClass: resolveMetaIconClass(displayPath ?? snippet.filename, languageLabel),
		language,
		languageLabel,
		code,
		copyCode: code,
		lines: htmlLines.map((html, index) => ({
			index: index + 1,
			number: index + 1,
			html,
			text: sourceLines[index] ?? '',
			state: 'normal'
		}))
	}
}

function normalizeFile(
	file: DocCodeFile,
	snippet: DocCodeSnippet,
	index: number
): NormalizedCodeFile {
	const displayPath = file.path ? normalizePath(file.path) : undefined
	const path = displayPath ?? `__file__${index}`
	const language = resolveLanguage(file.language ?? snippet.language, displayPath)
	const languageLabel = resolveLanguageLabel(file.language ?? snippet.language, displayPath, language)
	const code = file.code
	const htmlLines = highlightCodeLines(code, language, displayPath)
	const sourceLines = code.split('\n')
	const effectiveFocusLines = extendFocusLines(code, file.focusLines)
	const firstFocusLine = getFirstLine(effectiveFocusLines)
	const startLine = file.startLine ?? 1

	return {
		path,
		displayPath,
		label: file.label ?? (displayPath ? basename(displayPath) : `File ${index + 1}`),
		iconClass: resolveFileIconClass(displayPath ?? file.label ?? `file-${index + 1}`),
		metaIconClass: resolveMetaIconClass(displayPath ?? file.label, languageLabel),
		language,
		languageLabel,
		code,
		copyCode: file.copyCode ?? code,
		firstFocusLine,
		lines: htmlLines.map((html, lineIndex) => ({
			index: lineIndex + 1,
			number: startLine + lineIndex,
			html,
			text: sourceLines[lineIndex] ?? '',
			state: getLineState(lineIndex + 1, effectiveFocusLines, file.dimLines)
		}))
	}
}

function extendFocusLines(
	code: string,
	ranges: DocCodeLineRange[] | undefined
): DocCodeLineRange[] | undefined {
	if (!ranges?.length) {
		return undefined
	}

	const codeLines = code.split('\n')

	return ranges.map((range) => {
		if (!Array.isArray(range)) {
			return range
		}

		let [start, end] = range

		while (end < codeLines.length && isTrailingClosureLine(codeLines[end])) {
			end += 1
		}

		return [start, end]
	})
}

function resolveInitialActiveFile(
	requestedPath: string | undefined,
	files: NormalizedCodeFile[]
): string {
	if (requestedPath) {
		const normalizedRequestedPath = normalizePath(requestedPath)
		const match = files.find((file) => file.path === normalizedRequestedPath)
		if (match) {
			return match.path
		}
	}

	return files[0]?.path ?? '__snippet__0'
}

function resolveStructureEntries(
	snippet: DocCodeSnippet,
	files: NormalizedCodeFile[]
): DocCodeTreeEntry[] | undefined {
	if (snippet.structure?.length) {
		return snippet.structure
	}

	return buildImplicitStructureEntries(files)
}

function buildImplicitStructureEntries(files: NormalizedCodeFile[]): DocCodeTreeEntry[] {
	const filesWithPaths = files.filter((file): file is NormalizedCodeFile & { displayPath: string } => {
		return Boolean(file.displayPath)
	})

	if (filesWithPaths.length === 0) {
		return []
	}

	const entries: DocCodeTreeEntry[] = []
	const seenPaths = new Set<string>()
	const actualPaths = new Set(filesWithPaths.map((file) => file.path))
	const configFile = filesWithPaths.find((file) => isDevflareConfigPath(file.path))
	const hasSourceFile = filesWithPaths.some((file) => file.path.startsWith('src/'))
	const hasTestFile = filesWithPaths.some((file) => file.path.startsWith('tests/'))
	const hasEnvFile = actualPaths.has('env.d.ts')
	const hasProjectContext = Boolean(configFile) || hasSourceFile || hasTestFile || hasEnvFile
	const shouldShowEnvFile = hasProjectContext && filesWithPaths.some((file) => isTypeAwarePath(file.path))

	function addEntry(entry: DocCodeTreeEntry | undefined): void {
		if (!entry) {
			return
		}

		const path = normalizePath(entry.path)
		if (!path || seenPaths.has(path)) {
			return
		}

		seenPaths.add(path)
		entries.push({
			...entry,
			path
		})
	}

	if (configFile) {
		addEntry({ path: configFile.path })
	} else if (hasProjectContext) {
		addEntry({ path: 'devflare.config.ts', muted: true })
	}

	if (configFile) {
		for (const entry of inferConfigContextEntries(configFile.code)) {
			if (!actualPaths.has(entry.path)) {
				addEntry({
					...entry,
					muted: true
				})
			}
		}
	}

	if (hasTestFile && !hasSourceFile) {
		addEntry({ path: 'src/fetch.ts', muted: true })
	}

	for (const file of filesWithPaths) {
		if (isDevflareConfigPath(file.path) || file.path === 'env.d.ts') {
			continue
		}

		addEntry({ path: file.path })
	}

	if (hasEnvFile) {
		addEntry({ path: 'env.d.ts' })
	} else if (shouldShowEnvFile) {
		addEntry({ path: 'env.d.ts', muted: true })
	}

	return entries
}

function inferSnippetPath(snippet: DocCodeSnippet): string | undefined {
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

	const durableObjectClass = code.match(/\bexport\s+class\s+([A-Z][A-Za-z0-9_]*)\s+extends\s+DurableObject(?:<[^>]+>)?\b/)?.[1]
	if (durableObjectClass) {
		return `src/do/${toKebabCase(durableObjectClass)}.ts`
	}

	if (/\bextends\s+WorkerEntrypoint\b/.test(code)) {
		return 'src/worker.ts'
	}

	if (/\bexport\s+(?:async\s+)?function\s+fetch\b/.test(code) || /\bexport\s+const\s+handle\b/.test(code)) {
		return 'src/fetch.ts'
	}

	if (/\bexport\s+(?:async\s+)?function\s+queue\b/.test(code)) {
		return 'src/queue.ts'
	}

	if (/\bexport\s+(?:async\s+)?function\s+scheduled\b/.test(code)) {
		return 'src/scheduled.ts'
	}

	if (/\bexport\s+(?:async\s+)?function\s+email\b/.test(code) || /\bForwardableEmailMessage\b/.test(code)) {
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

function isCommandLanguage(language: string | undefined): boolean {
	if (!language) {
		return false
	}

	return ['bash', 'console', 'powershell', 'ps1', 'shell', 'sh', 'zsh'].includes(language)
}

function isConfigSnippetCode(code: string): boolean {
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

function resolveConfigPropertyPath(
	parentPath: string | undefined,
	propertyName: string
): string {
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
	let activeQuote: '"' | '\'' | '`' | undefined
	let escaping = false

	for (let index = 0;index < line.length;index += 1) {
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

		if (character === '"' || character === '\'' || character === '`') {
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

function getConfigLinePropertyPaths(code: string): Array<string | undefined> {
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

function inferConfigContextEntries(code: string): DocCodeTreeEntry[] {
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

	for (const match of code.matchAll(/\b(fetch|worker|queue|scheduled|email|tail)\s*:\s*['"]([^'"]+)['"]/g)) {
		addPatternPath(match[2])
	}

	for (const match of code.matchAll(/\bdurableObjects\s*:\s*['"]([^'"]+)['"]/g)) {
		addPatternPath(match[1])
	}

	for (const match of code.matchAll(/\broutes\s*:\s*\{[\s\S]*?\bdir\s*:\s*['"]([^'"]+)['"][\s\S]*?\}/g)) {
		addPatternPath(match[1])
	}

	return entries
}

function createStructureEntryFromPattern(pathPattern: string | undefined): DocCodeTreeEntry | undefined {
	if (!pathPattern) {
		return undefined
	}

	const normalizedPattern = normalizePath(pathPattern)
	if (!normalizedPattern) {
		return undefined
	}

	const wildcardIndex = normalizedPattern.search(/[\*\{\[]/)
	const path = (wildcardIndex === -1
		? normalizedPattern
		: normalizedPattern.slice(0, wildcardIndex)
	).replace(/\/+$/, '')

	if (!path) {
		return undefined
	}

	return {
		path,
		kind: /\.[^/]+$/.test(path) ? 'file' : 'folder'
	}
}

function isDevflareConfigPath(path: string): boolean {
	return /^devflare\.config\.(ts|js|mts|cts|mjs|cjs)$/.test(basename(path))
}

function isTypeAwarePath(path: string): boolean {
	return /\.(ts|tsx|mts|cts|svelte)$/.test(path) || isDevflareConfigPath(path)
}

function toKebabCase(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
		.toLowerCase()
}

function resolveLanguage(language: string | undefined, displayPath: string | undefined): string {
	const normalizedLanguage = language?.trim().toLowerCase()
	if (normalizedLanguage && languageAliases[normalizedLanguage]) {
		return languageAliases[normalizedLanguage]
	}

	if (displayPath) {
		const extension = displayPath.split('.').pop()?.toLowerCase()
		if (extension && extensionLanguages[extension]) {
			return extensionLanguages[extension]
		}
	}

	return normalizedLanguage ?? 'plain'
}

function resolveLanguageLabel(
	language: string | undefined,
	displayPath: string | undefined,
	resolvedLanguage: string
): string {
	if (language?.trim()) {
		return language.trim().toLowerCase()
	}

	if (displayPath) {
		const extension = displayPath.split('.').pop()?.toLowerCase()
		if (extension) {
			return extension
		}
	}

	return resolvedLanguage
}

function resolveMetaIconClass(pathLike: string | undefined, languageLabel: string): string {
	if (pathLike) {
		const fileIconClass = resolveFileIconClass(pathLike)
		if (fileIconClass !== fileIconClassNames.document) {
			return fileIconClass
		}
	}

	return resolveLanguageIconClass(languageLabel)
}

function resolveLanguageIconClass(languageLabel: string): string {
	switch (languageLabel.trim().toLowerCase()) {
		case 'astro':
			return fileIconClassNames.astro
		case 'bash':
		case 'console':
		case 'powershell':
		case 'ps1':
		case 'shell':
		case 'sh':
		case 'zsh':
			return fileIconClassNames.console
		case 'css':
		case 'less':
		case 'pcss':
		case 'postcss':
		case 'sass':
		case 'scss':
			return fileIconClassNames.css
		case 'html':
		case 'markup':
			return fileIconClassNames.html
		case 'javascript':
		case 'js':
			return fileIconClassNames.javascript
		case 'json':
		case 'jsonc':
			return fileIconClassNames.json
		case 'markdown':
		case 'md':
			return fileIconClassNames.markdown
		case 'mdsvex':
		case 'mdx':
			return fileIconClassNames.mdx
		case 'react':
		case 'jsx':
			return fileIconClassNames.react
		case 'react-ts':
		case 'tsx':
			return fileIconClassNames.reactTs
		case 'svelte':
			return fileIconClassNames.svelte
		case 'toml':
			return fileIconClassNames.toml
		case 'ts':
		case 'typescript':
			return fileIconClassNames.typescript
		case 'xml':
			return fileIconClassNames.xml
		case 'yaml':
		case 'yml':
			return fileIconClassNames.yaml
		default:
			return fileIconClassNames.document
	}
}

function highlightCodeLines(
	code: string,
	language: string,
	filePath: string | undefined
): string[] {
	ensureIntellisenseHook()
	const sourceLines = code.split('\n')
	const linePropertyPaths = isConfigSnippetCode(code) || (filePath ? isDevflareConfigPath(filePath) : false)
		? getConfigLinePropertyPaths(code)
		: []
	const grammar = getGrammar(language)
	if (!grammar || language === 'plain') {
		return sourceLines.map((line, index) => {
			return annotateIntellisenseHtml(escapeHtml(line), {
				filePath,
				language,
				code,
				lineText: line,
				propertyPath: linePropertyPaths[index]
			})
		})
	}

	const tokens = Prism.tokenize(code, grammar)
	const lines = splitTokenStreamIntoLines(tokens)

	return lines.map((line, index) => {
		const tokenStream: TokenStream = line.length > 1 ? line : (line[0] ?? '')
		const renderContext: IntellisenseRenderContext = {
			filePath,
			language,
			code,
			lineText: sourceLines[index] ?? '',
			propertyPath: linePropertyPaths[index]
		}

		activeIntellisenseRenderContext = renderContext

		try {
			const renderedLine = Prism.Token.stringify(tokenStream, language)
			return annotateIntellisenseHtml(renderedLine, renderContext)
		} finally {
			activeIntellisenseRenderContext = undefined
		}
	})
}

function getGrammar(language: string): Grammar | undefined {
	if (language === 'plain') {
		return undefined
	}

	return Prism.languages[language]
}

function splitPlainTextIntoLines(code: string): string[] {
	return code.split('\n').map((line) => escapeHtml(line))
}

function splitTokenStreamIntoLines(stream: Array<string | PrismToken>): Array<Array<string | PrismToken>> {
	const lines: Array<Array<string | PrismToken>> = [[]]
	appendTokenStream(lines, stream)
	return lines
}

function appendTokenStream(
	lines: Array<Array<string | PrismToken>>,
	stream: TokenStream
): void {
	if (Array.isArray(stream)) {
		for (const part of stream) {
			appendTokenStream(lines, part)
		}
		return
	}

	if (typeof stream === 'string') {
		const parts = stream.split('\n')
		for (const [index, part] of parts.entries()) {
			if (part) {
				lines.at(-1)?.push(part)
			}

			if (index < parts.length - 1) {
				lines.push([])
			}
		}
		return
	}

	const nestedLines = splitNestedTokenLines(stream.content)
	for (const [index, nestedLine] of nestedLines.entries()) {
		const nestedContent: TokenStream = nestedLine.length > 1 ? nestedLine : (nestedLine[0] ?? '')
		lines.at(-1)?.push(
			new Prism.Token(stream.type, nestedContent, stream.alias, undefined, stream.greedy)
		)

		if (index < nestedLines.length - 1) {
			lines.push([])
		}
	}
}

function splitNestedTokenLines(stream: TokenStream): Array<Array<string | PrismToken>> {
	const lines: Array<Array<string | PrismToken>> = [[]]
	appendTokenStream(lines, stream)
	return lines
}

function getLineState(
	lineIndex: number,
	focusLines: DocCodeLineRange[] | undefined,
	dimLines: DocCodeLineRange[] | undefined
): LineState {
	if (isLineInRanges(lineIndex, focusLines)) {
		return 'focus'
	}

	if (focusLines?.length) {
		return 'dim'
	}

	if (isLineInRanges(lineIndex, dimLines)) {
		return 'dim'
	}

	return 'normal'
}

function getFirstLine(ranges: DocCodeLineRange[] | undefined): number | undefined {
	if (!ranges?.length) {
		return undefined
	}

	return ranges.reduce<number | undefined>((current, range) => {
		const value = Array.isArray(range) ? range[0] : range
		if (!current) {
			return value
		}

		return Math.min(current, value)
	}, undefined)
}

function isLineInRanges(lineIndex: number, ranges: DocCodeLineRange[] | undefined): boolean {
	if (!ranges?.length) {
		return false
	}

	return ranges.some((range) => {
		if (Array.isArray(range)) {
			return lineIndex >= range[0] && lineIndex <= range[1]
		}

		return lineIndex === range
	})
}

function isTrailingClosureLine(line: string): boolean {
	const trimmed = line.trim()

	if (!trimmed) {
		return false
	}

	return /^[\]\)\}]+[,;\]\)\}]*$/.test(trimmed)
		|| /^<\/[a-z][\w:-]*>$/.test(trimmed)
}

function normalizeStructure(
	entries: DocCodeTreeEntry[] | undefined,
	files: NormalizedCodeFile[],
	activeFile: string
): TreeNodeState[] {
	if (!entries?.length) {
		return []
	}

	const nodes = new Map<string, TreeNodeState>()
	const order: string[] = []
	const filePaths = new Set(files.map((file) => file.path))
	const pathsWithChildren = new Set<string>()
	const referencedPaths = [
		...entries.map((entry) => normalizePath(entry.path)),
		...files
			.map((file) => file.displayPath)
			.filter((path): path is string => Boolean(path))
	]

	for (const referencedPath of referencedPaths) {
		const segments = referencedPath.split('/').filter(Boolean)
		let currentPath = ''

		for (const segment of segments.slice(0, -1)) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment
			pathsWithChildren.add(currentPath)
		}
	}

	const ensureNode = (
		path: string,
		kind: 'file' | 'folder',
		muted: boolean,
		available: boolean
	) => {
		const normalizedPath = normalizePath(path)
		const existing = nodes.get(normalizedPath)
		const nextNode: TreeNodeState = {
			path: normalizedPath,
			kind,
			muted,
			available,
			active: kind === 'file' && normalizedPath === activeFile,
			depth: normalizedPath.split('/').filter(Boolean).length - 1,
			name: basename(normalizedPath),
			iconClass: kind === 'file' ? resolveFileIconClass(normalizedPath) : undefined
		}

		if (existing) {
			nodes.set(normalizedPath, {
				...existing,
				kind,
				muted: existing.muted && muted,
				available: existing.available || available,
				active: existing.active || nextNode.active,
				iconClass: kind === 'file' ? nextNode.iconClass ?? existing.iconClass : existing.iconClass
			})
			return
		}

		order.push(normalizedPath)
		nodes.set(normalizedPath, nextNode)
	}

	for (const entry of entries) {
		const normalizedPath = normalizePath(entry.path)
		const segments = normalizedPath.split('/').filter(Boolean)
		let currentPath = ''

		for (const [index, segment] of segments.entries()) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment
			const isLastSegment = index === segments.length - 1
			const kind = isLastSegment
				? (entry.kind ?? (pathsWithChildren.has(currentPath) ? 'folder' : 'file'))
				: 'folder'
			ensureNode(currentPath, kind, isLastSegment ? Boolean(entry.muted) : false, filePaths.has(currentPath))
		}
	}

	for (const file of files) {
		if (!file.displayPath) {
			continue
		}

		const segments = file.path.split('/').filter(Boolean)
		let currentPath = ''

		for (const [index, segment] of segments.entries()) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment
			ensureNode(currentPath, index === segments.length - 1 ? 'file' : 'folder', false, filePaths.has(currentPath))
		}
	}

	return order.map((path) => nodes.get(path)!).filter(Boolean)
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

function resolveFileIconClass(pathLike: string): string {
	const normalizedPath = normalizePath(pathLike).toLowerCase()
	const fileName = basename(normalizedPath)

	if (/\.d\.(ts|mts|cts)$/.test(normalizedPath)) {
		return fileIconClassNames.typescriptDef
	}

	if (fileName === 'package.json') {
		return fileIconClassNames.nodejs
	}

	if (fileName === 'pnpm-lock.yaml' || fileName === 'package-lock.json' || fileName === 'yarn.lock' || fileName === 'bun.lock' || fileName === 'bun.lockb') {
		return fileIconClassNames.lock
	}

	if (fileName === 'dockerfile') {
		return fileIconClassNames.docker
	}

	if (fileName === '.gitignore' || fileName === '.gitattributes') {
		return fileIconClassNames.git
	}

	if (fileName.startsWith('.env')) {
		return fileIconClassNames.settings
	}

	if (/^vite\.config\./.test(fileName)) {
		return fileIconClassNames.vite
	}

	if (/^wrangler\./.test(fileName)) {
		return fileIconClassNames.wrangler
	}

	if (/^tailwind\.config\./.test(fileName)) {
		return fileIconClassNames.tailwindcss
	}

	if (/^postcss\.config\./.test(fileName)) {
		return fileIconClassNames.css
	}

	if (/^components?\.json$/.test(fileName)) {
		return fileIconClassNames.json
	}

	if (normalizedPath.endsWith('.tsx')) {
		return fileIconClassNames.reactTs
	}

	if (normalizedPath.endsWith('.jsx')) {
		return fileIconClassNames.react
	}

	if (normalizedPath.endsWith('.ts') || normalizedPath.endsWith('.mts') || normalizedPath.endsWith('.cts')) {
		return fileIconClassNames.typescript
	}

	if (normalizedPath.endsWith('.js') || normalizedPath.endsWith('.mjs') || normalizedPath.endsWith('.cjs')) {
		return fileIconClassNames.javascript
	}

	if (normalizedPath.endsWith('.svelte')) {
		return fileIconClassNames.svelte
	}

	if (normalizedPath.endsWith('.astro')) {
		return fileIconClassNames.astro
	}

	if (normalizedPath.endsWith('.json') || normalizedPath.endsWith('.jsonc')) {
		return fileIconClassNames.json
	}

	if (normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml')) {
		return fileIconClassNames.yaml
	}

	if (normalizedPath.endsWith('.md')) {
		return fileIconClassNames.markdown
	}

	if (normalizedPath.endsWith('.mdx') || normalizedPath.endsWith('.mdsvex')) {
		return fileIconClassNames.mdx
	}

	if (normalizedPath.endsWith('.html')) {
		return fileIconClassNames.html
	}

	if (normalizedPath.endsWith('.css') || normalizedPath.endsWith('.scss') || normalizedPath.endsWith('.sass') || normalizedPath.endsWith('.less') || normalizedPath.endsWith('.pcss')) {
		return fileIconClassNames.css
	}

	if (normalizedPath.endsWith('.toml')) {
		return fileIconClassNames.toml
	}

	if (normalizedPath.endsWith('.xml')) {
		return fileIconClassNames.xml
	}

	if (normalizedPath.endsWith('.svg')) {
		return fileIconClassNames.svg
	}

	if (normalizedPath.endsWith('.sh') || normalizedPath.endsWith('.bash') || normalizedPath.endsWith('.zsh') || normalizedPath.endsWith('.ps1')) {
		return fileIconClassNames.console
	}

	return fileIconClassNames.document
}

function basename(path: string): string {
	const normalizedPath = normalizePath(path)
	const segments = normalizedPath.split('/').filter(Boolean)
	return segments.at(-1) ?? normalizedPath
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

function annotateIntellisenseHtml(
	html: string,
	context: IntellisenseRenderContext
): string {
	if (!html || !/[A-Za-z@_-]/.test(html)) {
		return html
	}

	const segments = html.split(/(<[^>]+>)/g)
	let tagDepth = 0

	return segments
		.map((segment) => {
			if (!segment) {
				return segment
			}

			if (segment.startsWith('<')) {
				if (/^<\//.test(segment)) {
					tagDepth = Math.max(0, tagDepth - 1)
					return segment
				}

				if (!/\/>$/.test(segment)) {
					tagDepth += 1
				}

				return segment
			}

			return tagDepth === 0
				? annotateIntellisenseTextSegment(segment, context)
				: segment
		})
		.join('')
}

function annotateIntellisenseTextSegment(
	segment: string,
	context: IntellisenseRenderContext
): string {
	const pattern = /@[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+|--[A-Za-z0-9-]+|[A-Za-z_][A-Za-z0-9_]*|[a-z][a-z0-9-]+(?:\/[a-z0-9._-]+)+/g
	let result = ''
	let lastIndex = 0

	for (const match of segment.matchAll(pattern)) {
		const token = match[0]
		const start = match.index ?? 0
		const end = start + token.length
		const entry = resolveIntellisenseEntry(token, context)

		result += segment.slice(lastIndex, start)

		if (entry) {
			result += `<span class="docs-code-intellisense-token" data-intellisense-id="${escapeHtmlAttribute(entry.id)}">${token}</span>`
		} else {
			result += token
		}

		lastIndex = end
	}

	result += segment.slice(lastIndex)
	return result
}

function escapeHtmlAttribute(value: string): string {
	return escapeHtml(value).replace(/"/g, '&quot;')
}
