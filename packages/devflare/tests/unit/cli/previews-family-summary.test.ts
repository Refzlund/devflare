import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTrackedTempDirectories } from '../../helpers/tracked-temp-directories'
import {
	capturePreviewTestEnvironmentSnapshot,
	createDeploymentRecordFixture,
	createPreviewRecordFixture,
	createPreviewRegistryFetch,
	runTrackedPreviewsCommand,
	restorePreviewTestEnvironmentSnapshot
} from './previews.test-utils'

const originalEnvironment = capturePreviewTestEnvironmentSnapshot()
const temporaryCacheDirectories = createTrackedTempDirectories()

function writeFamilyProject(projectDir: string, cacheDir: string, packageName: string): string {
	const configPath = join(projectDir, 'devflare.config.ts')
	writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
		name: packageName,
		type: 'module'
	}, null, '\t'), 'utf-8')
	writeFileSync(configPath, `
		export default {
			name: 'demo-worker',
			accountId: 'acc_123',
			compatibilityDate: '2025-01-01',
			bindings: {
				services: {
					AUTH_SERVICE: { service: 'demo-auth-service' },
					SEARCH_SERVICE: { service: 'demo-search-service' }
				}
			}
		}
	`, 'utf-8')
	writeFileSync(join(cacheDir, 'preview-command-config.json'), JSON.stringify({
		configs: {
			[configPath]: {
				accountId: 'acc_123',
				name: 'demo-worker',
				mtimeMs: statSync(configPath).mtimeMs
			}
		}
	}), 'utf-8')

	return configPath
}

function expectWorkerFamilyHeading(renderedMessages: string[]): void {
	expect(renderedMessages.some((message) => message.includes('worker family demo-worker'))).toBe(true)
	expect(renderedMessages.some((message) => message.includes('related workers 2'))).toBe(true)
}

afterEach(() => {
	restorePreviewTestEnvironmentSnapshot(originalEnvironment)
	temporaryCacheDirectories.cleanup()
})

describe('previews command', () => {
	test('summarizes preview scopes across related worker families when using local config', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const cacheDir = temporaryCacheDirectories.create('devflare-previews-cli-')
		process.env.DEVFLARE_CACHE_DIR = cacheDir
		const projectDir = mkdtempSync(join(tmpdir(), 'devflare-previews-family-'))
		temporaryCacheDirectories.track(projectDir)
		writeFamilyProject(projectDir, cacheDir, 'demo-worker-family')
		const previewRecords = [
			createPreviewRecordFixture({
				workerName: 'demo-worker',
				versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
				previewUrl: 'https://main-demo-worker.example.workers.dev'
			}),
			createPreviewRecordFixture({
				workerName: 'demo-auth-service-next',
				versionId: '6e9a9570-33c4-4375-b784-e1b34ad01569',
				previewUrl: 'https://demo-auth-service-next.example.workers.dev',
				alias: 'next',
				branchName: 'next',
				source: 'github-action',
				createdAt: '2025-01-03T00:00:00.000Z',
				updatedAt: '2025-01-03T01:00:00.000Z'
			}),
			createPreviewRecordFixture({
				workerName: 'demo-search-service-next',
				versionId: '6f9a9570-33c4-4375-b784-e1b34ad01569',
				previewUrl: 'https://demo-search-service-next.example.workers.dev',
				alias: 'next',
				branchName: 'next',
				source: 'github-action',
				createdAt: '2025-01-03T00:00:00.000Z',
				updatedAt: '2025-01-03T01:00:00.000Z'
			}),
			createPreviewRecordFixture({
				workerName: 'demo-worker-next',
				versionId: '6dba9570-33c4-4375-b784-e1b34ad01569',
				previewUrl: 'https://next-demo-worker.example.workers.dev',
				alias: 'next',
				branchName: 'next',
				source: 'github-action',
				createdAt: '2025-01-03T00:00:00.000Z',
				updatedAt: '2025-01-03T01:00:00.000Z'
			}),
			createPreviewRecordFixture({
				workerName: 'demo-auth-service-pr-1',
				versionId: '7e9a9570-33c4-4375-b784-e1b34ad01569',
				previewUrl: 'https://demo-auth-service-pr-1.example.workers.dev',
				alias: 'pr-1',
				branchName: 'pr-1',
				source: 'github-action',
				createdAt: '2025-01-04T00:00:00.000Z',
				updatedAt: '2025-01-04T01:00:00.000Z'
			}),
			createPreviewRecordFixture({
				workerName: 'demo-search-service-pr-1',
				versionId: '7f9a9570-33c4-4375-b784-e1b34ad01569',
				previewUrl: 'https://demo-search-service-pr-1.example.workers.dev',
				alias: 'pr-1',
				branchName: 'pr-1',
				source: 'github-action',
				createdAt: '2025-01-04T00:00:00.000Z',
				updatedAt: '2025-01-04T01:00:00.000Z'
			})
		]
		const deploymentRecords = [
			createDeploymentRecordFixture({
				id: 'deployment:demo-worker:prod',
				workerName: 'demo-worker',
				deploymentId: 'deploy-demo-worker-prod',
				channel: 'production',
				versionId: '8dba9570-33c4-4375-b784-e1b34ad01569',
				url: 'https://demo-worker.example.workers.dev',
				createdAt: '2025-01-01T10:00:00.000Z',
				updatedAt: '2025-01-01T10:00:00.000Z'
			}),
			createDeploymentRecordFixture({
				id: 'deployment:demo-auth-service:prod',
				workerName: 'demo-auth-service',
				deploymentId: 'deploy-demo-auth-service-prod',
				channel: 'production',
				versionId: '8eba9570-33c4-4375-b784-e1b34ad01569',
				url: 'https://demo-auth-service.example.workers.dev',
				createdAt: '2025-01-01T10:00:00.000Z',
				updatedAt: '2025-01-01T10:00:00.000Z'
			}),
			createDeploymentRecordFixture({
				id: 'deployment:demo-search-service:prod',
				workerName: 'demo-search-service',
				deploymentId: 'deploy-demo-search-service-prod',
				channel: 'production',
				versionId: '8fba9570-33c4-4375-b784-e1b34ad01569',
				url: 'https://demo-search-service.example.workers.dev',
				createdAt: '2025-01-01T10:00:00.000Z',
				updatedAt: '2025-01-01T10:00:00.000Z'
			}),
			createDeploymentRecordFixture({
				id: 'deployment:demo-worker-next:prod',
				workerName: 'demo-worker-next',
				deploymentId: 'deploy-demo-worker-next-prod',
				channel: 'production',
				versionId: '6dba9570-33c4-4375-b784-e1b34ad01569',
				url: 'https://demo-worker-next.example.workers.dev',
				source: 'github-action',
				createdAt: '2025-01-03T01:05:00.000Z',
				updatedAt: '2025-01-03T01:05:00.000Z'
			}),
			createDeploymentRecordFixture({
				id: 'deployment:demo-auth-service-next:prod',
				workerName: 'demo-auth-service-next',
				deploymentId: 'deploy-demo-auth-service-next-prod',
				channel: 'production',
				versionId: '6e9a9570-33c4-4375-b784-e1b34ad01569',
				url: 'https://demo-auth-service-next.example.workers.dev',
				source: 'github-action',
				createdAt: '2025-01-03T01:05:00.000Z',
				updatedAt: '2025-01-03T01:05:00.000Z'
			}),
			createDeploymentRecordFixture({
				id: 'deployment:demo-search-service-next:prod',
				workerName: 'demo-search-service-next',
				deploymentId: 'deploy-demo-search-service-next-prod',
				channel: 'production',
				versionId: '6f9a9570-33c4-4375-b784-e1b34ad01569',
				url: 'https://demo-search-service-next.example.workers.dev',
				source: 'github-action',
				createdAt: '2025-01-03T01:05:00.000Z',
				updatedAt: '2025-01-03T01:05:00.000Z'
			}),
			createDeploymentRecordFixture({
				id: 'deployment:demo-auth-service-pr-1:prod',
				workerName: 'demo-auth-service-pr-1',
				deploymentId: 'deploy-demo-auth-service-pr-1-prod',
				channel: 'production',
				versionId: '7e9a9570-33c4-4375-b784-e1b34ad01569',
				url: 'https://demo-auth-service-pr-1.example.workers.dev',
				source: 'github-action',
				createdAt: '2025-01-04T01:05:00.000Z',
				updatedAt: '2025-01-04T01:05:00.000Z'
			}),
			createDeploymentRecordFixture({
				id: 'deployment:demo-search-service-pr-1:prod',
				workerName: 'demo-search-service-pr-1',
				deploymentId: 'deploy-demo-search-service-pr-1-prod',
				channel: 'production',
				versionId: '7f9a9570-33c4-4375-b784-e1b34ad01569',
				url: 'https://demo-search-service-pr-1.example.workers.dev',
				source: 'github-action',
				createdAt: '2025-01-04T01:05:00.000Z',
				updatedAt: '2025-01-04T01:05:00.000Z'
			})
		]

		globalThis.fetch = mock(createPreviewRegistryFetch({
			previewRecords,
			deploymentRecords
		})) as unknown as typeof fetch

		const { result, renderedMessages } = await runTrackedPreviewsCommand({ cwd: projectDir })

		expect(result.exitCode).toBe(0)
		expectWorkerFamilyHeading(renderedMessages)
		expect(renderedMessages.some((message) => message.includes('Stable workers (3)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Preview scopes (2)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('dedicated workers'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('next'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('pr-1'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('3/3'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('2/3'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('missing primary'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('demo-worker-next.example.workers.dev'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Use --worker <name> to inspect raw registry records'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('┌ worker demo-worker-next'))).toBe(false)
	})

	test('previews list stays read-only and shows guidance when the preview registry is missing', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const cacheDir = temporaryCacheDirectories.create('devflare-previews-cli-')
		process.env.DEVFLARE_CACHE_DIR = cacheDir
		const projectDir = mkdtempSync(join(tmpdir(), 'devflare-previews-missing-registry-'))
		temporaryCacheDirectories.track(projectDir)
		writeFamilyProject(projectDir, cacheDir, 'demo-worker-family-missing-registry')

		globalThis.fetch = mock(createPreviewRegistryFetch({
			databases: [],
			onRequest: (url) => {
				if (url.endsWith('/accounts/acc_123/d1/database')) {
					throw new Error('previews list should not try to create the preview registry')
				}

				return undefined
			}
		})) as unknown as typeof fetch

		const { result, renderedMessages } = await runTrackedPreviewsCommand({ cwd: projectDir })

		expect(result.exitCode).toBe(0)
		expectWorkerFamilyHeading(renderedMessages)
		expect(renderedMessages.some((message) => message.includes('No Devflare preview registry database was found for the resolved account.'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('devflare previews provision'))).toBe(true)
	})
})
