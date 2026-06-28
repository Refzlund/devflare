// =============================================================================
// CLI Dev Command — Integration Tests
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import { type TestHarness, createMockProcessRunner, createTestHarness } from '../mocks'

/**
 * Note: Dev command requires config loading via c12.
 * These tests verify the mock infrastructure for dev server simulation.
 */
describe('dev command integration', () => {
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

	describe('execa mock - dev server simulation', () => {
		test('simulates vite dev command', async () => {
			harness.execa.onCommand('vite dev', {
				exitCode: 0,
				stdout: 'Dev server at http://localhost:5173',
				stderr: '',
				failed: false,
				killed: false
			})

			const result = await harness.execa.execa('bunx', ['vite', 'dev'], {
				cwd: '/project',
				stdio: 'inherit'
			})

			expect(result.exitCode).toBe(0)
			expect(harness.execa.wasExecuted('vite dev')).toBe(true)
		})

		test('passes port option correctly', async () => {
			let capturedArgs: string[] = []

			harness.execa.on('vite', (cmd, args) => {
				capturedArgs = args
				return { exitCode: 0, stdout: '', stderr: '', failed: false, killed: false }
			})

			await harness.execa.execa('bunx', ['vite', 'dev', '--port', '3000'], {})

			expect(capturedArgs).toContain('--port')
			expect(capturedArgs).toContain('3000')
		})

		test('captures environment variables', async () => {
			let capturedEnv: Record<string, string> | undefined

			harness.execa.on('vite', (cmd, args, options) => {
				capturedEnv = options.env as Record<string, string>
				return { exitCode: 0, stdout: '', stderr: '', failed: false, killed: false }
			})

			await harness.execa.execa('bunx', ['vite', 'dev'], {
				env: { DEVFLARE_DEV: 'true', NODE_ENV: 'development' }
			})

			expect(capturedEnv?.DEVFLARE_DEV).toBe('true')
			expect(capturedEnv?.NODE_ENV).toBe('development')
		})
	})

	describe('error simulation', () => {
		test('simulates dev server crash', async () => {
			harness.execa.onCommand('vite dev', {
				exitCode: 1,
				stdout: '',
				stderr: 'EADDRINUSE: port 5173 is already in use',
				failed: true,
				killed: false
			})

			const result = await harness.execa.execa('bunx', ['vite', 'dev'], {
				stdio: 'inherit'
			})

			expect(result.exitCode).toBe(1)
			expect(result.failed).toBe(true)
		})
	})

	describe('regex matching', () => {
		test('matches with regex pattern', async () => {
			harness.execa.on(/vite.*dev/, () => {
				return { exitCode: 0, stdout: 'matched', stderr: '', failed: false, killed: false }
			})

			const result = await harness.execa.execa('bunx', ['vite', 'dev', '--host'], {})

			expect(result.stdout).toBe('matched')
		})
	})
})
