import { afterEach, describe, expect, test } from 'bun:test'
import {
	buildCommentBody,
	buildConfig,
	buildGroupedCommentBody,
	getInput,
	parseGroupedCommentSections
} from './index.js'

const trackedEnvKeys = [
	'GITHUB_REPOSITORY',
	'INPUT_GITHUB-TOKEN',
	'INPUT_GITHUB_TOKEN',
	'INPUT_TITLE',
	'INPUT_STATUS',
	'INPUT_COMMENT-SECTION-KEY',
	'INPUT_COMMENT_SECTION_KEY',
	'INPUT_COMMENT-GROUP-TITLE',
	'INPUT_COMMENT_GROUP_TITLE',
	'INPUT_COMMENT-GROUP-SUMMARY',
	'INPUT_COMMENT_GROUP_SUMMARY'
]

const originalEnv = new Map(
	trackedEnvKeys.map((envKey) => [envKey, process.env[envKey]])
)

function resetTrackedEnv() {
	for (const envKey of trackedEnvKeys) {
		const originalValue = originalEnv.get(envKey)
		if (typeof originalValue === 'undefined') {
			delete process.env[envKey]
			continue
		}

		process.env[envKey] = originalValue
	}
}

afterEach(() => {
	resetTrackedEnv()
})

describe('devflare-github-feedback inputs', () => {
	test('reads hyphenated GitHub Actions input env keys', () => {
		process.env['INPUT_GITHUB-TOKEN'] = 'github-token-from-runner'

		expect(getInput('github-token')).toBe('github-token-from-runner')
	})

	test('also accepts underscore input env keys as a compatibility fallback', () => {
		process.env.INPUT_GITHUB_TOKEN = 'github-token-from-fallback'

		expect(getInput('github-token')).toBe('github-token-from-fallback')
	})

	test('buildConfig succeeds when required inputs come from hyphenated env keys', () => {
		process.env.GITHUB_REPOSITORY = 'Refzlund/devflare'
		process.env['INPUT_GITHUB-TOKEN'] = 'github-token-from-runner'
		process.env.INPUT_TITLE = 'Documentation production'
		process.env.INPUT_STATUS = 'failure'

		const config = buildConfig()

		expect(config.githubToken).toBe('github-token-from-runner')
		expect(config.title).toBe('Documentation production')
		expect(config.status).toBe('failure')
	})

	test('buildConfig reads grouped comment inputs', () => {
		process.env.GITHUB_REPOSITORY = 'Refzlund/devflare'
		process.env['INPUT_GITHUB-TOKEN'] = 'github-token-from-runner'
		process.env.INPUT_TITLE = 'Testing PR preview'
		process.env.INPUT_STATUS = 'success'
		process.env['INPUT_COMMENT-SECTION-KEY'] = 'testing-preview'
		process.env['INPUT_COMMENT-GROUP-TITLE'] = 'Pull request deployment status'
		process.env['INPUT_COMMENT-GROUP-SUMMARY'] = 'Shared preview status comment'

		const config = buildConfig()

		expect(config.commentSectionKey).toBe('testing-preview')
		expect(config.commentGroupTitle).toBe('Pull request deployment status')
		expect(config.commentGroupSummary).toBe('Shared preview status comment')
	})
})

describe('grouped comment rendering', () => {
	function createConfig(overrides = {}) {
		return {
			commentMarker: '<!-- devflare-feedback:pr-deployment-status -->',
			commentKey: 'pr-deployment-status',
			title: 'Documentation PR preview',
			status: 'success',
			operation: 'report',
			deploymentKind: 'preview',
			previewUrl: 'https://docs-preview.example.workers.dev',
			environmentUrl: 'https://docs-preview.example.workers.dev',
			refName: 'next',
			sha: 'c027eca929d53edb9fa30653f185ba2da0b5c9f0',
			logUrl: 'https://github.com/Refzlund/devflare/actions/runs/1',
			commentSectionKey: 'documentation-preview',
			commentGroupTitle: 'Pull request deployment status',
			commentGroupSummary: 'This single comment tracks the latest documentation and testing preview results for the pull request.',
			...overrides
		}
	}

	test('renders grouped comments with multiple workflow sections', () => {
		const documentationConfig = createConfig()
		const testingConfig = createConfig({
			title: 'Testing PR preview',
			previewUrl: 'https://testing-preview.example.workers.dev',
			environmentUrl: 'https://testing-preview.example.workers.dev',
			commentSectionKey: 'testing-preview'
		})

		const body = buildGroupedCommentBody(documentationConfig, new Map([
			[
				documentationConfig.commentSectionKey,
				buildCommentBody(documentationConfig, {
					includeMarker: false,
					headingLevel: 3
				}).trim()
			],
			[
				testingConfig.commentSectionKey,
				buildCommentBody(testingConfig, {
					includeMarker: false,
					headingLevel: 3
				}).trim()
			]
		]))

		expect(body).toContain('## Pull request deployment status')
		expect(body).toContain('### ✅ Documentation PR preview deployed successfully')
		expect(body).toContain('### ✅ Testing PR preview deployed successfully')
		expect(body.indexOf('Documentation PR preview')).toBeLessThan(body.indexOf('Testing PR preview'))
	})

	test('parses grouped comment sections from an existing shared comment body', () => {
		const body = buildGroupedCommentBody(createConfig(), new Map([
			[
				'documentation-preview',
				'### ✅ Documentation PR preview deployed successfully\n\nDocumentation section'
			],
			[
				'testing-preview',
				'### ⏭️ Testing PR preview was unchanged\n\nTesting section'
			]
		]))

		const sections = parseGroupedCommentSections('pr-deployment-status', body)

		expect(sections.get('documentation-preview')).toContain('Documentation section')
		expect(sections.get('testing-preview')).toContain('Testing section')
	})
})