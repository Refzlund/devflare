import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLLMDocument, buildStrictLLMDocument } from '../src/lib/docs/llm'

const GENERATED_LLM_FILE_NAMES = ['LLM.md', 'LLM.txt'] as const
type GeneratedLLMFileName = (typeof GENERATED_LLM_FILE_NAMES)[number]

const LLM_SOURCE_MATCHERS = [
	'/src/lib/docs/',
	'/scripts/llm-documents.ts',
	'/scripts/generate-llm-documents.ts'
] as const

export interface GenerateLLMDocumentsResult {
	document: string
	documents: Record<GeneratedLLMFileName, string>
	outputDirs: readonly string[]
	outputFiles: readonly string[]
}

export function getDocumentationStaticDir(): string {
	const scriptDir = dirname(fileURLToPath(import.meta.url))
	return resolve(scriptDir, '../static')
}

export function getGeneratedLLMOutputDirs(): readonly string[] {
	return [getDocumentationStaticDir()]
}

export function shouldRegenerateLLMDocuments(filePath: string): boolean {
	const normalizedFilePath = filePath.replace(/\\/g, '/')

	return LLM_SOURCE_MATCHERS.some((matcher) => normalizedFilePath.includes(matcher))
}

export async function generateLLMDocuments(options: {
	outputDirs?: readonly string[]
} = {}): Promise<GenerateLLMDocumentsResult> {
	const outputDirs = options.outputDirs ?? getGeneratedLLMOutputDirs()
	const documents: Record<GeneratedLLMFileName, string> = {
		'LLM.md': `${buildLLMDocument().trimEnd()}\n`,
		'LLM.txt': `${buildStrictLLMDocument().trimEnd()}\n`
	}

	await Promise.all(
		outputDirs.flatMap((outputDir) => {
			return [
				mkdir(outputDir, { recursive: true }),
				...GENERATED_LLM_FILE_NAMES.map((fileName) => {
					return writeFile(resolve(outputDir, fileName), documents[fileName], 'utf8')
				})
			]
		})
	)

	return {
		document: documents['LLM.md'],
		documents,
		outputDirs,
		outputFiles: GENERATED_LLM_FILE_NAMES
	}
}