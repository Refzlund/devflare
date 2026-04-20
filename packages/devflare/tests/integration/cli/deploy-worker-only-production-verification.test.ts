import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
	createWranglerDeployProcessRunner,
	disableCloudflareAccountResolution,
	enableStrictDeployVerification,
	restoreDeployEnvironmentSnapshot,
	runWorkerOnlyDeploy,
	successResult,
	writeAccountProjectFiles,
} from './build-deploy-worker-only.test-utils'

const originalEnvironment = captureDeployEnvironmentSnapshot()

describe('build/deploy worker-only behavior', () => {
	let projectDir = ''

	beforeEach(async () => {
		clearDependencies()
		disableCloudflareAccountResolution()
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-deploy-worker-production-'))
		await mkdir(join(projectDir, 'src'), { recursive: true })
	})

	afterEach(async () => {
		clearDependencies()
		restoreDeployEnvironmentSnapshot(originalEnvironment)
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('deploy verifies production deployments reference the uploaded version when strict verification is enabled', async () => {
		await writeAccountProjectFiles(projectDir)

		const { logger } = createDeployHarness(
			createWranglerDeployProcessRunner({
				stdout: 'Version ID: version-123'
			})
		)

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions/version-123')) {
				return cloudflareApiResponse(createWorkerVersionDetail('version-123'))
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return createWorkerDeploymentsList([
					createWorkerDeployment('deployment-123', 'version-123', {
						createdOn: '2026-04-09T00:00:00Z',
						authorEmail: 'test@example.com'
					})
				])
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		enableStrictDeployVerification()

		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(0)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Verified Cloudflare deployment deployment-123 for version version-123'))).toBe(true)
	})

	test('deploy verifies production deployments when Wrangler only reports the version id through structured output', async () => {
		await writeAccountProjectFiles(projectDir)

		const { logger } = createDeployHarness(
			createWranglerDeployProcessRunner({
				structuredOutput: {
					type: 'deploy',
					version_id: 'version-structured',
					targets: ['https://worker-build-test.example.workers.dev']
				}
			})
		)

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions/version-structured')) {
				return cloudflareApiResponse(createWorkerVersionDetail('version-structured'))
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return createWorkerDeploymentsList([
					createWorkerDeployment('deployment-structured', 'version-structured', {
						createdOn: '2026-04-09T00:00:00Z',
						authorEmail: 'test@example.com'
					})
				])
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		enableStrictDeployVerification()

		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(0)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Version ID: version-structured'))).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Verified Cloudflare deployment deployment-structured for version version-structured'))).toBe(true)
	})

	test('deploy falls back to the latest Cloudflare version when Wrangler omits the production version id', async () => {
		await writeAccountProjectFiles(projectDir)

		const { logger } = createDeployHarness()

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions?page=1&per_page=100')) {
				return createWorkerVersionsList([
					createWorkerVersionDetail('version-from-list', {
						createdOn: new Date().toISOString(),
						modifiedOn: new Date().toISOString()
					})
				])
			}

			if (url.includes('/workers/scripts/worker-build-test/versions/version-from-list')) {
				return cloudflareApiResponse(createWorkerVersionDetail('version-from-list'))
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return createWorkerDeploymentsList([
					createWorkerDeployment('deployment-from-list', 'version-from-list', {
						createdOn: new Date().toISOString(),
						authorEmail: 'test@example.com'
					})
				])
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		enableStrictDeployVerification()

		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(0)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Version ID: version-from-list'))).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Resolved version id from Cloudflare version metadata'))).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Verified Cloudflare deployment deployment-from-list for version version-from-list'))).toBe(true)
	})

	test('deploy falls back to the latest Cloudflare deployment when Wrangler omits the production version id entirely', async () => {
		await writeAccountProjectFiles(projectDir)

		const { logger } = createDeployHarness()

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions/version-from-deployment')) {
				return cloudflareApiResponse(createWorkerVersionDetail('version-from-deployment'))
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return createWorkerDeploymentsList([
					createWorkerDeployment('deployment-fallback', 'version-from-deployment', {
						createdOn: new Date().toISOString(),
						authorEmail: 'test@example.com'
					})
				])
			}

			throw new Error(`Unexpected Cloudflare request: ${url}`)
		}) as unknown as typeof fetch
		enableStrictDeployVerification()

		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(0)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Version ID: version-from-deployment'))).toBe(true)
		expect(logger.messages.some((message) => message.args.join(' ').includes('Verified Cloudflare deployment deployment-fallback for version version-from-deployment'))).toBe(true)
	}, 20000)
})
