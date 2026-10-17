import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { clearDependencies } from '../../../src/cli/dependencies'
import {
	captureDeployEnvironmentSnapshot,
	cloudflareApiResponse,
	createDeployHarness,
	createWorkerDeployment,
	createWorkerDeploymentsList,
	createWorkerVersionDetail,
	createWorkerVersionsList,
	disableCloudflareAccountResolution,
	enableStrictDeployVerification,
	restoreDeployEnvironmentSnapshot,
	runWorkerOnlyDeploy,
	writeAccountProjectFiles
} from './build-deploy-worker-only.test-utils'

const originalEnvironment = captureDeployEnvironmentSnapshot()

function mockExistingLiveProductionState(): void {
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		const url = String(input)
		if (url.includes('/workers/scripts/worker-build-test/versions?page=1&per_page=100')) {
			return createWorkerVersionsList([
				createWorkerVersionDetail('version-existing', {
					createdOn: '2020-01-01T00:00:00.000Z',
					modifiedOn: '2020-01-01T00:00:00.000Z'
				})
			])
		}

		if (url.includes('/workers/scripts/worker-build-test/versions/version-existing')) {
			return cloudflareApiResponse(createWorkerVersionDetail('version-existing'))
		}

		if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
			return createWorkerDeploymentsList([
				createWorkerDeployment('deployment-existing', 'version-existing', {
					createdOn: '2020-01-01T00:00:00.000Z',
					authorEmail: 'test@example.com'
				})
			])
		}

		throw new Error(`Unexpected Cloudflare request: ${url}`)
	}) as unknown as typeof fetch
}

describe('build/deploy worker-only behavior', () => {
	let projectDir = ''

	beforeEach(async () => {
		clearDependencies()
		disableCloudflareAccountResolution()
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-deploy-worker-production-edge-'))
		await mkdir(join(projectDir, 'src'), { recursive: true })
	})

	afterEach(async () => {
		clearDependencies()
		restoreDeployEnvironmentSnapshot(originalEnvironment)
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('deploy accepts the current active production deployment when Cloudflare only exposes older live state', async () => {
		await writeAccountProjectFiles(projectDir)

		const { logger } = createDeployHarness()
		mockExistingLiveProductionState()
		enableStrictDeployVerification()

		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(0)
		expect(
			logger.messages.some((message) =>
				message.args.join(' ').includes('Version ID: version-existing')
			)
		).toBe(true)
		expect(
			logger.messages.some((message) =>
				message.args.join(' ').includes('Deployment verification note:')
			)
		).toBe(true)
		expect(
			logger.messages.some((message) =>
				message.args.join(' ').includes('Cloudflare kept the existing live version')
			)
		).toBe(true)
		expect(
			logger.messages.some((message) =>
				message.args
					.join(' ')
					.includes(
						'Verified Cloudflare deployment deployment-existing for version version-existing'
					)
			)
		).toBe(true)
	})

	test('deploy fails when a fresh production deployment is required but Cloudflare only exposes the current live deployment', async () => {
		await writeAccountProjectFiles(projectDir)

		const { logger } = createDeployHarness()
		mockExistingLiveProductionState()
		enableStrictDeployVerification({ requireFreshProductionDeployment: true })

		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(1)
		expect(
			logger.messages.some((message) =>
				message.args.join(' ').includes('requires a fresh production deployment')
			)
		).toBe(true)
		expect(
			logger.messages.some((message) =>
				message.args.join(' ').includes('reused live version as a failure')
			)
		).toBe(true)
	})
})
