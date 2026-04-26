import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const packageRoot = join(import.meta.dir, '..', '..', '..')
const repoRoot = join(packageRoot, '..', '..')
const thisFile = 'packages/devflare/tests/unit/cli/wrangler-v4-compat.test.ts'

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
		.filter((file) => /\.(?:ts|tsx|js|mjs|cjs|json|jsonc|toml|ya?ml|md|sh)$/.test(file) || /(^|\/)Makefile$/.test(file))
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
			{ name: 'wrangler kv key without mode', regex: /\bwrangler\s+kv\s+key\s+(?:get|put|delete|list)\b(?!.*--(?:local|remote)\b)/ },
			{ name: 'wrangler kv bulk without mode', regex: /\bwrangler\s+kv\s+bulk\s+(?:put|delete)\b(?!.*--(?:local|remote)\b)/ },
			{ name: 'wrangler r2 object without mode', regex: /\bwrangler\s+r2\s+object\s+(?:get|put|delete)\b(?!.*--(?:local|remote)\b)/ }
		])

		expect(findings).toEqual([])
	})

	test('keeps the package Node engine compatible with Wrangler v4', () => {
		const packageJson = JSON.parse(
			readFileSync(join(packageRoot, 'package.json'), 'utf8')
		) as { engines?: Record<string, string> }

		expect(packageJson.engines?.node).toBe('>=20')
	})
})
