import { describe, expect, test } from 'bun:test'
import {
	formatVersionPreviewUrl,
	formatWorkersDevUrl,
	mergeParsedWranglerDeployOutputs,
	parseWranglerDeployOutput,
	parseWranglerStructuredOutput
} from '../../../src/cli/preview'

describe('preview helpers', () => {
	test('formats workers.dev urls using the account subdomain', () => {
		expect(formatWorkersDevUrl('demo-worker', 'example-subdomain')).toBe(
			'https://demo-worker.example-subdomain.workers.dev'
		)
		expect(formatWorkersDevUrl('demo-worker', 'example-subdomain.workers.dev')).toBe(
			'https://demo-worker.example-subdomain.workers.dev'
		)
	})

	test('formats version preview urls using the version prefix and workers.dev subdomain', () => {
		expect(
			formatVersionPreviewUrl(
				'5dba9570-33c4-4375-b784-e1b34ad01569',
				'demo-worker',
				'example-subdomain'
			)
		).toBe('https://5dba9570-demo-worker.example-subdomain.workers.dev')
	})

	test('parses version ids and preview urls from wrangler output', () => {
		const parsed = parseWranglerDeployOutput(
			`
Worker Version ID: version-123
Version Preview URL: https://preview.example.workers.dev
`.trim()
		)

		expect(parsed.versionId).toBe('version-123')
		expect(parsed.previewUrl).toBe('https://preview.example.workers.dev')
		expect(parsed.urls).toEqual(['https://preview.example.workers.dev'])
	})

	test('parses version ids and targets from Wrangler structured output', () => {
		const parsed = parseWranglerStructuredOutput(
			[
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
			].join('\n')
		)

		expect(parsed.versionId).toBe('version-123')
		expect(parsed.previewUrl).toBe('https://demo-worker.example.workers.dev')
		expect(parsed.urls).toEqual(['https://demo-worker.example.workers.dev'])
	})

	test('prefers the explicit structured preview url when it is present', () => {
		const parsed = parseWranglerStructuredOutput(
			JSON.stringify({
				type: 'deploy',
				version_id: 'version-123',
				preview_url: 'https://preview.example.workers.dev',
				targets: ['https://demo-worker.example.workers.dev']
			})
		)

		expect(parsed.versionId).toBe('version-123')
		expect(parsed.previewUrl).toBe('https://preview.example.workers.dev')
		expect(parsed.urls).toEqual(['https://demo-worker.example.workers.dev'])
	})

	test('prefers Wrangler structured output when console output omits the version id', () => {
		const parsed = mergeParsedWranglerDeployOutputs(
			parseWranglerDeployOutput('Deployed successfully to https://demo-worker.example.workers.dev'),
			parseWranglerStructuredOutput(
				JSON.stringify({
					type: 'deploy',
					version_id: 'version-123',
					targets: ['https://demo-worker.example.workers.dev']
				})
			)
		)

		expect(parsed.versionId).toBe('version-123')
		expect(parsed.previewUrl).toBe('https://demo-worker.example.workers.dev')
	})
})
