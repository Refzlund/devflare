import { describe, expect, test } from 'bun:test'
import {
	collectTestingPreviewVerificationErrors,
	DEFAULT_EXPECTED_APP_NAME,
	DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
	REQUIRED_MAIN_BINDINGS
} from '../../../../../.github/scripts/verify-testing-preview-deployment'

describe('testing preview deployment verifier', () => {
	test('accepts a preview deployment snapshot with the expected workers and bindings', () => {
		const workerName = 'devflare-testing-binding-matrix-next'
		const authServiceName = 'devflare-testing-auth-service-next'
		const searchServiceName = 'devflare-testing-search-service-next'

		const errors = collectTestingPreviewVerificationErrors({
			expectedAppName: DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: workerName,
			resolvedWorkerName: workerName,
			resolvedAppName: DEFAULT_EXPECTED_APP_NAME,
			resolvedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			authServiceName,
			searchServiceName,
			availableWorkers: [workerName, authServiceName, searchServiceName],
			versionId: 'version-123',
			bindingNames: [...REQUIRED_MAIN_BINDINGS]
		})

		expect(errors).toEqual([])
	})

	test('reports preview config drift, missing workers, and missing bindings', () => {
		const errors = collectTestingPreviewVerificationErrors({
			expectedAppName: DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: 'devflare-testing-binding-matrix-pr-1',
			resolvedWorkerName: 'devflare-testing-binding-matrix',
			resolvedAppName: 'testing-binding-matrix',
			resolvedDeploymentChannel: 'development',
			authServiceName: 'devflare-testing-auth-service-pr-1',
			searchServiceName: 'devflare-testing-search-service-pr-1',
			availableWorkers: ['devflare-testing-binding-matrix'],
			versionId: undefined,
			bindingNames: ['SESSIONS', 'AUTH_SERVICE']
		})

		expect(errors).toContain('Resolved preview worker name was "devflare-testing-binding-matrix" instead of "devflare-testing-binding-matrix-pr-1".')
		expect(errors).toContain('Resolved APP_NAME was "testing-binding-matrix" instead of "testing-binding-matrix-preview".')
		expect(errors).toContain('Resolved DEPLOYMENT_CHANNEL was "development" instead of "preview".')
		expect(errors).toContain('Expected deployed preview worker "devflare-testing-binding-matrix-pr-1" was not found in the Cloudflare account.')
		expect(errors).toContain('Expected deployed preview worker "devflare-testing-auth-service-pr-1" was not found in the Cloudflare account.')
		expect(errors).toContain('Expected deployed preview worker "devflare-testing-search-service-pr-1" was not found in the Cloudflare account.')
		expect(errors).toContain('Could not resolve an active deployment version for "devflare-testing-binding-matrix-pr-1".')
		expect(errors).toContain('Expected binding "SESSION_ROOM" was missing from the deployed preview Worker version.')
		expect(errors).toContain('Expected binding "POSTGRES" was missing from the deployed preview Worker version.')
	})
})