// =============================================================================
// CLI Build Command — Integration Tests
// =============================================================================

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
	createTestHarness,
	createParsedArgs,
	createMockProcessRunner,
	type TestHarness
} from '../mocks'
import { setDependencies, clearDependencies } from '../../../src/cli/dependencies'

/**
 * Note: Build command requires config loading via c12, which
 * reads from the real filesystem. These tests focus on the
 * fs/execa interaction patterns after mocking is set up.
 *
 * For full integration, tests would need real project fixtures
 * or c12 mocking.
 */
describe('build command integration', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			cwd: '/project',
			emptyExeca: true
		})

		// Inject mock dependencies
		setDependencies({
			fs: harness.fs.createMock(),
			exec: createMockProcessRunner(harness.execa)
		})
	})

	afterEach(() => {
		harness.reset()
		clearDependencies()
	})

	describe('execa mock verification', () => {
		test('mock correctly tracks vite build execution', async () => {
			harness.execa.onCommand('vite build', {
				exitCode: 0,
				stdout: 'Build successful',
				stderr: '',
				failed: false,
				killed: false
			})

			// Simulate what the build command would do
			await harness.execa.execa('bunx', ['vite', 'build'], {
				cwd: '/project',
				stdio: 'inherit'
			})

			expect(harness.execa.wasExecuted('vite build')).toBe(true)
			expect(harness.execa.executionCount('vite build')).toBe(1)
		})

		test('mock returns configured result', async () => {
			harness.execa.onCommand('vite build', {
				exitCode: 0,
				stdout: 'Build output here',
				stderr: '',
				failed: false,
				killed: false
			})

			const result = await harness.execa.execa('bunx', ['vite', 'build'], {})

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toBe('Build output here')
		})

		test('mock can simulate build failure', async () => {
			harness.execa.onCommand('vite build', {
				exitCode: 1,
				stdout: '',
				stderr: 'Build failed',
				failed: true,
				killed: false
			})

			const result = await harness.execa.execa('bunx', ['vite', 'build'], {
				stdio: 'inherit'
			})

			expect(result.exitCode).toBe(1)
			expect(result.failed).toBe(true)
		})
	})

	describe('mock execution ordering', () => {
		test('tracks execution order correctly', async () => {
			const order: string[] = []

			harness.execa.on('vite build', () => {
				order.push('build')
				return { exitCode: 0, stdout: '', stderr: '', failed: false, killed: false }
			})

			harness.execa.on('wrangler deploy', () => {
				order.push('deploy')
				return { exitCode: 0, stdout: '', stderr: '', failed: false, killed: false }
			})

			await harness.execa.execa('bunx', ['vite', 'build'], {})
			await harness.execa.execa('bunx', ['wrangler', 'deploy'], {})

			expect(order).toEqual(['build', 'deploy'])
		})
	})

	describe('environment variable passing', () => {
		test('options are passed to handlers', async () => {
			let capturedEnv: Record<string, string> | undefined

			harness.execa.on('vite build', (cmd, args, options) => {
				capturedEnv = options.env as Record<string, string>
				return { exitCode: 0, stdout: '', stderr: '', failed: false, killed: false }
			})

			await harness.execa.execa('bunx', ['vite', 'build'], {
				env: { DEVFLARE_BUILD: 'true' }
			})

			expect(capturedEnv?.DEVFLARE_BUILD).toBe('true')
		})
	})
})
