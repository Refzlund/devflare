import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { runDeployCommand } from '../../../src/cli/commands/deploy'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import {
	createCliDependencies,
	createLogger,
	createProcessRunner,
	disableCloudflareAccountResolution,
	readGeneratedDeployConfig,
	successResult,
	type ExecInvocation
} from './build-deploy-worker-only.test-utils'

const DEPLOY_ENV_NAME = 'DEVFLARE_TEST_DEPLOY_GEMINI_API_KEY'

async function writeEnvDescriptorProject(projectDir: string): Promise<void> {
	await mkdir(join(projectDir, 'src'), { recursive: true })
	await writeFile(join(projectDir, '.env'), `${DEPLOY_ENV_NAME}=gemini-from-dotenv\n`)
	await writeFile(join(projectDir, 'package.json'), JSON.stringify({
		name: 'worker-deploy-env-test',
		private: true,
		type: 'module',
		devDependencies: {
			devflare: '^1.0.0'
		}
	}, null, '\t'))
	await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'worker-deploy-env-test',
	compatibilityDate: '2026-05-01',
	files: {
		fetch: 'src/fetch.ts'
	},
	vars: {
		GEMINI_API_KEY: {
			__devflareEnvDescriptor: true,
			__state: {
				name: '${DEPLOY_ENV_NAME}',
				optional: false,
				hasDefault: false,
				hasDevDefault: false
			}
		}
	}
}
`.trim())
	await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim())
}

describe('deploy env var descriptors', () => {
	let projectDir = ''
	let previousDeployEnvValue: string | undefined

	beforeEach(async () => {
		clearDependencies()
		disableCloudflareAccountResolution()
		previousDeployEnvValue = process.env[DEPLOY_ENV_NAME]
		delete process.env[DEPLOY_ENV_NAME]
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-deploy-env-vars-'))
	})

	afterEach(async () => {
		clearDependencies()
		if (previousDeployEnvValue === undefined) {
			delete process.env[DEPLOY_ENV_NAME]
		} else {
			process.env[DEPLOY_ENV_NAME] = previousDeployEnvValue
		}
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('deploy --dry-run prints resolved env descriptor values', async () => {
		await writeEnvDescriptorProject(projectDir)
		const logger = createLogger()
		setDependencies(createCliDependencies(createProcessRunner(() => successResult())))

		const result = await runDeployCommand(
			{ command: 'deploy', args: [], options: { prod: true, 'dry-run': true } },
			logger as any,
			{ cwd: projectDir }
		)
		const output = logger.messages.map((message) => message.args.join(' ')).join('\n')

		expect(result.exitCode).toBe(0)
		expect(output).toContain('gemini-from-dotenv')
		expect(output).not.toContain('__devflareEnvDescriptor')
	})

	test('deploy writes resolved env descriptor values to the deploy wrangler config', async () => {
		await writeEnvDescriptorProject(projectDir)
		const executions: ExecInvocation[] = []
		const logger = createLogger()
		setDependencies(createCliDependencies(createProcessRunner(() => successResult(), executions)))

		const result = await runDeployCommand(
			{ command: 'deploy', args: [], options: { prod: true } },
			logger as any,
			{ cwd: projectDir }
		)
		const deployConfig = await readGeneratedDeployConfig(projectDir)

		expect(result.exitCode).toBe(0)
		expect(executions.some(({ args }) => args.includes('deploy'))).toBe(true)
		expect(deployConfig).toContain('gemini-from-dotenv')
		expect(deployConfig).not.toContain('__devflareEnvDescriptor')
	})
})
