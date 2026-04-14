import { generateLLMDocuments } from './llm-documents'

async function main(): Promise<void> {
	const result = await generateLLMDocuments()

	console.log(`Generated ${result.outputFiles.join(', ')} in ${result.outputDirs.join(', ')}.`)
}

await main()