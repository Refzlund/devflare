import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTrackedTempDirectories } from '../../helpers/tracked-temp-directories'
import {
	capturePreviewTestEnvironmentSnapshot,
	jsonResponse,
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
	test('summarizes preview scopes across related worker families from live workers', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const cacheDir = temporaryCacheDirectories.create('devflare-previews-cli-')
		process.env.DEVFLARE_CACHE_DIR = cacheDir
		const projectDir = mkdtempSync(join(tmpdir(), 'devflare-previews-family-'))
		temporaryCacheDirectories.track(projectDir)
		writeFamilyProject(projectDir, cacheDir, 'demo-worker-family')

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.endsWith('/accounts/acc_123/workers/subdomain')) {
				return jsonResponse({ subdomain: 'example-subdomain' })
			}

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse([
					{ id: 'demo-worker', created_on: '2025-01-01T10:00:00.000Z', modified_on: '2025-01-01T10:00:00.000Z' },
					{ id: 'demo-auth-service', created_on: '2025-01-01T10:00:00.000Z', modified_on: '2025-01-01T10:00:00.000Z' },
					{ id: 'demo-search-service', created_on: '2025-01-01T10:00:00.000Z', modified_on: '2025-01-01T10:00:00.000Z' },
					{ id: 'demo-worker-next', created_on: '2025-01-03T00:00:00.000Z', modified_on: '2025-01-03T01:00:00.000Z' },
					{ id: 'demo-auth-service-next', created_on: '2025-01-03T00:00:00.000Z', modified_on: '2025-01-03T01:00:00.000Z' },
					{ id: 'demo-search-service-next', created_on: '2025-01-03T00:00:00.000Z', modified_on: '2025-01-03T01:00:00.000Z' },
					{ id: 'demo-auth-service-pr-1', created_on: '2025-01-04T00:00:00.000Z', modified_on: '2025-01-04T01:00:00.000Z' },
					{ id: 'demo-search-service-pr-1', created_on: '2025-01-04T00:00:00.000Z', modified_on: '2025-01-04T01:00:00.000Z' }
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 8,
					total_count: 8
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

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
		expect(renderedMessages.some((message) => message.includes('demo-worker-next.example-subdomain.workers.dev'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Preview scopes are derived from live worker names'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('┌ worker demo-worker-next'))).toBe(false)
	})

	test('previews list stays registry-free and reports when no dedicated preview scopes exist yet', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const cacheDir = temporaryCacheDirectories.create('devflare-previews-cli-')
		process.env.DEVFLARE_CACHE_DIR = cacheDir
		const projectDir = mkdtempSync(join(tmpdir(), 'devflare-previews-live-only-'))
		temporaryCacheDirectories.track(projectDir)
		writeFamilyProject(projectDir, cacheDir, 'demo-worker-family-live-only')

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				throw new Error('previews list should no longer query the preview registry')
			}

			if (url.endsWith('/accounts/acc_123/workers/subdomain')) {
				return jsonResponse({ subdomain: 'example-subdomain' })
			}

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse([
					{ id: 'demo-worker', created_on: '2025-01-01T10:00:00.000Z', modified_on: '2025-01-01T10:00:00.000Z' },
					{ id: 'demo-auth-service', created_on: '2025-01-01T10:00:00.000Z', modified_on: '2025-01-01T10:00:00.000Z' },
					{ id: 'demo-search-service', created_on: '2025-01-01T10:00:00.000Z', modified_on: '2025-01-01T10:00:00.000Z' }
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 3,
					total_count: 3
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const { result, renderedMessages } = await runTrackedPreviewsCommand({ cwd: projectDir })

		expect(result.exitCode).toBe(0)
		expectWorkerFamilyHeading(renderedMessages)
		expect(renderedMessages.some((message) => message.includes('No dedicated preview scopes found for this worker family.'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('preview registry'))).toBe(false)
	})
})
