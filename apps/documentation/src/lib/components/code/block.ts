import type { DocCodeFile, DocCodeSnippet } from '$lib/docs/types'
import { inferSnippetPath } from './block/config'
import { highlightCodeLines } from './block/highlight'
import {
	resolveFileIconClass,
	resolveLanguage,
	resolveLanguageLabel,
	resolveMetaIconClass
} from './block/language'
import { extendFocusLines, getFirstLine, getLineState } from './block/lines'
import { basename, normalizePath } from './block/path'
import {
	normalizeStructure,
	resolveInitialActiveFile,
	resolveStructureEntries
} from './block/structure'
import type { NormalizedCodeFile, NormalizedCodeSnippet } from './block/types'

export type {
	LineState,
	NormalizedCodeFile,
	NormalizedCodeLine,
	NormalizedCodeSnippet,
	TreeNodeState
} from './block/types'

export function normalizeSnippet(snippet: DocCodeSnippet): NormalizedCodeSnippet {
	const files = snippet.files?.length
		? snippet.files.map((file, index) => normalizeFile(file, snippet, index))
		: [normalizeSingleFileSnippet(snippet)]
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

function normalizeSingleFileSnippet(snippet: DocCodeSnippet): NormalizedCodeFile {
	const displayPath = snippet.filename ? normalizePath(snippet.filename) : inferSnippetPath(snippet)
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
	const languageLabel = resolveLanguageLabel(
		file.language ?? snippet.language,
		displayPath,
		language
	)
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
