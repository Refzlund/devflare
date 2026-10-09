import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
	classifyChangesets,
	namedPackages,
	readPrivatePackages
} from '../../../../../.github/scripts/pending-changesets'

/**
 * @description Grades `.github/scripts/pending-changesets.ts`, which decides
 * whether publish.yml versions and publishes. The expected sorting is what
 * @changesets/cli 3.0.3 was measured to do in a scratch copy: it moves an
 * empty or a public changeset into `.changeset/pre/` and never touches one
 * naming only private packages.
 */
const repositoryRoot = resolve(import.meta.dir, '../../../../..')
const scriptPath = join(repositoryRoot, '.github/scripts/pending-changesets.ts')
const privatePackages = new Set(['documentation', 'testing'])

const temporaryDirectories = new Set<string>()

afterEach(() => {
	for (const directory of temporaryDirectories) {
		rmSync(directory, { recursive: true, force: true })
	}
	temporaryDirectories.clear()
})

/** @description Writes `files` under a fresh directory, creating parents. */
function writeTree(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), 'devflare-pending-changesets-'))
	temporaryDirectories.add(root)
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), content)
	}
	return root
}

describe('pending-changesets', () => {
	test('reads the packages a changeset names, in any quoting', () => {
		expect(
			namedPackages('---\n"devflare": patch\n\'documentation\': minor\nbare: major\n---\n\nx')
		).toEqual(['devflare', 'documentation', 'bare'])
		expect(namedPackages('---\r\n"@scope/pkg": none\r\n---\r\n')).toEqual(['@scope/pkg'])
		expect(namedPackages('---\n---\n\nEmpty.')).toEqual([])
	})

	test('counts a changeset naming only private packages as never pending', () => {
		const result = classifyChangesets(
			[
				{ name: 'docs-only.md', content: '---\n"documentation": patch\n---\n\nDocs.' },
				{ name: 'two-private.md', content: '---\n"documentation": patch\n"testing": patch\n---\n' }
			],
			privatePackages
		)

		expect(result).toEqual({ pending: [], privateOnly: ['docs-only.md', 'two-private.md'] })
	})

	test('counts what changesets consumes, and what it fails on, as pending', () => {
		const result = classifyChangesets(
			[
				{ name: 'public.md', content: '---\n"devflare": patch\n---\n\nFix.' },
				{ name: 'empty.md', content: '---\n---\n\nNothing to bump.' },
				// changesets refuses a mixed changeset; pending, it fails the run loudly.
				{ name: 'mixed.md', content: '---\n"devflare": patch\n"documentation": patch\n---\n' },
				{ name: 'unknown.md', content: '---\n"no-such-package": patch\n---\n' },
				{ name: 'README.md', content: '# Changesets' },
				{ name: 'config.json', content: '{}' }
			],
			privatePackages
		)

		expect(result).toEqual({
			pending: ['public.md', 'empty.md', 'mixed.md', 'unknown.md'],
			privateOnly: []
		})
	})

	test("finds this repository's private packages from its workspace patterns", () => {
		const found = readPrivatePackages(repositoryRoot)

		expect(found.has('documentation')).toBe(true)
		expect(found.has('devflare')).toBe(false)
	})

	test('the workflow entrypoint writes has=false and a warning for a private-only changeset', () => {
		const root = writeTree({
			'package.json': JSON.stringify({ workspaces: ['apps/*', 'packages/*'] }),
			'apps/docs/package.json': JSON.stringify({ name: 'documentation', private: true }),
			'packages/devflare/package.json': JSON.stringify({ name: 'devflare' }),
			'.changeset/README.md': '# Changesets',
			'.changeset/docs-only.md': '---\n"documentation": patch\n---\n\nDocs.',
			'.changeset/pre/already-versioned.md': '---\n"devflare": patch\n---\n',
			'github-output.txt': ''
		})
		const outputPath = join(root, 'github-output.txt')

		const run = Bun.spawnSync([process.execPath, scriptPath], {
			cwd: root,
			env: { ...process.env, GITHUB_OUTPUT: outputPath },
			stdout: 'pipe',
			stderr: 'pipe'
		})

		expect(run.exitCode).toBe(0)
		expect(readFileSync(outputPath, 'utf8')).toBe('count=0\nhas=false\n')
		expect(run.stdout.toString()).toContain('::warning file=.changeset/docs-only.md::')
	})

	test('the workflow entrypoint writes has=true for a public changeset', () => {
		const root = writeTree({
			'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
			'packages/devflare/package.json': JSON.stringify({ name: 'devflare' }),
			'.changeset/fix.md': '---\n"devflare": patch\n---\n\nFix.',
			'github-output.txt': ''
		})
		const outputPath = join(root, 'github-output.txt')

		const run = Bun.spawnSync([process.execPath, scriptPath], {
			cwd: root,
			env: { ...process.env, GITHUB_OUTPUT: outputPath },
			stdout: 'pipe',
			stderr: 'pipe'
		})

		expect(run.exitCode).toBe(0)
		expect(readFileSync(outputPath, 'utf8')).toBe('count=1\nhas=true\n')
	})
})
