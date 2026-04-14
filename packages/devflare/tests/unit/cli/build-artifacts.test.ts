import { describe, expect, mock, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	cleanupViteBuildOutputs,
	createDeferredCleanupPath,
	isolateViteBuildOutputPaths,
	removePathWithRetries,
	getViteBuildCleanupTargets
} from '../../../src/cli/commands/build-artifacts'
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
		const access = mock(async () => { })
		const rename = mock(async () => { })
		const rm = mock(async (targetPath: string) => {
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