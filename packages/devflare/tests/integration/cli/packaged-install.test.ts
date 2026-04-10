import { afterAll, describe, expect, test } from 'bun:test'
import { access, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
const tempDirs: string[] = []
let buildPromise: Promise<void> | null = null
const runtimeDependencyNames = ['consola', 'pathe'] as const

async function ensurePackageBuilt(): Promise<void> {
	if (!buildPromise) {
		buildPromise = (async () => {
			const build = Bun.spawn(['bun', 'run', 'build'], {
				cwd: packageRoot,
				stdout: 'pipe',
				stderr: 'pipe'
			})

			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(build.stdout).text(),
				new Response(build.stderr).text(),
				build.exited
			])

			if (exitCode !== 0) {
				throw new Error([
					'Package build failed',
					stdout.trim(),
					stderr.trim()
				].filter(Boolean).join('\n\n'))
			}
		})()
	}

	await buildPromise
}

async function installBuiltDevflare(projectDir: string): Promise<void> {
	await ensurePackageBuilt()

	await mkdir(join(projectDir, 'node_modules'), { recursive: true })

	const packagedDevflareDir = join(projectDir, 'node_modules', 'devflare')
	await mkdir(packagedDevflareDir, { recursive: true })
	await cp(join(packageRoot, 'package.json'), join(packagedDevflareDir, 'package.json'))
	await cp(join(packageRoot, 'bin'), join(packagedDevflareDir, 'bin'), { recursive: true })
	await cp(join(packageRoot, 'dist'), join(packagedDevflareDir, 'dist'), { recursive: true })

	for (const dependencyName of runtimeDependencyNames) {
		await cp(
			join(packageRoot, 'node_modules', dependencyName),
			join(projectDir, 'node_modules', dependencyName),
			{ recursive: true, dereference: true }
		)
	}
}

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

describe('packaged CLI install smoke', () => {
	test('packaged devflare binary starts without loading the root TypeScript-backed bundle', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-cli-packaged-'))
		tempDirs.push(projectDir)

		await installBuiltDevflare(projectDir)
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'packaged-cli-smoke',
			private: true,
			type: 'module'
		}, null, 2))

		await access(join(projectDir, 'node_modules', 'devflare', 'dist', 'src', 'cli', 'index.js'))

		const cli = Bun.spawn([
			'bun',
			join(projectDir, 'node_modules', 'devflare', 'bin', 'devflare.js'),
			'version'
		], {
			cwd: projectDir,
			stdout: 'pipe',
			stderr: 'pipe'
		})

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(cli.stdout).text(),
			new Response(cli.stderr).text(),
			cli.exited
		])

		expect(exitCode).toBe(0)
		expect(stdout).toContain('devflare v')
		expect(stderr.trim()).toBe('')
	})
})