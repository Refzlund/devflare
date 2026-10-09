// =============================================================================
// Pending changesets — does this push carry anything `changeset version` will release?
// =============================================================================
/*
	publish.yml runs its quality gate, `changeset version` and `changeset publish`
	only when a changeset is pending. In prerelease mode changesets 3 moves every
	changeset it versions into `.changeset/pre/`, so a changeset still sitting in
	`.changeset/` reads as pending.

	→ GOTCHA: changesets 3 treats a private package as ignored, and a changeset
	  naming ONLY private packages is never versioned and never moved. Counted as
	  pending, it re-ran the whole publish gate on every later push, forever.
	  Measured in a scratch copy with @changesets/cli 3.0.3: a private-only
	  changeset stays put; an empty one (`---` `---`) and one naming `devflare`
	  are moved; one naming both a private and a public package fails
	  `changeset version` ("Mixed changesets … are not allowed").
	→ A private-only changeset is therefore reported, not counted. Ignoring it
	  cannot drop a release — changesets would release nothing for it either —
	  while failing the gate on it would block every unrelated release until
	  somebody deleted the file. The workflow prints a warning naming it.
	→ A mixed changeset, or one naming an unknown package, stays counted, so
	  `changeset version` fails the run loudly on it.
*/

import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

/** The bump types a changeset's frontmatter may give a package. */
const BUMP_LINE = /^\s*(["']?)([^"':\s][^"':]*)\1\s*:\s*(major|minor|patch|none)\s*$/

/**
 * @description Whether a file in `.changeset/` is not a changeset at all — the
 * same files `@changesets/read` 1.x skips there.
 */
function isNotAChangeset(fileName: string): boolean {
	return (
		!fileName.endsWith('.md') ||
		fileName.startsWith('.') ||
		/^README\.md$/i.test(fileName) ||
		['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'].includes(fileName)
	)
}

/**
 * @description The package names a changeset's frontmatter bumps.
 * @param content - the changeset file's text
 * @returns the named packages, in the order written; empty for an empty changeset
 */
export function namedPackages(content: string): string[] {
	const lines = content.replace(/\r\n/g, '\n').split('\n')
	if (lines[0]?.trim() !== '---') {
		return []
	}

	const names: string[] = []
	for (const line of lines.slice(1)) {
		if (line.trim() === '---') {
			break
		}
		const match = BUMP_LINE.exec(line)
		if (match) {
			names.push(match[2].trim())
		}
	}
	return names
}

/** What the detection found in `.changeset/`. */
export interface PendingChangesets {
	/** Changesets `changeset version` will consume: the run must version and publish. */
	pending: string[]
	/** Changesets naming only private packages: never consumed, so never pending. */
	privateOnly: string[]
}

/**
 * @description Sorts the files in `.changeset/` into pending changesets and
 * private-only ones.
 * @param files - each file's name and text
 * @param privatePackages - the names of the workspace's private packages
 */
export function classifyChangesets(
	files: Array<{ name: string; content: string }>,
	privatePackages: ReadonlySet<string>
): PendingChangesets {
	const result: PendingChangesets = { pending: [], privateOnly: [] }
	for (const file of files) {
		if (isNotAChangeset(file.name)) {
			continue
		}
		const names = namedPackages(file.content)
		const isPrivateOnly = names.length > 0 && names.every((name) => privatePackages.has(name))
		result[isPrivateOnly ? 'privateOnly' : 'pending'].push(file.name)
	}
	return result
}

/**
 * @description The names of every private workspace package, from the root
 * `package.json`'s `workspaces` patterns.
 * @param repositoryRoot - the directory holding the root package.json
 */
export function readPrivatePackages(repositoryRoot: string): Set<string> {
	const rootManifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
		workspaces?: string[]
	}
	const privatePackages = new Set<string>()
	for (const pattern of rootManifest.workspaces ?? []) {
		const glob = new Bun.Glob(`${pattern}/package.json`)
		for (const manifestPath of glob.scanSync({ cwd: repositoryRoot, onlyFiles: true })) {
			const manifest = JSON.parse(readFileSync(join(repositoryRoot, manifestPath), 'utf8')) as {
				name?: string
				private?: boolean
			}
			if (manifest.name && manifest.private === true) {
				privatePackages.add(manifest.name)
			}
		}
	}
	return privatePackages
}

/** @description Reads `.changeset/` under `repositoryRoot` and classifies it. */
export function detectPendingChangesets(repositoryRoot: string): PendingChangesets {
	const directory = join(repositoryRoot, '.changeset')
	const files = readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => ({
			name: entry.name,
			content: readFileSync(join(directory, entry.name), 'utf8')
		}))
	return classifyChangesets(files, readPrivatePackages(repositoryRoot))
}

if (import.meta.main) {
	const { pending, privateOnly } = detectPendingChangesets(process.cwd())

	for (const name of privateOnly) {
		console.log(
			`::warning file=.changeset/${name}::Changeset names only private packages; changesets never versions it, so it is not counted as pending. Delete it or name a published package.`
		)
	}
	console.log(`Pending (unconsumed) changesets: ${pending.length}`)
	for (const name of pending) {
		console.log(`  - ${name}`)
	}

	const outputPath = process.env.GITHUB_OUTPUT
	if (outputPath) {
		const has = pending.length > 0 ? 'true' : 'false'
		appendFileSync(outputPath, `count=${pending.length}\nhas=${has}\n`)
	}
}
