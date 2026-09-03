import { copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	generateLLMDocuments,
	getDocumentationStaticDir
} from '../../../apps/documentation/scripts/llm-documents'

const PACKAGE_LLM_FILE_NAME = 'LLM.md'

function getPackageRootDir(): string {
	const scriptDir = dirname(fileURLToPath(import.meta.url))
	return resolve(scriptDir, '..')
}

async function main(): Promise<void> {
	const documentationStaticDir = getDocumentationStaticDir()
	const packageRootDir = getPackageRootDir()
	const packageLlmFile = resolve(packageRootDir, PACKAGE_LLM_FILE_NAME)

	const result = await generateLLMDocuments({
		outputDirs: [documentationStaticDir]
	})

	await copyFile(resolve(documentationStaticDir, PACKAGE_LLM_FILE_NAME), packageLlmFile)

	console.log(
		`Generated ${result.outputFiles.join(', ')} in ${documentationStaticDir} and copied ${PACKAGE_LLM_FILE_NAME} to ${packageLlmFile}.`
	)
}

await main()
