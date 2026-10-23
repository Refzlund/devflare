import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { runDeployCommand } from '../../../src/cli/commands/deploy'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import {
	classifyWranglerUploadExecution,
	createCliDependencies,
	createLogger,
	createProcessRunner,
	disableCloudflareAccountResolution,
	type ExecInvocation,
	readGeneratedDeployConfig,
	recordWranglerUpload,
	successResult,
	type TestLogger
} from './build-deploy-worker-only.test-utils'

const DEPLOY_ENV_NAME = 'DEVFLARE_TEST_DEPLOY_GEMINI_API_KEY'
/** Read only by `env.production.vars`, so nothing but the environment merge can bring it into `vars`. */
const PRODUCTION_ENV_NAME = 'DEVFLARE_TEST_DEPLOY_PRODUCTION_ONLY'
/** Read only by `env.preview.vars`, the environment a `--preview` deploy merges. */
const PREVIEW_ENV_NAME = 'DEVFLARE_TEST_DEPLOY_PREVIEW_ONLY'
/** Set nowhere, and read only by a base var that `env.production.vars` replaces. */
const SHADOWED_ENV_NAME = 'DEVFLARE_TEST_DEPLOY_SHADOWED_BY_ENVIRONMENT'
const TEST_ENV_NAMES = [DEPLOY_ENV_NAME, PRODUCTION_ENV_NAME, PREVIEW_ENV_NAME, SHADOWED_ENV_NAME]

/**
 * The object an `env.<name>` call evaluates to, written out because the temp project cannot import devflare.
 *
 * @param name - The environment variable the descriptor reads.
 * @returns Config source for a required descriptor of `name`.
 */
function descriptorSource(name: string): string {
	return `{
		__devflareEnvDescriptor: true,
		__state: { name: '${name}', optional: false, hasDefault: false, hasDevDefault: false }
	}`
}

/**
 * Write a worker-only project around the given config members.
 *
 * @param projectDir - The temp project root.
 * @param options.dotenv - The contents of the project's `.env`.
 * @param options.configMembers - Config source placed after `files`, such as a `vars` and an `env` member.
 */
async function writeWorkerProject(
	projectDir: string,
	options: { dotenv: string; configMembers: string }
): Promise<void> {
	await mkdir(join(projectDir, 'src'), { recursive: true })
	await writeFile(join(projectDir, '.env'), options.dotenv)
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify(
			{
				name: 'worker-deploy-env-test',
				private: true,
				type: 'module',
				devDependencies: {
					devflare: '^1.0.0'
				}
			},
			null,
			'\t'
		)
	)
	await writeFile(
		join(projectDir, 'devflare.config.ts'),
		`
export default {
	name: 'worker-deploy-env-test',
	compatibilityDate: '2026-05-01',
	files: {
		fetch: 'src/fetch.ts'
	},
	${options.configMembers}
}
`.trim()
	)
	await writeFile(
		join(projectDir, 'src', 'fetch.ts'),
		`
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
`.trim()
	)
}

async function writeEnvDescriptorProject(projectDir: string): Promise<void> {
	await writeWorkerProject(projectDir, {
		dotenv: `${DEPLOY_ENV_NAME}=gemini-from-dotenv\n`,
		configMembers: `vars: { GEMINI_API_KEY: ${descriptorSource(DEPLOY_ENV_NAME)} }`
	})
}

/**
 * A project whose only descriptors sit in `env.<name>.vars`: the base declares no vars at all, so a
 * deploy that resolves `vars` before the environment merge has nothing to resolve.
 */
async function writeEnvironmentOnlyDescriptorProject(projectDir: string): Promise<void> {
	await writeWorkerProject(projectDir, {
		dotenv: `${PRODUCTION_ENV_NAME}=production-value\n${PREVIEW_ENV_NAME}=preview-value\n`,
		configMembers: `env: {
		production: { vars: { ENVIRONMENT_ONLY: ${descriptorSource(PRODUCTION_ENV_NAME)} } },
		preview: { vars: { ENVIRONMENT_ONLY: ${descriptorSource(PREVIEW_ENV_NAME)} } }
	}`
	})
}

/**
 * A project whose base var is a required descriptor of a variable set nowhere, replaced by a literal
 * in `env.production.vars`. It deploys only when descriptors are resolved after the merge, because
 * before it the base descriptor is still there to demand its variable.
 */
async function writeShadowedBaseDescriptorProject(projectDir: string): Promise<void> {
	await writeWorkerProject(projectDir, {
		dotenv: '',
		configMembers: `vars: { SHADOWED: ${descriptorSource(SHADOWED_ENV_NAME)} },
	env: {
		production: { vars: { SHADOWED: 'production-literal' } }
	}`
	})
}

/**
 * Stand in for Wrangler, recording each upload the way a real run does so devflare reports the deploy
 * as successful.
 *
 * @param executions - Receives every command devflare spawns.
 */
function useRecordingWrangler(executions: ExecInvocation[] = []): void {
	setDependencies(
		createCliDependencies(
			createProcessRunner(async (command, args, executionOptions) => {
				const uploadKind = classifyWranglerUploadExecution(command, args)
				if (uploadKind) {
					await recordWranglerUpload(executionOptions, {
						kind: uploadKind,
						workerName: 'deploy-env-vars'
					})
				}

				return successResult()
			}, executions)
		)
	)
}

/** Parse a config devflare generated: a `//` comment header, then JSON. */
function parseGeneratedConfig(text: string): { vars?: Record<string, unknown> } {
	return JSON.parse(text.slice(text.indexOf('{')))
}

/**
 * The `vars` of the config a `deploy --dry-run` printed under a heading.
 *
 * @param logger - The logger the dry run wrote to.
 * @param heading - Text of the line the config follows. A dry run prints its build view under "Would
 * deploy with wrangler config:", then a resolved view under "Resolved view". With no credentials it
 * prints the resolved view only for a config that has no resources to look up, as these fixtures do.
 * @throws When the dry run printed no config after `heading`.
 */
function readDryRunVars(logger: TestLogger, heading: string): Record<string, unknown> | undefined {
	const lines = logger.messages.map((message) => message.args.join(' '))
	const headingIndex = lines.findIndex((line) => line.includes(heading))
	const printedConfig = headingIndex >= 0 ? lines[headingIndex + 1] : undefined
	if (!printedConfig) {
		throw new Error(`The dry run printed no config after "${heading}":\n${lines.join('\n')}`)
	}

	return parseGeneratedConfig(printedConfig).vars
}

/**
 * Run `deploy --dry-run` and then a real deploy with the same target flags, and read the `vars` each
 * one produced.
 *
 * @param projectDir - The project to deploy.
 * @param targetOptions - The target flags both runs share, such as `{ prod: true }`.
 * @returns Each run's exit code and `vars`: the dry run's from both views it printed, and the deploy's
 * from the `.devflare/deploy/wrangler.jsonc` it handed to Wrangler. A failed deploy's `vars` are
 * `undefined` rather than read, because the reader falls back to the build artefact a failed deploy
 * leaves behind. Also whether the deploy warned that the artefact it had just built had drifted.
 */
async function deployAfterDryRun(
	projectDir: string,
	targetOptions: Record<string, string | boolean>
) {
	useRecordingWrangler()

	const dryRunLogger = createLogger()
	const dryRun = await runDeployCommand(
		{ command: 'deploy', args: [], options: { ...targetOptions, 'dry-run': true } },
		dryRunLogger as any,
		{ cwd: projectDir }
	)
	const deployLogger = createLogger()
	const deploy = await runDeployCommand(
		{ command: 'deploy', args: [], options: targetOptions },
		deployLogger as any,
		{ cwd: projectDir }
	)

	return {
		dryRunExitCode: dryRun.exitCode,
		dryRunVars: readDryRunVars(dryRunLogger, 'Would deploy with wrangler config:'),
		dryRunResolvedViewVars: readDryRunVars(dryRunLogger, 'Resolved view'),
		deployExitCode: deploy.exitCode,
		deployedVars:
			deploy.exitCode === 0
				? parseGeneratedConfig(await readGeneratedDeployConfig(projectDir)).vars
				: undefined,
		deployReportedDrift: deployLogger.messages.some((message) =>
			message.args.join(' ').includes('Build artefact drift detected')
		)
	}
}

describe('deploy env var descriptors', () => {
	let projectDir = ''
	let previousEnvValues: Record<string, string | undefined> = {}

	beforeEach(async () => {
		clearDependencies()
		disableCloudflareAccountResolution()
		previousEnvValues = Object.fromEntries(TEST_ENV_NAMES.map((name) => [name, process.env[name]]))
		for (const name of TEST_ENV_NAMES) {
			delete process.env[name]
		}
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-deploy-env-vars-'))
	})

	afterEach(async () => {
		clearDependencies()
		for (const [name, value] of Object.entries(previousEnvValues)) {
			if (value === undefined) {
				delete process.env[name]
			} else {
				process.env[name] = value
			}
		}
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('deploy --dry-run prints resolved env descriptor values', async () => {
		await writeEnvDescriptorProject(projectDir)
		const logger = createLogger()
		setDependencies(createCliDependencies(createProcessRunner(() => successResult(), [])))

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
		useRecordingWrangler(executions)

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

	test('deploy --prod resolves a descriptor only env.production.vars declares, as its dry run does', async () => {
		await writeEnvironmentOnlyDescriptorProject(projectDir)

		const run = await deployAfterDryRun(projectDir, { prod: true })

		expect(run.dryRunExitCode).toBe(0)
		expect(run.deployExitCode).toBe(0)
		expect(run.deployedVars).toEqual({ ENVIRONMENT_ONLY: 'production-value' })
		expect(run.dryRunVars).toEqual(run.deployedVars)
		expect(run.dryRunResolvedViewVars).toEqual(run.deployedVars)
	})

	test('deploy --preview resolves a descriptor only env.preview.vars declares, as its dry run does', async () => {
		await writeEnvironmentOnlyDescriptorProject(projectDir)

		const run = await deployAfterDryRun(projectDir, { preview: true })

		expect(run.dryRunExitCode).toBe(0)
		expect(run.deployExitCode).toBe(0)
		expect(run.deployedVars).toEqual({ ENVIRONMENT_ONLY: 'preview-value' })
		expect(run.dryRunVars).toEqual(run.deployedVars)
		expect(run.dryRunResolvedViewVars).toEqual(run.deployedVars)
	})

	test('deploy does not demand a base descriptor the environment replaces, as its dry run does not', async () => {
		await writeShadowedBaseDescriptorProject(projectDir)

		const run = await deployAfterDryRun(projectDir, { prod: true })

		expect(run.dryRunExitCode).toBe(0)
		expect(run.deployExitCode).toBe(0)
		expect(run.deployedVars).toEqual({ SHADOWED: 'production-literal' })
		expect(run.dryRunVars).toEqual(run.deployedVars)
		expect(run.dryRunResolvedViewVars).toEqual(run.deployedVars)
	})

	test('deploy reports no drift in the artefact it just built from a config with an env section', async () => {
		await writeEnvironmentOnlyDescriptorProject(projectDir)

		const productionRun = await deployAfterDryRun(projectDir, { prod: true })
		const previewRun = await deployAfterDryRun(projectDir, { preview: true })

		expect(productionRun.deployExitCode).toBe(0)
		expect(productionRun.deployReportedDrift).toBe(false)
		expect(previewRun.deployExitCode).toBe(0)
		expect(previewRun.deployReportedDrift).toBe(false)
	})
})
