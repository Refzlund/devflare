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
		// The JS bundle is built with rolldown, not `bun build`: bun's bundler
		// miscompiles pure re-export barrels (emits `export { x }` with no `from`
		// clause), which broke every ESM entrypoint. tsgo still emits declarations.
		expect(packageJson.scripts?.build).toStartWith(
			'bun run clean:dist && rolldown -c rolldown.config.ts'
		)
		expect(packageJson.scripts?.build).toContain('tsgo --declaration')
		expect(existsSync(workspacePath('packages/devflare/scripts/clean-dist.ts'))).toBe(true)
		expect(existsSync(workspacePath('packages/devflare/rolldown.config.ts'))).toBe(true)
	})
})
