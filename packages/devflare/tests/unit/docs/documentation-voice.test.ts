import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface DocumentationFile {
	path: string
	content: string
}

const bannedPhrases = [
	'first-class',
	'one repeatable shape',
	'config, runtime usage, testing, local behavior, and remote boundaries',
	'config, runtime usage, tests, local behavior, preview lifecycle, and boundary notes',
	'copy the config, use the generated',
	'owns the details'
]

function workspacePath(...segments: string[]): string {
	return join(import.meta.dir, '..', '..', '..', '..', '..', ...segments)
}

function documentationRoots(): string[] {
	return [
		workspacePath('apps', 'documentation', 'src', 'lib', 'docs', 'content'),
		workspacePath('apps', 'documentation', 'src', 'routes'),
		workspacePath('apps', 'documentation', 'static', 'LLM.md'),
		workspacePath('apps', 'documentation', 'static', 'LLM.txt'),
		workspacePath('apps', 'documentation', 'README.md'),
		workspacePath('packages', 'devflare', 'README.md'),
		workspacePath('packages', 'devflare', 'LLM.md')
	]
}

function readDocumentationFile(path: string): DocumentationFile {
	return { path, content: readFileSync(path, 'utf8') }
}

function collectDocumentationFiles(root: string): DocumentationFile[] {
	const stats = statSync(root)
	if (stats.isFile()) {
		return [readDocumentationFile(root)]
	}

	const files: DocumentationFile[] = []
	const pending = [root]

	while (pending.length > 0) {
		const current = pending.pop()
		if (current === undefined) {
			break
		}

		for (const entry of readdirSync(current)) {
			const entryPath = join(current, entry)
			const entryStats = statSync(entryPath)

			if (entryStats.isDirectory()) {
				pending.push(entryPath)
				continue
			}

			if (/\.(md|svelte|ts)$/.test(entryPath)) {
				files.push(readDocumentationFile(entryPath))
			}
		}
	}

	return files
}

function readDocumentationFiles(): DocumentationFile[] {
	return documentationRoots()
		.filter((root) => existsSync(root))
		.flatMap((root) => collectDocumentationFiles(root))
}

describe('documentation voice', () => {
	test('avoids generated-sounding stock phrases', () => {
		const files = readDocumentationFiles()
		const matches = files.flatMap((file) =>
			bannedPhrases.flatMap((phrase) =>
				file.content.toLowerCase().includes(phrase)
					? [`${file.path.replace(/\\/g, '/')}: ${phrase}`]
					: []
			)
		)

		expect(matches).toEqual([])
	})
})
