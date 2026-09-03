import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_EDITABLE_SOURCE_LINES = 1000

const ignoredEditableSourcePaths = [
	/(^|\/)(?:node_modules|dist|coverage|\.svelte-kit|\.wrangler)(?:\/|$)/,
	/(^|\/)(?:generated|__generated__)(?:\/|$)/,
	/\.generated\.(?:ts|svelte)$/
]

function workspacePath(...segments: string[]): string {
	return join(import.meta.dir, '..', '..', '..', '..', '..', ...segments)
}

function trackedSourceFiles(): string[] {
	const result = spawnSync(
		'git',
		['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.ts', '*.svelte'],
		{
			cwd: workspacePath(),
			encoding: 'buffer'
		}
	)

	expect(result.status, result.stderr.toString('utf8')).toBe(0)

	return result.stdout
		.toString('utf8')
		.split('\0')
		.filter(Boolean)
		.filter((path) => !ignoredEditableSourcePaths.some((pattern) => pattern.test(path)))
}

function lineCount(path: string): number {
	return readFileSync(workspacePath(path), 'utf8').split(/\r\n|\n|\r/).length
}

describe('source file size', () => {
	test('tracked TypeScript and Svelte source files stay below the reviewable size ceiling', () => {
		const oversizedFiles = trackedSourceFiles()
			.map((path) => ({ path, lines: lineCount(path) }))
			.filter(({ lines }) => lines > MAX_EDITABLE_SOURCE_LINES)
			.sort((a, b) => b.lines - a.lines)

		expect(oversizedFiles).toEqual([])
	})
})
