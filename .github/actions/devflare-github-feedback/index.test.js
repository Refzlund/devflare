import { afterEach, describe, expect, test } from 'bun:test'
import { buildConfig, getInput } from './index.js'

const trackedEnvKeys = [
	'GITHUB_REPOSITORY',
	'INPUT_GITHUB-TOKEN',
	'INPUT_GITHUB_TOKEN',
	'INPUT_TITLE',
	'INPUT_STATUS'
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
})