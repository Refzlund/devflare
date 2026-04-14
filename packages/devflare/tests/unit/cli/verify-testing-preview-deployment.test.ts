import { describe, expect, test } from 'bun:test'
import {
	collectTestingPreviewVerificationErrors,
	DEFAULT_EXPECTED_APP_NAME,
	DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
	loadTestingPreviewConfig,
	REQUIRED_MAIN_BINDINGS
} from '../../../../../.github/scripts/verify-testing-preview-deployment'

describe('testing preview deployment verifier', () => {
	test('loads preview config without requiring Cloudflare resource resolution', async () => {
		const config = await loadTestingPreviewConfig('pr-1')

		expect(config.name).toBe('devflare-testing-binding-matrix-pr-1')
		expect(config.vars?.APP_NAME).toBe(DEFAULT_EXPECTED_APP_NAME)
		expect(config.vars?.DEPLOYMENT_CHANNEL).toBe(DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL)
		expect(config.bindings?.hyperdrive?.POSTGRES).toBe('devflare-testing-pr-1')
	})

	test('accepts a preview deployment snapshot with the expected workers and bindings', () => {
		const workerName = 'devflare-testing-binding-matrix-next'

		const errors = collectTestingPreviewVerificationErrors({
			expectedAppName: DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: workerName,
			resolvedWorkerName: workerName,
			resolvedAppName: DEFAULT_EXPECTED_APP_NAME,
			resolvedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			availableWorkers: [workerName],
			versionId: 'version-123',
			bindingsInspected: true,
			bindingNames: [...REQUIRED_MAIN_BINDINGS]
		})

		expect(errors).toEqual([])
	})

	test('reports preview config drift and missing control-plane metadata when binding inspection never ran', () => {
		const errors = collectTestingPreviewVerificationErrors({
			expectedAppName: DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: 'devflare-testing-binding-matrix-pr-1',
			resolvedWorkerName: 'devflare-testing-binding-matrix',
			resolvedAppName: 'testing-binding-matrix',
			resolvedDeploymentChannel: 'development',
			availableWorkers: ['devflare-testing-binding-matrix'],
			versionId: undefined,
			bindingsInspected: false,
			bindingNames: ['SESSIONS', 'AUTH_SERVICE']
		})

		expect(errors).toContain('Resolved preview worker name was "devflare-testing-binding-matrix" instead of "devflare-testing-binding-matrix-pr-1".')
		expect(errors).toContain('Resolved APP_NAME was "testing-binding-matrix" instead of "testing-binding-matrix-preview".')
		expect(errors).toContain('Resolved DEPLOYMENT_CHANNEL was "development" instead of "preview".')
		expect(errors).toContain('Expected deployed preview worker "devflare-testing-binding-matrix-pr-1" was not found in the Cloudflare account.')
		expect(errors).toContain('Could not resolve an active deployment version for "devflare-testing-binding-matrix-pr-1".')
	})

	test('reports missing bindings when a preview Worker version was inspected', () => {
		const errors = collectTestingPreviewVerificationErrors({
			expectedAppName: DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: 'devflare-testing-binding-matrix-pr-1',
			resolvedWorkerName: 'devflare-testing-binding-matrix-pr-1',
			resolvedAppName: DEFAULT_EXPECTED_APP_NAME,
			resolvedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			availableWorkers: ['devflare-testing-binding-matrix-pr-1'],
			versionId: 'version-123',
			bindingsInspected: true,
			bindingNames: ['SESSIONS', 'AUTH_SERVICE']
		})

		expect(errors).toContain('Expected binding "SESSION_ROOM" was missing from the deployed preview Worker version.')
		expect(errors).toContain('Expected binding "POSTGRES" was missing from the deployed preview Worker version.')
	})

	test('does not fail just because preview sidecar workers were skipped', () => {
		const errors = collectTestingPreviewVerificationErrors({
			expectedAppName: DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: 'devflare-testing-binding-matrix-pr-1',
			resolvedWorkerName: 'devflare-testing-binding-matrix-pr-1',
			resolvedAppName: DEFAULT_EXPECTED_APP_NAME,
			resolvedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			availableWorkers: ['devflare-testing-binding-matrix-pr-1'],
			versionId: 'version-456',
			bindingsInspected: true,
			bindingNames: [...REQUIRED_MAIN_BINDINGS]
		})

		expect(errors).toEqual([])
	})

	test('accepts a verified preview version even if worker inventory is briefly stale', () => {
		const errors = collectTestingPreviewVerificationErrors({
			expectedAppName: DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: 'devflare-testing-binding-matrix-pr-1',
			resolvedWorkerName: 'devflare-testing-binding-matrix-pr-1',
			resolvedAppName: DEFAULT_EXPECTED_APP_NAME,
			resolvedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			availableWorkers: [],
			versionId: 'version-789',
			bindingsInspected: true,
			bindingNames: [...REQUIRED_MAIN_BINDINGS]
		})

		expect(errors).toEqual([])
	})

	test('accepts a named preview deploy when Cloudflare withholds preview version metadata', () => {
		const errors = collectTestingPreviewVerificationErrors({
			expectedAppName: DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: 'devflare-testing-binding-matrix-next',
			resolvedWorkerName: 'devflare-testing-binding-matrix-next',
			resolvedAppName: DEFAULT_EXPECTED_APP_NAME,
			resolvedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			previewUrl: 'https://devflare-testing-binding-matrix-next.example.workers.dev',
			availableWorkers: [
				'devflare-testing-auth-service',
				'devflare-testing-binding-matrix',
				'devflare-testing-search-service'
			],
			versionId: undefined,
			bindingsInspected: false,
			bindingNames: []
		})

		expect(errors).toEqual([])
	})
})