// =============================================================================
// CLI Deploy Command — Integration Tests
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { clearDependencies, setDependencies } from '../../../src/cli/dependencies'
import {
	type TestHarness,
	createMockProcessRunner,
	createParsedArgs,
	createTestHarness
} from '../mocks'

/**
 * Note: Deploy command requires config loading via c12.
 * These tests verify the mock infrastructure works correctly
 * for execa subprocess simulation.
 */
describe('deploy command integration', () => {
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

	describe('execa mock - deploy workflow simulation', () => {
		test('simulates build then deploy sequence', async () => {
			const order: string[] = []

			harness.execa.on('vite build', () => {
				order.push('build')
				return { exitCode: 0, stdout: '', stderr: '', failed: false, killed: false }
			})

			harness.execa.on('wrangler deploy', () => {
				order.push('deploy')
				return { exitCode: 0, stdout: 'Deployed!', stderr: '', failed: false, killed: false }
			})

			// Simulate deploy workflow
			await harness.execa.execa('bunx', ['vite', 'build'], { cwd: '/project' })
			await harness.execa.execa('bunx', ['wrangler', 'deploy'], { cwd: '/project' })

			expect(order).toEqual(['build', 'deploy'])
			expect(harness.execa.wasExecuted('vite build')).toBe(true)
			expect(harness.execa.wasExecuted('wrangler deploy')).toBe(true)
		})

		test('stops at build failure', async () => {
			const order: string[] = []

			harness.execa.on('vite build', () => {
				order.push('build')
				return { exitCode: 1, stdout: '', stderr: 'Build failed', failed: true, killed: false }
			})

			harness.execa.on('wrangler deploy', () => {
				order.push('deploy')
				return { exitCode: 0, stdout: '', stderr: '', failed: false, killed: false }
			})

			// Simulate: build fails, so don't deploy
			const buildResult = await harness.execa.execa('bunx', ['vite', 'build'], {
				stdio: 'inherit'
			})

			if (buildResult.exitCode !== 0) {
				// Don't deploy
			} else {
				await harness.execa.execa('bunx', ['wrangler', 'deploy'], {})
			}

			expect(order).toEqual(['build'])
			expect(harness.execa.wasExecuted('wrangler deploy')).toBe(false)
		})
	})

	describe('environment handling', () => {
		test('passes environment to wrangler', async () => {
			let capturedArgs: string[] = []

			harness.execa.on('wrangler', (cmd, args) => {
				capturedArgs = args
				return { exitCode: 0, stdout: '', stderr: '', failed: false, killed: false }
			})

			await harness.execa.execa('bunx', ['wrangler', 'deploy', '--env', 'production'], {})

			expect(capturedArgs).toContain('--env')
			expect(capturedArgs).toContain('production')
		})
	})

	describe('execution tracking', () => {
		test('counts executions correctly', async () => {
			harness.execa.onCommand('vite', {
				exitCode: 0,
				stdout: '',
				stderr: '',
				failed: false,
				killed: false
			})

			await harness.execa.execa('bunx', ['vite', 'build'], {})
			await harness.execa.execa('bunx', ['vite', 'build'], {})

			expect(harness.execa.executionCount('vite')).toBe(2)
		})

		test('clears executions on reset', async () => {
			harness.execa.onCommand('test', {
				exitCode: 0,
				stdout: '',
				stderr: '',
				failed: false,
				killed: false
			})

			await harness.execa.execa('test', [], {})
			expect(harness.execa.executions.length).toBe(1)

			harness.execa.clearExecutions()
			expect(harness.execa.executions.length).toBe(0)
		})
	})
})
