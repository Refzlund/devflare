import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../../../../.github/actions/devflare-github-feedback/index.js'

const originalFetch = globalThis.fetch
const originalEnvironment = { ...process.env }
const temporaryDirectories = new Set<string>()

function restoreEnvironment(): void {
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnvironment)) {
			delete process.env[key]
		}
	}

	for (const [key, value] of Object.entries(originalEnvironment)) {
		if (value === undefined) {
			delete process.env[key]
		} else {
			process.env[key] = value
		}
	}
}

function createGitHubJsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json'
		}
	})
}

function writeOutputFile(tempDir: string): string {
	const outputPath = join(tempDir, 'github-output.txt')
	writeFileSync(outputPath, '', 'utf-8')
	return outputPath
}

function setCommentModeEnvironment(outputPath: string): void {
	process.env.GITHUB_REPOSITORY = 'Refzlund/devflare'
	process.env.GITHUB_OUTPUT = outputPath
	process.env.INPUT_GITHUB_TOKEN = 'ghs_test_token'
	process.env.INPUT_MODE = 'comment'
	process.env.INPUT_OPERATION = 'report'
	process.env.INPUT_STATUS = 'success'
	process.env.INPUT_TITLE = 'Testing PR preview'
	process.env.INPUT_COMMENT_KEY = 'testing-preview'
	process.env.INPUT_PR_NUMBER = '1'
}

afterEach(() => {
	globalThis.fetch = originalFetch
	restoreEnvironment()

	for (const directory of temporaryDirectories) {
		rmSync(directory, { recursive: true, force: true })
	}
	temporaryDirectories.clear()
})

describe('devflare-github-feedback action', () => {
	test('skips PR comment failures caused by integration permission 403s by default', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'devflare-github-feedback-'))
		temporaryDirectories.add(tempDir)
		const outputPath = writeOutputFile(tempDir)
		setCommentModeEnvironment(outputPath)

		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			const method = init?.method ?? 'GET'

			if (
				method === 'GET' &&
				url.endsWith('/repos/Refzlund/devflare/issues/1/comments?per_page=100')
			) {
				return createGitHubJsonResponse([], 200)
			}

			if (method === 'POST' && url.endsWith('/repos/Refzlund/devflare/issues/1/comments')) {
				return createGitHubJsonResponse(
					{
						message: 'Resource not accessible by integration',
						status: '403'
					},
					403
				)
			}

			throw new Error(`Unexpected fetch request: ${method} ${url}`)
		}) as unknown as typeof fetch

		await expect(main()).resolves.toBeUndefined()

		const output = readFileSync(outputPath, 'utf-8')
		expect(output).toContain('comment-id=')
		expect(output).toContain('pr-number=1')
	})

	test('can still fail on comment permission 403s when the ignore flag is disabled', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'devflare-github-feedback-'))
		temporaryDirectories.add(tempDir)
		const outputPath = writeOutputFile(tempDir)
		setCommentModeEnvironment(outputPath)
		process.env.INPUT_IGNORE_COMMENT_PERMISSION_ERRORS = 'false'

		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			const method = init?.method ?? 'GET'

			if (
				method === 'GET' &&
				url.endsWith('/repos/Refzlund/devflare/issues/1/comments?per_page=100')
			) {
				return createGitHubJsonResponse([], 200)
			}

			if (method === 'POST' && url.endsWith('/repos/Refzlund/devflare/issues/1/comments')) {
				return createGitHubJsonResponse(
					{
						message: 'Resource not accessible by integration',
						status: '403'
					},
					403
				)
			}

			throw new Error(`Unexpected fetch request: ${method} ${url}`)
		}) as unknown as typeof fetch

		await expect(main()).rejects.toThrow('Resource not accessible by integration')
	})

	test('does not include production URLs in preview PR comments even when provided', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'devflare-github-feedback-'))
		temporaryDirectories.add(tempDir)
		const outputPath = writeOutputFile(tempDir)
		setCommentModeEnvironment(outputPath)
		process.env.INPUT_DEPLOYMENT_KIND = 'preview'
		process.env.INPUT_PREVIEW_URL = 'https://devflare-docs-pr-1.refz.workers.dev'
		process.env.INPUT_PRODUCTION_URL = 'https://devflare-docs.refz.workers.dev'

		let postedCommentBody = ''

		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			const method = init?.method ?? 'GET'

			if (
				method === 'GET' &&
				url.endsWith('/repos/Refzlund/devflare/issues/1/comments?per_page=100')
			) {
				return createGitHubJsonResponse([], 200)
			}

			if (method === 'POST' && url.endsWith('/repos/Refzlund/devflare/issues/1/comments')) {
				postedCommentBody = String(init?.body ?? '')
				return createGitHubJsonResponse({ id: 123 }, 201)
			}

			throw new Error(`Unexpected fetch request: ${method} ${url}`)
		}) as unknown as typeof fetch

		await expect(main()).resolves.toBeUndefined()

		expect(postedCommentBody).toContain('Preview URL: [https://devflare-docs-pr-1.refz.workers.dev](https://devflare-docs-pr-1.refz.workers.dev)')
		expect(postedCommentBody).not.toContain('Production URL')
		expect(postedCommentBody).not.toContain('https://devflare-docs.refz.workers.dev')
	})
})
