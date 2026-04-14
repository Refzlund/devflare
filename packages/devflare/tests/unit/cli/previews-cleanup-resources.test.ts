import { afterEach, describe, expect, mock, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runPreviewsCommand } from '../../../src/cli/commands/previews'
import { createTrackedTempDirectories } from '../../helpers/tracked-temp-directories'
import { createLogger, jsonResponse, renderMessages } from './previews.test-utils'

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN
const originalCacheDir = process.env.DEVFLARE_CACHE_DIR
const temporaryCacheDirectories = createTrackedTempDirectories()

function writeKvCleanupProject(projectDir: string, projectName: string): void {
	const previewScopedValue = `__DEVFLARE_PREVIEW_SCOPE__:${JSON.stringify({ baseName: 'cache-kv', separator: '-' })}`
	writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
		name: projectName,
		type: 'module'
	}, null, '\t'), 'utf-8')
	writeFileSync(join(projectDir, 'devflare.config.ts'), `
		export default {
			name: ${JSON.stringify(projectName)},
			accountId: 'acc_123',
			compatibilityDate: '2026-04-08',
			bindings: {
				kv: {
					CACHE: ${JSON.stringify(previewScopedValue)}
				}
			}
		}
	`, 'utf-8')
}

function writeServiceCleanupProject(projectDir: string): void {
	writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
		name: 'demo-preview-cleanup-apply-order',
		type: 'module'
	}, null, '\t'), 'utf-8')
	writeFileSync(join(projectDir, 'devflare.config.ts'), `
		export default {
			name: 'demo-worker',
			accountId: 'acc_123',
			compatibilityDate: '2026-04-08',
			bindings: {
				services: {
					AUTH_SERVICE: { service: 'demo-auth-service' }
				}
			}
		}
	`, 'utf-8')
}

afterEach(() => {
	globalThis.fetch = originalFetch
	if (originalToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalToken
	}
	if (originalCacheDir === undefined) {
		delete process.env.DEVFLARE_CACHE_DIR
	} else {
		process.env.DEVFLARE_CACHE_DIR = originalCacheDir
	}
	temporaryCacheDirectories.cleanup()
})

describe('previews command', () => {
	test('cleanup warns when it falls back to the default preview scope and finds no matching resources', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const projectDir = temporaryCacheDirectories.create('devflare-previews-cleanup-default-')
		writeKvCleanupProject(projectDir, 'demo-preview-cleanup')

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			if (url.includes('/accounts/acc_123/storage/kv/namespaces?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: ['cleanup'],
				options: {
					account: 'acc_123'
				}
			},
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('preview scope preview (default preview scope)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('No preview-only resources or dedicated preview Worker scripts matched the default "preview" scope'))).toBe(true)
	})

	test('cleanup uses --scope to target named preview resources', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const projectDir = temporaryCacheDirectories.create('devflare-previews-cleanup-scope-')
		writeKvCleanupProject(projectDir, 'demo-preview-cleanup-scope')

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'demo-preview-cleanup-scope-next',
						created_on: '2026-04-08T00:00:00.000Z',
						modified_on: '2026-04-08T00:00:00.000Z'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			if (url.includes('/accounts/acc_123/storage/kv/namespaces?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'kv-next',
						title: 'cache-kv-next'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: ['cleanup'],
				options: {
					account: 'acc_123',
					scope: 'next'
				}
			},
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('preview scope next (--scope)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Preview cleanup dry run complete with 2 candidates across 1 preview scope'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Candidates: Workers 1 · KV 1'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('scope breakdown'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('next') && message.includes('dedicated workers') && message.includes('Workers 1'))).toBe(true)
	})

	test('cleanup uses --all to clean every discovered preview scope', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const projectDir = temporaryCacheDirectories.create('devflare-previews-cleanup-all-')
		writeKvCleanupProject(projectDir, 'demo-preview-cleanup-all')

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'demo-preview-cleanup-all-next',
						created_on: '2026-04-08T00:00:00.000Z',
						modified_on: '2026-04-08T00:00:00.000Z'
					},
					{
						id: 'demo-preview-cleanup-all-pr-1',
						created_on: '2026-04-08T00:00:00.000Z',
						modified_on: '2026-04-08T00:00:00.000Z'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 2,
					total_count: 2
				})
			}

			if (url.includes('/accounts/acc_123/storage/kv/namespaces?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'kv-next',
						title: 'cache-kv-next'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 1,
					total_count: 1
				})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: ['cleanup'],
				options: {
					account: 'acc_123',
					all: true
				}
			},
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(renderedMessages.some((message) => message.includes('preview scopes next, pr-1, preview (--all)'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Preview cleanup dry run complete with 3 candidates across 3 preview scopes'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('Candidates: Workers 2 · KV 1'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('scope breakdown'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('next') && message.includes('dedicated workers') && message.includes('Workers 1'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('pr-1') && message.includes('dedicated workers') && message.includes('Workers 1'))).toBe(true)
		expect(renderedMessages.some((message) => message.includes('preview') && message.includes('default preview scope'))).toBe(true)
	})

	test('cleanup deletes preview worker consumers before preview service providers', async () => {
		process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token'
		const projectDir = temporaryCacheDirectories.create('devflare-previews-cleanup-apply-order-')
		writeServiceCleanupProject(projectDir)

		const deletedWorkers: string[] = []
		let mainWorkerDeleted = false

		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)

			if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
				return jsonResponse([], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 0,
					total_count: 0
				})
			}

			if (url.includes('/accounts/acc_123/workers/scripts?page=1&per_page=50')) {
				return jsonResponse([
					{
						id: 'demo-auth-service-next',
						created_on: '2026-04-08T00:00:00.000Z',
						modified_on: '2026-04-08T00:00:00.000Z'
					},
					{
						id: 'demo-worker-next',
						created_on: '2026-04-08T00:00:00.000Z',
						modified_on: '2026-04-08T00:00:00.000Z'
					}
				], {
					page: 1,
					per_page: 50,
					total_pages: 1,
					count: 2,
					total_count: 2
				})
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-worker-next') && init?.method === 'DELETE') {
				mainWorkerDeleted = true
				deletedWorkers.push('demo-worker-next')
				return jsonResponse({})
			}

			if (url.endsWith('/accounts/acc_123/workers/scripts/demo-auth-service-next') && init?.method === 'DELETE') {
				if (!mainWorkerDeleted) {
					return new Response(JSON.stringify({
						success: false,
						errors: [
							{
								message: "Cannot delete service 'demo-auth-service-next' because it is still referenced by service bindings in Workers 'demo-worker-next'. Please remove bindings pointing to it and try again."
							}
						],
						messages: [],
						result: null
					}), {
						status: 400,
						headers: {
							'Content-Type': 'application/json'
						}
					})
				}

				deletedWorkers.push('demo-auth-service-next')
				return jsonResponse({})
			}

			throw new Error(`Unexpected fetch URL: ${url}`)
		}) as unknown as typeof fetch

		const logger = createLogger()
		const result = await runPreviewsCommand(
			{
				command: 'previews',
				args: ['cleanup'],
				options: {
					account: 'acc_123',
					scope: 'next',
					apply: true
				}
			},
			logger as any,
			{ cwd: projectDir }
		)
		const renderedMessages = renderMessages(logger)

		expect(result.exitCode).toBe(0)
		expect(deletedWorkers).toEqual(['demo-worker-next', 'demo-auth-service-next'])
		expect(renderedMessages.some((message) => message.includes('Deleted 2 preview-only cleanup candidates across 1 preview scope'))).toBe(true)
	})
})
