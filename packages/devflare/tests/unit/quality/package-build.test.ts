import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function workspacePath(...segments: string[]): string {
	return join(import.meta.dir, '..', '..', '..', '..', '..', ...segments)
}

describe('package build hygiene', () => {
	test('cleans ignored dist output before emitting publishable package files', () => {
		const packageJson = JSON.parse(
			readFileSync(workspacePath('packages/devflare/package.json'), 'utf8')
		) as {
			scripts?: Record<string, string>
		}

		expect(packageJson.scripts?.['clean:dist']).toBe('bun ./scripts/clean-dist.ts')
		expect(packageJson.scripts?.build).toStartWith('bun run clean:dist && bun build ')
		expect(existsSync(workspacePath('packages/devflare/scripts/clean-dist.ts'))).toBe(true)
	})
})
