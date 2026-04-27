import Prism from 'prismjs'
import type { Grammar, Token as PrismToken, TokenStream } from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import { resolveIntellisenseEntry } from '$lib/intellisense/registry'
import type { IntellisenseRenderContext } from '$lib/intellisense/types'
import { getConfigLinePropertyPaths, isConfigSnippetCode, isDevflareConfigPath } from './config'

let intellisenseHookRegistered = false

let activeIntellisenseRenderContext: IntellisenseRenderContext | undefined

interface PrismWrapEnvironment {
	type: string
	content: string
	classes: string[]
	attributes: Record<string, string>
}

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

export function highlightCodeLines(
	code: string,
	language: string,
	filePath: string | undefined
): string[] {
	ensureIntellisenseHook()
	const sourceLines = code.split('\n')
	const linePropertyPaths =
		isConfigSnippetCode(code) || (filePath ? isDevflareConfigPath(filePath) : false)
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

function splitTokenStreamIntoLines(
	stream: Array<string | PrismToken>
): Array<Array<string | PrismToken>> {
	const lines: Array<Array<string | PrismToken>> = [[]]
	appendTokenStream(lines, stream)
	return lines
}

function appendTokenStream(lines: Array<Array<string | PrismToken>>, stream: TokenStream): void {
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
		lines
			.at(-1)
			?.push(new Prism.Token(stream.type, nestedContent, stream.alias, undefined, stream.greedy))

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

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function annotateIntellisenseHtml(html: string, context: IntellisenseRenderContext): string {
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

			return tagDepth === 0 ? annotateIntellisenseTextSegment(segment, context) : segment
		})
		.join('')
}

function annotateIntellisenseTextSegment(
	segment: string,
	context: IntellisenseRenderContext
): string {
	const pattern =
		/@[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+|--[A-Za-z0-9-]+|[A-Za-z_][A-Za-z0-9_]*|[a-z][a-z0-9-]+(?:\/[a-z0-9._-]+)+/g
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
