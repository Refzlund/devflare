import { describe, expect, mock, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	cleanupViteBuildOutputs,
	createDeferredCleanupPath,
	findWorkspaceLocalBinary,
	isolateViteBuildOutputPaths,
	isRunningUnderBun,
	removePathWithRetries,
	resolveLocalViteExecutable,
	getViteBuildCleanupTargets
} from '../../../src/cli/commands/build-artifacts'
import type { FileSystem } from '../../../src/cli/dependencies'
import type { WranglerConfig } from '../../../src/config/compiler'
import { createLogger, renderMessages } from '../../helpers/mock-logger'

describe('build artifact cleanup helpers', () => {
	test('deduplicates worker cleanup when the main entry lives inside assets.directory', () => {
		const cleanupTargets = getViteBuildCleanupTargets('C:/project', {
			name: 'documentation',
			compatibility_date: '2026-04-08',
			main: '.adapter-cloudflare/_worker.js',
			assets: {
				directory: '.adapter-cloudflare',
				binding: 'ASSETS'
			}
		} satisfies WranglerConfig)

		expect(cleanupTargets).toEqual(['C:/project/.adapter-cloudflare'])
	})

	test('removes Vite build outputs before rebuilding', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-build-artifacts-'))
		const outputDir = join(projectDir, '.adapter-cloudflare')
		const workerPath = join(outputDir, '_worker.js')

		try {
			await mkdir(outputDir, { recursive: true })
			await writeFile(workerPath, 'export default {}')

			await cleanupViteBuildOutputs(projectDir, {
				name: 'documentation',
				compatibility_date: '2026-04-08',
				main: '.adapter-cloudflare/_worker.js',
				assets: {
					directory: '.adapter-cloudflare',
					binding: 'ASSETS'
				}
			} satisfies WranglerConfig, createLogger() as never)

			expect(await Bun.file(outputDir).exists()).toBe(false)
			expect(await Bun.file(workerPath).exists()).toBe(false)
		} finally {
			await rm(projectDir, {
				recursive: true,
				force: true
			})
		}
	})

	test('creates stable deferred cleanup paths when moving locked outputs aside', () => {
		expect(
			createDeferredCleanupPath('C:/project/.adapter-cloudflare', 'fixed-suffix')
		).toBe('C:/project/.adapter-cloudflare.devflare-stale-fixed-suffix')
	})

	test('isolates Vite-backed adapter outputs inside .devflare during builds', () => {
		const isolated = isolateViteBuildOutputPaths('C:/project', {
			name: 'documentation',
			compatibility_date: '2026-04-08',
			main: '.adapter-cloudflare/_worker.js',
			assets: {
				directory: '.adapter-cloudflare',
				binding: 'ASSETS'
			}
		} satisfies WranglerConfig)

		expect(isolated.assets?.directory).toBe('.devflare/vite-build-output/.adapter-cloudflare')
		expect(isolated.main).toBe('.devflare/vite-build-output/.adapter-cloudflare/_worker.js')
	})

	test('moves locked Vite outputs aside after repeated retryable cleanup failures', async () => {
		const logger = createLogger()
		const busyError = Object.assign(new Error('busy'), {
			code: 'EBUSY'
		})
		const access = mock(async (_path: string) => { })
		const rename = mock(async (_oldPath: string, _newPath: string) => { })
		const rm = mock(async (targetPath: string, _options: { recursive: boolean; force: boolean }) => {
			if (targetPath.includes('.devflare-stale-')) {
				return
			}

			throw busyError
		})

		await expect(
			removePathWithRetries(
				'C:/project/.adapter-cloudflare',
				logger as never,
				2,
				{
					access,
					rename,
					rm
				}
			)
		).resolves.toBeUndefined()

		expect(rename).toHaveBeenCalledTimes(1)
		expect(rename.mock.calls[0]?.[0]).toBe('C:/project/.adapter-cloudflare')
		expect(String(rename.mock.calls[0]?.[1])).toContain(
			'C:/project/.adapter-cloudflare.devflare-stale-'
		)
		expect(
			renderMessages(logger).some((message) =>
				message.includes('Moved locked build output aside to')
			)
		).toBe(true)
	})

	test('continues without pre-clean when a locked output cannot be moved aside', async () => {
		const logger = createLogger()
		const busyError = Object.assign(new Error('busy'), {
			code: 'EBUSY'
		})
		const access = mock(async () => { })
		const rename = mock(async () => {
			throw busyError
		})
		const rm = mock(async () => {
			throw busyError
		})

		await expect(
			removePathWithRetries(
				'C:/project/.adapter-cloudflare',
				logger as never,
				2,
				{
					access,
					rename,
					rm
				}
			)
		).resolves.toBeUndefined()

		expect(
			renderMessages(logger).some((message) =>
				message.includes('Continuing build without pre-clean for C:/project/.adapter-cloudflare')
			)
		).toBe(true)
	})

	test('rethrows non-retryable cleanup errors', async () => {
		const logger = createLogger()
		const deniedError = Object.assign(new Error('denied'), {
			code: 'EACCES'
		})
		const access = mock(async () => { })
		const rename = mock(async () => { })
		const rm = mock(async () => {
			throw deniedError
		})

		await expect(
			removePathWithRetries(
				'C:/project/.adapter-cloudflare',
				logger as never,
				2,
				{
					access,
					rename,
					rm
				}
			)
		).rejects.toMatchObject({
			code: 'EACCES'
		})
	})
})

describe('vite executable resolution', () => {
	test('isRunningUnderBun is true under the bun:test runtime', () => {
		// This whole test suite runs under Bun. The helper exists precisely so the
		// build pipeline can branch on this — keep it pinned so a future regression
		// to a Node-only check is caught.
		expect(isRunningUnderBun()).toBe(true)
	})

	test('findWorkspaceLocalBinary walks up to find a hoisted node_modules entry', async () => {
		const root = await mkdtemp(join(tmpdir(), 'devflare-vite-resolve-'))
		try {
			const hoistedBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
			await mkdir(join(root, 'node_modules', 'vite', 'bin'), { recursive: true })
			await writeFile(hoistedBin, '#!/usr/bin/env node\n')

			const childCwd = join(root, 'apps', 'portal')
			await mkdir(childCwd, { recursive: true })

			const fs = await import('node:fs/promises')
			const found = await findWorkspaceLocalBinary(childCwd, fs as unknown as FileSystem, [
				'vite',
				'bin',
				'vite.js'
			])

			expect(found).toBe(hoistedBin)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test('findWorkspaceLocalBinary returns null when no workspace match exists', async () => {
		const root = await mkdtemp(join(tmpdir(), 'devflare-vite-resolve-empty-'))
		try {
			const fs = await import('node:fs/promises')
			const found = await findWorkspaceLocalBinary(root, fs as unknown as FileSystem, [
				'vite',
				'bin',
				'vite.js'
			])

			expect(found).toBeNull()
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test('resolveLocalViteExecutable prefers the workspace-local path over a Bun cache realpath', async () => {
		// Regression: under Bun on Windows, `resolvePackageSpecifier('vite/bin/vite.js')` can
		// land on `C:\Users\…\.bun\install\cache\vite@x.y.z@@@1\bin\vite.js`, which breaks
		// Vite 8's resolution of `rolldown` because Node no longer sees the workspace's
		// hoisted node_modules from that physical path.
		const root = await mkdtemp(join(tmpdir(), 'devflare-vite-resolve-prefers-'))
		try {
			const workspaceBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
			await mkdir(join(root, 'node_modules', 'vite', 'bin'), { recursive: true })
			await writeFile(workspaceBin, '#!/usr/bin/env node\n')

			const childCwd = join(root, 'apps', 'portal')
			await mkdir(childCwd, { recursive: true })

			const fs = await import('node:fs/promises')
			const resolved = await resolveLocalViteExecutable(childCwd, fs as unknown as FileSystem)

			expect(resolved).toBe(workspaceBin)
			expect(resolved.includes('.bun')).toBe(false)
			expect(resolved.includes('install/cache')).toBe(false)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test('resolveLocalViteExecutable throws an actionable error when no Vite is installed', async () => {
		const root = await mkdtemp(join(tmpdir(), 'devflare-vite-resolve-missing-'))
		try {
			// Provide a FileSystem whose `access` always fails so neither the workspace
			// walk nor the package-specifier fallback finds anything.
			const fs: Pick<FileSystem, 'access'> = {
				access: async () => {
					throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
				}
			}

			await expect(
				resolveLocalViteExecutable(root, fs as FileSystem)
			).rejects.toThrow(/Could not resolve a local Vite CLI/)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})
})