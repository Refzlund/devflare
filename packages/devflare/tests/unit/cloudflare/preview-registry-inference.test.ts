import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
	getExplicitPreviewSyncOverrides,
	inferRecordSource
} from '../../../src/cloudflare/preview-registry-inference'

describe('inferRecordSource', () => {
	const originalGithubActions = process.env.GITHUB_ACTIONS

	beforeEach(() => {
		delete process.env.GITHUB_ACTIONS
	})

	afterEach(() => {
		if (originalGithubActions === undefined) {
			delete process.env.GITHUB_ACTIONS
		} else {
			process.env.GITHUB_ACTIONS = originalGithubActions
		}
	})

	test('prefers the explicit source over the fallback', () => {
		expect(inferRecordSource('dashboard', 'wrangler')).toBe('dashboard')
	})

	test('maps wrangler fallback to github-action when GITHUB_ACTIONS is set', () => {
		process.env.GITHUB_ACTIONS = 'true'
		expect(inferRecordSource(undefined, 'wrangler')).toBe('github-action')
	})

	test('maps wrangler fallback to cli when not in GitHub Actions', () => {
		expect(inferRecordSource(undefined, 'wrangler')).toBe('cli')
	})

	test('maps known fallbacks verbatim and defaults to unknown otherwise', () => {
		expect(inferRecordSource(undefined, 'dashboard')).toBe('dashboard')
		expect(inferRecordSource(undefined, 'workers-builds')).toBe('workers-builds')
		expect(inferRecordSource(undefined, 'mystery')).toBe('unknown')
		expect(inferRecordSource(undefined, undefined)).toBe('unknown')
	})
})

describe('getExplicitPreviewSyncOverrides', () => {
	test('returns an empty object when the version does not match', () => {
		const result = getExplicitPreviewSyncOverrides(
			{
				accountId: 'acc_1',
				workerName: 'worker',
				versionId: 'v-1',
				previewScope: 'pr-1',
				previewUrl: 'https://example.com',
				branchName: 'main',
				commitSha: 'abc'
			},
			'v-other'
		)

		expect(result).toEqual({})
	})

	test('propagates explicit overrides when the version matches', () => {
		const result = getExplicitPreviewSyncOverrides(
			{
				accountId: 'acc_1',
				workerName: 'worker',
				versionId: 'v-1',
				previewScope: 'pr-1',
				previewUrl: 'https://example.com/preview',
				previewScopeUrl: 'https://example.com/scope',
				branchName: 'main',
				commitSha: 'abc123'
			},
			'v-1'
		)

		expect(result).toEqual({
			previewScope: 'pr-1',
			previewUrl: 'https://example.com/preview',
			previewScopeUrl: 'https://example.com/scope',
			branchName: 'main',
			commitSha: 'abc123'
		})
	})
})
