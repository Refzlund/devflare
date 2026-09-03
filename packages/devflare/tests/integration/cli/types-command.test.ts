import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'pathe'
import { runTypesCommand } from '../../../src/cli/commands/types'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import { createLogger } from '../../helpers/mock-logger'
import {
	createCliDependencies,
	createProcessRunner,
	successResult
} from '../../helpers/process-runner'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')

function createUnusedProcessRunner() {
	return createProcessRunner(() => successResult(), [], {
		spawnErrorMessage: 'spawn() should not be called by runTypesCommand in this test'
	})
}

describe('runTypesCommand', () => {
	let projectDir = ''

	beforeEach(async () => {
		clearDependencies()
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-types-command-'))
		await mkdir(join(projectDir, 'auth', 'src'), { recursive: true })
	})

	afterEach(async () => {
		clearDependencies()
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('preserves typed ref() service bindings when the main config is devflare.config.mts', async () => {
		const indexImportPath = pathToFileURL(join(repoRoot, 'src', 'index.ts')).href

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'types-command-mts-test',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)

		await writeFile(
			join(projectDir, 'devflare.config.mts'),
			`
import { defineConfig, ref } from '${indexImportPath}'

const authWorker = ref(() => import('./auth/devflare.config'))

export default defineConfig({
	name: 'gateway-worker',
	compatibilityDate: '2026-03-17',
	bindings: {
		services: {
			AUTH: authWorker.worker('AdminEntrypoint')
		}
	}
})
`.trim()
		)

		await writeFile(
			join(projectDir, 'auth', 'devflare.config.ts'),
			`
import { defineConfig } from '${indexImportPath}'

export default defineConfig({
	name: 'auth-worker',
	compatibilityDate: '2026-03-17'
})
`.trim()
		)

		await writeFile(
			join(projectDir, 'auth', 'src', 'ep.admin.ts'),
			`
export class AdminEntrypoint {}
`.trim()
		)

		await writeFile(
			join(projectDir, 'auth', 'src', 'admin.types.ts'),
			`
export interface AdminEntrypointRpc {
	ping(): Promise<string>
}
`.trim()
		)

		setDependencies(createCliDependencies(createUnusedProcessRunner()))

		const logger = createLogger({ includeLog: false })
		const result = await runTypesCommand(
			{ command: 'types', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)

		const generatedTypes = await readFile(join(projectDir, 'env.d.ts'), 'utf8')
		expect(generatedTypes).toContain(
			"import type { AdminEntrypointRpc } from './auth/src/admin.types'"
		)
		expect(generatedTypes).toContain('AUTH: AdminEntrypointRpc')
		expect(generatedTypes).not.toContain('AUTH: Fetcher')
	})

	test('generates SendEmail env bindings', async () => {
		const indexImportPath = pathToFileURL(join(repoRoot, 'src', 'index.ts')).href

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'types-command-send-email-test',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)

		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
import { defineConfig } from '${indexImportPath}'

export default defineConfig({
	name: 'send-email-worker',
	compatibilityDate: '2026-03-17',
	bindings: {
		sendEmail: {
			EMAIL: {
				destinationAddress: 'admin@example.com',
				allowedSenderAddresses: ['sender@example.com']
			}
		}
	}
})
`.trim()
		)

		setDependencies(createCliDependencies(createUnusedProcessRunner()))

		const logger = createLogger({ includeLog: false })
		const result = await runTypesCommand(
			{ command: 'types', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)

		const generatedTypes = await readFile(join(projectDir, 'env.d.ts'), 'utf8')
		expect(generatedTypes).toContain("import type { SendEmail } from '@cloudflare/workers-types'")
		expect(generatedTypes).toContain('EMAIL: SendEmail')
	})

	test('generates D1 env bindings when databases are configured by name', async () => {
		const indexImportPath = pathToFileURL(join(repoRoot, 'src', 'index.ts')).href

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'types-command-d1-name-test',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)

		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
import { defineConfig } from '${indexImportPath}'

export default defineConfig({
	name: 'named-d1-worker',
	compatibilityDate: '2026-03-17',
	bindings: {
		d1: {
			DB: { name: 'app-db' }
		}
	}
})
`.trim()
		)

		setDependencies(createCliDependencies(createUnusedProcessRunner()))

		const logger = createLogger({ includeLog: false })
		const result = await runTypesCommand(
			{ command: 'types', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)

		const generatedTypes = await readFile(join(projectDir, 'env.d.ts'), 'utf8')
		expect(generatedTypes).toContain("import type { D1Database } from '@cloudflare/workers-types'")
		expect(generatedTypes).toContain('DB: D1Database')
	})

	test('generates Browser env bindings from map syntax', async () => {
		const indexImportPath = pathToFileURL(join(repoRoot, 'src', 'index.ts')).href

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'types-command-browser-test',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)

		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
import { defineConfig } from '${indexImportPath}'

export default defineConfig({
	name: 'browser-worker',
	compatibilityDate: '2026-03-17',
	bindings: {
		browser: {
			TEST_BROWSER: 'browser-resource'
		}
	}
})
`.trim()
		)

		setDependencies(createCliDependencies(createUnusedProcessRunner()))

		const logger = createLogger({ includeLog: false })
		const result = await runTypesCommand(
			{ command: 'types', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)

		const generatedTypes = await readFile(join(projectDir, 'env.d.ts'), 'utf8')
		expect(generatedTypes).toContain("import type { Fetcher } from '@cloudflare/workers-types'")
		expect(generatedTypes).toContain('TEST_BROWSER: Fetcher')
	})

	test('generates a DevflareVars contract inferred from config vars', async () => {
		const configEntryImportPath = pathToFileURL(join(repoRoot, 'src', 'config-entry.ts')).href

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'types-command-vars-test',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)

		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
import { defineConfig, env } from '${configEntryImportPath}'

export default defineConfig({
	name: 'vars-worker',
	compatibilityDate: '2026-05-01',
	vars: {
		mongo: {
			uri: env.MONGOURI,
			database: env.MONGODATABASE,
			retries: env.RETRIES.parse(Number),
			optionalLabel: env.OPTIONAL_LABEL.optional()
		},
		flag: env.FLAG.default('enabled')
	}
})
`.trim()
		)

		setDependencies(createCliDependencies(createUnusedProcessRunner()))

		const logger = createLogger({ includeLog: false })
		const result = await runTypesCommand(
			{ command: 'types', args: [], options: {} },
			logger as any,
			{ cwd: projectDir }
		)

		expect(result.exitCode).toBe(0)

		const generatedTypes = await readFile(join(projectDir, 'env.d.ts'), 'utf8')
		expect(generatedTypes).toContain("import type { InferConfigVars } from 'devflare/config'")
		expect(generatedTypes).toContain(
			"type __DevflareConfigVars = InferConfigVars<Awaited<typeof import('./devflare.config').default>>"
		)
		expect(generatedTypes).toContain('interface DevflareVars extends __DevflareConfigVars {}')
		expect(generatedTypes).toContain('interface DevflareEnv extends __DevflareConfigVars {')
	})
})
