import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * @description Grades `.github/actions/devflare-deploy/build-workspace-cli.sh`, the
 * step that builds devflare before a deploy when the project resolves it to an
 * unbuilt workspace checkout. Every preview deploy failed without it, because the
 * bin runs `dist/cli/index.js` under node and nothing in the job built it.
 */
const scriptPath = resolve(
	import.meta.dir,
	'../../../../.github/actions/devflare-deploy/build-workspace-cli.sh'
)

const temporaryDirectories = new Set<string>()

afterEach(() => {
	for (const directory of temporaryDirectories) {
		rmSync(directory, { recursive: true, force: true })
	}
	temporaryDirectories.clear()
})

/**
 * @description The two shapes a resolved devflare package takes: a monorepo
 * workspace checkout (`src/`, maybe `dist/`) and a published install (`dist/` only).
 */
interface FixtureShape {
	/** The package carries `src/cli/index.ts`, as the workspace checkout does. */
	hasSource: boolean
	/** The package already carries `dist/cli/index.js`. */
	hasDist: boolean
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
	writeFileSync(
		join(packageDir, 'package.json'),
		JSON.stringify({
			name: 'devflare',
			type: 'module',
			exports: { './package.json': './package.json' },
			scripts: { build: 'bun ./build.ts' }
		})
	)
	writeFileSync(
		join(packageDir, 'build.ts'),
		[
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

describe('devflare-deploy build-workspace-cli.sh', () => {
	test('builds an unbuilt workspace checkout, so the node-run bin finds dist/cli/index.js', () => {
		const { projectDir, packageDir } = createProject({ hasSource: true, hasDist: false })

		const result = runScript(projectDir)

		expect(result.exitCode).toBe(0)
		expect(existsSync(join(packageDir, 'built-by-step'))).toBe(true)
		expect(existsSync(join(packageDir, 'dist', 'cli', 'index.js'))).toBe(true)
	})

	test('leaves a published install alone — it has no source to build from', () => {
		const { projectDir, packageDir } = createProject({ hasSource: false, hasDist: true })

		const result = runScript(projectDir)

		expect(result.exitCode).toBe(0)
		expect(existsSync(join(packageDir, 'built-by-step'))).toBe(false)
	})

	test('does not rebuild a workspace checkout that is already built', () => {
		const { projectDir, packageDir } = createProject({ hasSource: true, hasDist: true })

		const result = runScript(projectDir)

		expect(result.exitCode).toBe(0)
		expect(existsSync(join(packageDir, 'built-by-step'))).toBe(false)
	})

	test('does nothing, and does not fail, where devflare does not resolve at all', () => {
		const projectDir = mkdtempSync(join(tmpdir(), 'devflare-deploy-build-'))
		temporaryDirectories.add(projectDir)

		const result = runScript(projectDir)

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('nothing to build')
	})
})
