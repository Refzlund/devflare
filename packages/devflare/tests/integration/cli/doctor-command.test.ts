import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { clearDependencies } from '../../../src/cli/dependencies'
import { runDoctorCommand } from '../../../src/cli/commands/doctor'
import { createLogger, renderMessages } from '../../helpers/mock-logger'

async function writeProjectFiles(
	projectDir: string,
	packageJson: Record<string, unknown>,
	withViteConfig = false,
	configFileName = 'devflare.config.ts'
): Promise<void> {
	await mkdir(join(projectDir, 'src'), { recursive: true })

	await writeFile(join(projectDir, 'package.json'), JSON.stringify(packageJson, null, 2))
	await writeFile(join(projectDir, 'tsconfig.json'), JSON.stringify({
		compilerOptions: {
			target: 'ESNext',
			module: 'ESNext'
		}
	}, null, 2))
	await writeFile(join(projectDir, configFileName), `
		export default {
			name: 'test-worker'
		}
	`.trim())

	if (withViteConfig) {
		await writeFile(join(projectDir, 'vite.config.ts'), `
			import { defineConfig } from 'vite'

			export default defineConfig({})
		`.trim())
	}
}

describe('runDoctorCommand', () => {
	let projectDir: string

	beforeEach(async () => {
		clearDependencies()
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-doctor-'))
	})

	afterEach(async () => {
		clearDependencies()
		await rm(projectDir, { recursive: true, force: true })
	})

	test('does not warn about missing Vite config for worker-only projects', async () => {
		await writeProjectFiles(projectDir, {
			name: 'worker-only',
			private: true,
			devDependencies: {
				devflare: '^1.0.0'
			}
		})

		const logger = createLogger()
		const result = await runDoctorCommand(
			{ command: 'doctor', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('No vite.config found'))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('vite required but not found'))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('@cloudflare/vite-plugin required but not found'))).toBe(false)
		expect(renderedMessages.some((message) => message.includes('worker-only mode'))).toBe(true)
	})

	test('warns about missing vite.config only when the current package opted into Vite integration', async () => {
		await writeProjectFiles(projectDir, {
			name: 'vite-project',
			private: true,
			devDependencies: {
				devflare: '^1.0.0',
				vite: '^6.0.0',
				'@cloudflare/vite-plugin': '^1.0.0'
			}
		})

		const logger = createLogger()
		const result = await runDoctorCommand(
			{ command: 'doctor', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('No vite.config found'))).toBe(true)
	})

	test('accepts .devflare/wrangler.jsonc as generated config output', async () => {
		await writeProjectFiles(projectDir, {
			name: 'vite-project',
			private: true,
			devDependencies: {
				devflare: '^1.0.0'
			}
		})
		await mkdir(join(projectDir, '.devflare'), { recursive: true })
		await writeFile(join(projectDir, '.devflare', 'wrangler.jsonc'), '{"name":"test-worker"}')

		const logger = createLogger()
		const result = await runDoctorCommand(
			{ command: 'doctor', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('.devflare/wrangler.jsonc'))).toBe(true)
	})

	test('supports --config with alternate supported config filenames', async () => {
		await writeProjectFiles(projectDir, {
			name: 'mts-project',
			private: true,
			devDependencies: {
				devflare: '^1.0.0'
			}
		}, false, 'devflare.config.mts')

		const logger = createLogger()
		const result = await runDoctorCommand(
			{ command: 'doctor', args: [], options: { config: 'devflare.config.mts' } },
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('devflare.config.mts'))).toBe(true)
	})

	test('lists all supported config filenames when none are found', async () => {
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'missing-config-project',
			private: true,
			devDependencies: {
				devflare: '^1.0.0'
			}
		}, null, 2))

		const logger = createLogger()
		const result = await runDoctorCommand(
			{ command: 'doctor', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(1)
		expect(renderedMessages.some((message) => message.includes('devflare.config.ts, devflare.config.mts, devflare.config.js, devflare.config.mjs'))).toBe(true)
	})
})
