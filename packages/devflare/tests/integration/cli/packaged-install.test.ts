import { afterAll, describe, expect, test } from 'bun:test'
import { access, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { cleanupTempDirs, installBuiltDevflare } from '../helpers/built-devflare.helpers'

const tempDirs: string[] = []
const runtimeDependencyNames = ['consola', 'pathe'] as const

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
})

describe('packaged CLI install smoke', () => {
	test('packaged devflare binary starts without loading the root TypeScript-backed bundle', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-cli-packaged-'))
		tempDirs.push(projectDir)

		await installBuiltDevflare(projectDir, {
			includeBin: true,
			runtimeDependencies: runtimeDependencyNames
		})
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'packaged-cli-smoke',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)

		await access(join(projectDir, 'node_modules', 'devflare', 'dist', 'cli', 'index.js'))

		const cli = Bun.spawn(
			['bun', join(projectDir, 'node_modules', 'devflare', 'bin', 'devflare.js'), 'version'],
			{
				cwd: projectDir,
				stdout: 'pipe',
				stderr: 'pipe'
			}
		)

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
