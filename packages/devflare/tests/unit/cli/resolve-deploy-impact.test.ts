import { describe, expect, test } from 'bun:test'
import {
	createGlobalDependencyPatterns,
	matchesAnyPattern,
	SHARED_DEPLOY_INFRASTRUCTURE_PATTERNS
} from '../../../../../.github/scripts/resolve-deploy-impact.mjs'

describe('resolve deploy impact script', () => {
	test('treats shared deploy infrastructure as a global invalidation input', () => {
		const patterns = createGlobalDependencyPatterns({
			globalDependencies: []
		})

		expect(patterns).toContain('package.json')
		expect(patterns).toContain('turbo.json')

		for (const pattern of SHARED_DEPLOY_INFRASTRUCTURE_PATTERNS) {
			expect(patterns).toContain(pattern)
		}

		expect(matchesAnyPattern('.github/actions/devflare-deploy/action.yml', patterns)).toBe(true)
		expect(matchesAnyPattern('.github/actions/devflare-deploy-impact/action.yml', patterns)).toBe(true)
		expect(matchesAnyPattern('.github/actions/devflare-github-feedback/action.yml', patterns)).toBe(true)
		expect(matchesAnyPattern('.github/actions/devflare-setup-workspace/action.yml', patterns)).toBe(true)
		expect(matchesAnyPattern('.github/scripts/resolve-deploy-impact.mjs', patterns)).toBe(true)
		expect(matchesAnyPattern('.github/scripts/verify-testing-preview-deployment.ts', patterns)).toBe(true)
		expect(matchesAnyPattern('.github/workflows/preview.yml', patterns)).toBe(true)
		expect(matchesAnyPattern('.github/workflows/documentation-production.yml', patterns)).toBe(true)
	})

	test('keeps turbo global dependencies alongside shared deploy infrastructure', () => {
		const patterns = createGlobalDependencyPatterns({
			globalDependencies: ['.env.example', 'config/*.json']
		})

		expect(matchesAnyPattern('.env.example', patterns)).toBe(true)
		expect(matchesAnyPattern('config/dev.json', patterns)).toBe(true)
	})
})