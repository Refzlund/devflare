import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * @description Grades the devflare-deploy action's "Build workspace Devflare" step:
 * `.github/actions/devflare-deploy/build-workspace-cli.sh` and the step in
 * `action.yml` that runs it. The step builds devflare before a deploy when the
 * project resolves it to an unbuilt workspace checkout. Every preview deploy failed
 * without it, because the bin runs `dist/cli/index.js` under node and nothing in
 * the job built it.
 */
const actionDir = resolve(import.meta.dir, '../../../../.github/actions/devflare-deploy')
const scriptPath = join(actionDir, 'build-workspace-cli.sh')

/** Each case spawns bash and node (and bun for a build), which can pass 5s on a loaded Windows box. */
const SPAWN_TIMEOUT_MS = 30_000

const temporaryDirectories = new Set<string>()

afterEach(() => {
	for (const directory of temporaryDirectories) {
		rmSync(directory, { recursive: true, force: true })
	}
	temporaryDirectories.clear()
})

/**
 * @description The shapes a resolved devflare package takes: a monorepo workspace
 * checkout (`src/`, maybe `dist/`) and a published install (`dist/` only, or — if
 * broken — nothing).
 */
interface FixtureShape {
	/** The package carries `src/cli/index.ts`, as the workspace checkout does. */
	hasSource: boolean
	/** The package already carries `dist/cli/index.js`. */
	hasDist: boolean
	/**
	 * Whether the exports map has `"./package.json"`. devflare next.0–next.34 do not,
	 * so resolving `devflare/package.json` there throws ERR_PACKAGE_PATH_NOT_EXPORTED.
	 */
	exportsPackageJson?: boolean
	/** The package's `build` script fails after printing a recognisable line. */
	buildFails?: boolean
}

/**
 * @description Writes a project whose `node_modules/devflare` has the given shape.
 * The fake package's `build` script writes `dist/cli/index.js` AND a marker, so a
 * test can tell "built by this step" from "was already there".
 * @returns The project directory to run the script from, and the package directory.
 */
function createProject(shape: FixtureShape): { projectDir: string; packageDir: string } {
	const projectDir = mkdtempSync(join(tmpdir(), 'devflare-deploy-build-'))
	temporaryDirectories.add(projectDir)

	const packageDir = join(projectDir, 'node_modules', 'devflare')
	mkdirSync(packageDir, { recursive: true })
	const exportsMap =
		shape.exportsPackageJson === false
			? { '.': './dist/index.js' }
			: { '.': './dist/index.js', './package.json': './package.json' }
	writeFileSync(
		join(packageDir, 'package.json'),
		JSON.stringify({
			name: 'devflare',
			type: 'module',
			exports: exportsMap,
			scripts: { build: 'bun ./build.ts' }
		})
	)
	writeFileSync(
		join(packageDir, 'build.ts'),
		shape.buildFails
			? ["console.log('BUILD-FIXTURE-FAILED-HERE')", 'process.exit(3)'].join('\n')
			: [
					"import { mkdirSync, writeFileSync } from 'node:fs'",
					"mkdirSync('dist/cli', { recursive: true })",
					"writeFileSync('dist/cli/index.js', 'export {}\\n')",
					"writeFileSync('built-by-step', '')"
				].join('\n')
	)

	if (shape.hasSource) {
		mkdirSync(join(packageDir, 'src', 'cli'), { recursive: true })
		writeFileSync(join(packageDir, 'src', 'cli', 'index.ts'), 'export {}\n')
	}
	if (shape.hasDist) {
		mkdirSync(join(packageDir, 'dist', 'cli'), { recursive: true })
		writeFileSync(join(packageDir, 'dist', 'cli', 'index.js'), 'export {}\n')
	}

	return { projectDir, packageDir }
}

/** @description Runs the action's script from `cwd`, as the composite step does. */
function runScript(cwd: string): { exitCode: number; output: string } {
	const result = Bun.spawnSync(['bash', scriptPath], { cwd, stdout: 'pipe', stderr: 'pipe' })
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`
	}
}

/** One step of a composite action, as `action.yml` declares it. */
interface ActionStep {
	/** The step id later steps read outputs and outcomes through. */
	id?: string
	/** The step's condition. */
	if?: string
	/** The shell the step runs, when it is a `run` step. */
	run?: string
}

/** @description The action's steps, parsed from `action.yml`. */
function readActionSteps(): ActionStep[] {
	const action = Bun.YAML.parse(readFileSync(join(actionDir, 'action.yml'), 'utf8')) as {
		runs: { steps: ActionStep[] }
	}
	return action.runs.steps
}

/**
 * @description Runs the action's real "Build workspace Devflare" step body from
 * `cwd`, with `github.action_path` pointing at the action directory, the way the
 * runner does. Returns what the step wrote to `GITHUB_OUTPUT`.
 */
function runBuildStep(cwd: string): { exitCode: number; githubOutput: string } {
	const step = readActionSteps().find((candidate) => candidate.id === 'build-cli')
	if (!step?.run) {
		throw new Error('action.yml has no `build-cli` run step')
	}
	const outputPath = join(cwd, 'github-output.txt')
	writeFileSync(outputPath, '')
	// biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, not a JS template.
	const body = step.run.replaceAll('${{ github.action_path }}', actionDir.replaceAll('\\', '/'))
	const result = Bun.spawnSync(['bash', '-c', body], {
		cwd,
		env: { ...process.env, GITHUB_OUTPUT: outputPath },
		stdout: 'pipe',
		stderr: 'pipe'
	})
	return { exitCode: result.exitCode, githubOutput: readFileSync(outputPath, 'utf8') }
}

describe('devflare-deploy build-workspace-cli.sh', () => {
	test(
		'builds an unbuilt workspace checkout, so the node-run bin finds dist/cli/index.js',
		() => {
			const { projectDir, packageDir } = createProject({ hasSource: true, hasDist: false })

			const result = runScript(projectDir)

			expect(result.exitCode).toBe(0)
			expect(existsSync(join(packageDir, 'built-by-step'))).toBe(true)
			expect(existsSync(join(packageDir, 'dist', 'cli', 'index.js'))).toBe(true)
		},
		SPAWN_TIMEOUT_MS
	)

	test(
		'leaves a published install alone — it has dist/ and no source',
		() => {
			const { projectDir, packageDir } = createProject({ hasSource: false, hasDist: true })

			const result = runScript(projectDir)

			expect(result.exitCode).toBe(0)
			expect(existsSync(join(packageDir, 'built-by-step'))).toBe(false)
		},
		SPAWN_TIMEOUT_MS
	)

	test(
		'never builds a package with no source, even one with no dist/ either',
		() => {
			// Grades the source check on its own: without it, a missing dist/ alone
			// would send a broken published install into its `build` script.
			const { projectDir, packageDir } = createProject({ hasSource: false, hasDist: false })

			const result = runScript(projectDir)

			expect(result.exitCode).toBe(0)
			expect(existsSync(join(packageDir, 'built-by-step'))).toBe(false)
		},
		SPAWN_TIMEOUT_MS
	)

	test(
		'does not fail a deploy on devflare next.0–next.34, which export no ./package.json',
		() => {
			const { projectDir, packageDir } = createProject({
				hasSource: false,
				hasDist: true,
				exportsPackageJson: false
			})

			const result = runScript(projectDir)

			expect(result.output).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED')
			expect(result.exitCode).toBe(0)
			expect(existsSync(join(packageDir, 'built-by-step'))).toBe(false)
		},
		SPAWN_TIMEOUT_MS
	)

	test(
		'does not rebuild a workspace checkout that is already built',
		() => {
			const { projectDir, packageDir } = createProject({ hasSource: true, hasDist: true })

			const result = runScript(projectDir)

			expect(result.exitCode).toBe(0)
			expect(existsSync(join(packageDir, 'built-by-step'))).toBe(false)
		},
		SPAWN_TIMEOUT_MS
	)

	test(
		'does nothing, and does not fail, where devflare does not resolve at all',
		() => {
			const projectDir = mkdtempSync(join(tmpdir(), 'devflare-deploy-build-'))
			temporaryDirectories.add(projectDir)

			const result = runScript(projectDir)

			expect(result.exitCode).toBe(0)
			expect(result.output).toContain('nothing to build')
		},
		SPAWN_TIMEOUT_MS
	)
})

describe('devflare-deploy action.yml runs the build before the deploy', () => {
	test(
		'its build-cli step runs the script and records exit code and log tail',
		() => {
			const { projectDir, packageDir } = createProject({ hasSource: true, hasDist: false })

			const result = runBuildStep(projectDir)

			expect(result.exitCode).toBe(0)
			expect(existsSync(join(packageDir, 'built-by-step'))).toBe(true)
			expect(result.githubOutput).toContain('exit_code=0\n')
		},
		SPAWN_TIMEOUT_MS
	)

	test(
		'a failed build fails the step and hands its own log tail on as the excerpt',
		() => {
			const { projectDir } = createProject({ hasSource: true, hasDist: false, buildFails: true })

			const result = runBuildStep(projectDir)

			expect(result.exitCode).not.toBe(0)
			expect(result.githubOutput).toMatch(/exit_code=[1-9]/)
			expect(result.githubOutput).toContain('BUILD-FIXTURE-FAILED-HERE')
		},
		SPAWN_TIMEOUT_MS
	)

	test('the deploy step waits on the build step, and finalize reads its outcome and log', () => {
		const steps = readActionSteps()
		const buildIndex = steps.findIndex((step) => step.id === 'build-cli')
		const deployIndex = steps.findIndex((step) => step.id === 'deploy')
		const finalize = steps.find((step) => step.id === 'finalize')

		expect(buildIndex).toBeGreaterThanOrEqual(0)
		expect(buildIndex).toBeLessThan(deployIndex)
		expect(steps[deployIndex].if).toContain("steps.build-cli.outcome == 'success'")
		expect(finalize?.run).toContain("failure_stage='build'")
		expect(finalize?.run).toContain('log_excerpt="$BUILD_LOG_EXCERPT"')
	})
})
