import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
	cleanupViteBuildOutputs,
	getViteBuildCleanupTargets
} from '../../../src/cli/commands/build-artifacts'
import type { WranglerConfig } from '../../../src/config/compiler'

function createLogger() {
	return {
		info() {},
		warn() {},
		error() {},
		success() {},
		debug() {},
		log() {}
	}
}

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
})