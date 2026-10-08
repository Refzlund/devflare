import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const packageRoot = join(import.meta.dir, '..', '..', '..')
const repoRoot = join(packageRoot, '..', '..')
const thisFile = 'packages/devflare/tests/unit/cli/wrangler-v4-compat.test.ts'

/** The parts of a package manifest the engine check reads. */
interface PackageManifest {
	/** Runtime dependencies by name; each one's own `engines.node` binds devflare's. */
	dependencies?: Record<string, string>
	/** Declared runtime ranges, of which only `node` is read. */
	engines?: Record<string, string>
}

/** Parses the package manifest at `manifestPath`. */
function readManifest(manifestPath: string): PackageManifest {
	return JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest
}

/**
 * Reads the lowest Node version devflare's own `engines.node` admits, as a
 * semver string. Only the `>=X[.Y[.Z]]` form is accepted: anything else fails
 * here rather than being compared wrongly.
 */
function readOwnNodeFloor(): string {
	const range = readManifest(join(packageRoot, 'package.json')).engines?.node ?? ''
	const match = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range)
	if (!match) throw new Error(`devflare has an engines.node this test cannot read: ${range}`)
	return `${match[1]}.${match[2] ?? 0}.${match[3] ?? 0}`
}

/**
 * Finds the manifest of the installed dependency `name` the way Node resolves
 * a package directory: the nearest `node_modules/<name>` above devflare.
 * → Read from disk rather than through `require.resolve('<name>/package.json')`,
 *   which a package's `exports` map may refuse.
 * @throws when the dependency is not installed at all
 */
function findInstalledManifest(name: string): string {
	for (let dir = packageRoot; ; dir = dirname(dir)) {
		const candidate = join(dir, 'node_modules', name, 'package.json')
		if (existsSync(candidate)) return candidate
		if (dirname(dir) === dir) throw new Error(`${name} is not installed above ${packageRoot}`)
	}
}

interface ScanFinding {
	file: string
	line: number
	text: string
	pattern: string
}

function trackedTextFiles(): string[] {
	const output = execFileSync('git', ['ls-files'], {
		cwd: repoRoot,
		encoding: 'utf8'
	})

	return output
		.split(/\r?\n/)
		.filter(Boolean)
		.filter((file) => file !== thisFile)
		.filter(
			(file) =>
				/\.(?:ts|tsx|js|mjs|cjs|json|jsonc|toml|ya?ml|md|sh)$/.test(file) ||
				/(^|\/)Makefile$/.test(file)
		)
}

function scan(patterns: Array<{ name: string; regex: RegExp }>): ScanFinding[] {
	const findings: ScanFinding[] = []

	for (const file of trackedTextFiles()) {
		const content = readFileSync(join(repoRoot, file), 'utf8')
		const lines = content.split(/\r?\n/)

		for (const [index, text] of lines.entries()) {
			for (const pattern of patterns) {
				if (pattern.regex.test(text)) {
					findings.push({
						file,
						line: index + 1,
						text: text.trim(),
						pattern: pattern.name
					})
				}
				pattern.regex.lastIndex = 0
			}
		}
	}

	return findings
}

describe('Wrangler v4 compatibility audit', () => {
	test('does not use commands or config removed in Wrangler v4', () => {
		const findings = scan([
			{ name: 'wrangler publish', regex: /\bwrangler\s+publish\b/ },
			{ name: 'wrangler generate', regex: /\bwrangler\s+generate\b/ },
			{ name: 'wrangler pages publish', regex: /\bwrangler\s+pages\s+publish\b/ },
			{ name: 'wrangler version', regex: /\bwrangler\s+version\b(?!s)/ },
			{ name: 'getBindingsProxy()', regex: /\bgetBindingsProxy\s*\(/ },
			{ name: 'legacy_assets', regex: /\blegacy_assets\b/ },
			{ name: 'node_compat', regex: /\bnode_compat\b/ },
			{ name: 'usage_model', regex: /\busage_model\b/ },
			{ name: '--legacy-assets', regex: /--legacy-assets\b/ },
			{ name: '--node-compat', regex: /--node-compat\b/ }
		])

		expect(findings).toEqual([])
	})

	test('does not rely on Wrangler v3 remote defaults for KV or R2 object commands', () => {
		const findings = scan([
			{
				name: 'wrangler kv key without mode',
				regex: /\bwrangler\s+kv\s+key\s+(?:get|put|delete|list)\b(?!.*--(?:local|remote)\b)/
			},
			{
				name: 'wrangler kv bulk without mode',
				regex: /\bwrangler\s+kv\s+bulk\s+(?:put|delete)\b(?!.*--(?:local|remote)\b)/
			},
			{
				name: 'wrangler r2 object without mode',
				regex: /\bwrangler\s+r2\s+object\s+(?:get|put|delete)\b(?!.*--(?:local|remote)\b)/
			}
		])

		expect(findings).toEqual([])
	})

	test('declares a Node engine every installed runtime dependency accepts at its floor', () => {
		const ownFloor = readOwnNodeFloor()
		const dependencies = Object.keys(
			readManifest(join(packageRoot, 'package.json')).dependencies ?? {}
		)
		const declared = dependencies.flatMap((name) => {
			const range = readManifest(findInstalledManifest(name)).engines?.node
			return range ? [{ name, range }] : []
		})

		// Premise: the check reads real ranges. An empty list would pass whatever the floor said.
		expect(declared.length).toBeGreaterThan(0)
		expect(declared.filter(({ range }) => !Bun.semver.satisfies(ownFloor, range))).toEqual([])
	})
})
