import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { join } from 'pathe'
import { runConfigCommand } from '../../../src/cli/commands/config'
import { createLogger } from '../../helpers/mock-logger'

/** The real `ref()`, which a fixture config imports from source. */
const REF_MODULE = pathToFileURL(join(import.meta.dirname, '../../../src/config/ref.ts')).href

describe('runConfigCommand', () => {
	let projectDir: string

	beforeEach(async () => {
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-config-command-'))
		await mkdir(join(projectDir, 'src'), { recursive: true })
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
export default {
	name: 'config-command-worker',
	compatibilityDate: '2025-01-07',
	bindings: {
		d1: {
			DB: { id: 'existing-d1-id' }
		},
		r2: {
			ASSETS: 'assets-bucket'
		}
	}
}
		`.trim()
		)
	})

	afterEach(async () => {
		await rm(projectDir, { recursive: true, force: true })
	})

	test('prints resolved devflare config JSON', async () => {
		const logger = createLogger({ includeLog: false })
		const result = await runConfigCommand(
			{ command: 'config', args: ['print'], options: { json: true } },
			logger as any,
			{ cwd: projectDir, silent: true }
		)

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('config-command-worker')
		expect(result.output).toContain('assets-bucket')
		expect(result.output).toContain('existing-d1-id')
	})

	test('prints resolved wrangler config JSON', async () => {
		const logger = createLogger({ includeLog: false })
		const result = await runConfigCommand(
			{ command: 'config', args: ['print'], options: { format: 'wrangler', json: true } },
			logger as any,
			{ cwd: projectDir, silent: true }
		)

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('d1_databases')
		expect(result.output).toContain('r2_buckets')
		expect(result.output).toContain('existing-d1-id')
	})

	test('prints local wrangler config without Cloudflare account resource resolution', async () => {
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
export default {
	name: 'local-config-worker',
	compatibilityDate: '2025-01-07',
	bindings: {
		d1: {
			DB: { name: 'local-database' }
		}
	}
}
		`.trim()
		)

		const logger = createLogger({ includeLog: false })
		const result = await runConfigCommand(
			{
				command: 'config',
				args: ['print'],
				options: { format: 'wrangler', phase: 'local', json: true }
			},
			logger as any,
			{ cwd: projectDir, silent: true }
		)

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('local-config-worker')
		expect(result.output).toContain('d1_databases')
		expect(result.output).toContain('local-database')
	})

	// A printed binding that carries `__ref` must not serialise the referenced config: that config
	// holds its own refs, which `loadConfig` never resolves, and an unresolved ref's `name` throws.
	test.each([
		['deploy', {}],
		['local', { phase: 'local' }]
	] as const)(
		'prints a ref() binding whose referenced config holds a ref of its own (%s phase)',
		async (_phase, phaseOption) => {
			await mkdir(join(projectDir, 'api'), { recursive: true })
			await mkdir(join(projectDir, 'auth'), { recursive: true })
			await writeFile(
				join(projectDir, 'auth', 'devflare.config.ts'),
				`export default { name: 'auth-worker', compatibilityDate: '2025-01-07' }`
			)
			await writeFile(
				join(projectDir, 'api', 'devflare.config.ts'),
				`
import { ref } from '${REF_MODULE}'
export default {
	name: 'api-worker',
	compatibilityDate: '2025-01-07',
	bindings: { services: { AUTH: ref(() => import('../auth/devflare.config.ts')).worker('AuthEntrypoint') } }
}
		`.trim()
			)
			await writeFile(
				join(projectDir, 'devflare.config.ts'),
				`
import { ref } from '${REF_MODULE}'
export default {
	name: 'gateway-worker',
	compatibilityDate: '2025-01-07',
	bindings: { services: { API: ref(() => import('./api/devflare.config.ts')).worker } }
}
		`.trim()
			)

			const logger = createLogger({ includeLog: false })
			const result = await runConfigCommand(
				{ command: 'config', args: ['print'], options: { ...phaseOption, json: true } },
				logger as unknown as Parameters<typeof runConfigCommand>[1],
				{ cwd: projectDir, silent: true }
			)

			expect(result.exitCode).toBe(0)
			const printed = JSON.parse(result.output ?? '') as {
				bindings: { services: { API: { service: string; __ref?: unknown } } }
			}
			expect(printed.bindings.services.API.service).toBe('api-worker')
			expect(printed.bindings.services.API.__ref).toEqual({
				name: 'api-worker',
				configPath: './api/devflare.config.ts'
			})
		}
	)
})
