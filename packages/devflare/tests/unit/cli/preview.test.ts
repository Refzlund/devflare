import { describe, expect, test } from 'bun:test'
import {
	formatPreviewAliasUrl,
	formatVersionPreviewUrl,
	mergeParsedWranglerDeployOutputs,
	parseWranglerDeployOutput,
	parseWranglerStructuredOutput,
	resolvePreviewAlias,
	sanitizePreviewAlias
} from '../../../src/cli/preview'

describe('preview helpers', () => {
	test('sanitizes branch names into Cloudflare-safe preview aliases', () => {
		expect(sanitizePreviewAlias('Feature/Branch_Name')).toBe('feature-branch-name')
		expect(sanitizePreviewAlias('123-start')).toBe('b-123-start')
	})

	test('uses branch metadata when it is provided', async () => {
		const result = await resolvePreviewAlias({
			branchName: 'feature/branch',
			workerName: 'demo-worker'
		})

		expect(result.alias).toBe('feature-branch')
		expect(result.source).toBe('branch-name')
	})

	test('falls back to git metadata when no explicit or CI branch is available', async () => {
		const result = await resolvePreviewAlias({
			workerName: 'demo-worker',
			env: {},
			getGitBranch: async () => 'feature/git-branch'
		})

		expect(result.alias).toBe('feature-git-branch')
		expect(result.source).toBe('git')
	})

	test('throws when the worker name leaves no room for a preview alias', () => {
		expect(() => sanitizePreviewAlias('preview', 'x'.repeat(63))).toThrow(
			'too long for preview aliases'
		)
	})

	test('formats preview alias urls using the account workers.dev subdomain', () => {
		expect(formatPreviewAliasUrl('feature-branch', 'demo-worker', 'example-subdomain')).toBe(
			'https://feature-branch-demo-worker.example-subdomain.workers.dev'
		)
		expect(formatPreviewAliasUrl('feature-branch', 'demo-worker', 'example-subdomain.workers.dev')).toBe(
			'https://feature-branch-demo-worker.example-subdomain.workers.dev'
		)
	})

	test('formats version preview urls using the version prefix and workers.dev subdomain', () => {
		expect(formatVersionPreviewUrl('5dba9570-33c4-4375-b784-e1b34ad01569', 'demo-worker', 'example-subdomain')).toBe(
			'https://5dba9570-demo-worker.example-subdomain.workers.dev'
		)
	})

	test('parses version ids and preview urls from wrangler output', () => {
		const parsed = parseWranglerDeployOutput(`
Worker Version ID: version-123
Version Preview URL: https://preview.example.workers.dev
Preview Alias URL: https://demo-worker-feature.example.workers.dev
`.trim())

		expect(parsed.versionId).toBe('version-123')
		expect(parsed.previewUrl).toBe('https://preview.example.workers.dev')
		expect(parsed.previewAliasUrl).toBe('https://demo-worker-feature.example.workers.dev')
		expect(parsed.urls).toHaveLength(2)
	})

	test('parses version ids and targets from Wrangler structured output', () => {
		const parsed = parseWranglerStructuredOutput([
			JSON.stringify({
				type: 'wrangler-session',
				version: 1
			}),
			JSON.stringify({
				type: 'deploy',
				version: 1,
				worker_name: 'demo-worker',
				version_id: 'version-123',
				targets: ['https://demo-worker.example.workers.dev']
			})
		].join('\n'))

		expect(parsed.versionId).toBe('version-123')
		expect(parsed.previewUrl).toBe('https://demo-worker.example.workers.dev')
		expect(parsed.urls).toEqual(['https://demo-worker.example.workers.dev'])
	})

	test('prefers Wrangler structured output when console output omits the version id', () => {
		const parsed = mergeParsedWranglerDeployOutputs(
			parseWranglerDeployOutput('Deployed successfully to https://demo-worker.example.workers.dev'),
			parseWranglerStructuredOutput(JSON.stringify({
				type: 'deploy',
				version_id: 'version-123',
				targets: ['https://demo-worker.example.workers.dev']
			}))
		)

		expect(parsed.versionId).toBe('version-123')
		expect(parsed.previewUrl).toBe('https://demo-worker.example.workers.dev')
	})
})
