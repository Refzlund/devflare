// =============================================================================
// Config Schema — zone-scoped resources
// =============================================================================
// The validation half of the `zones` namespace. What the reconciler DOES with a
// valid config is tested in `deploy-zones.test.ts`; this file is only about what
// it will accept, and the two mistakes it must refuse to accept.
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { configSchema } from '../../../src/config/schema'

const base = { name: 'my-worker', compatibilityDate: '2025-01-07' }

/** Parse a `zones` namespace and return the flat list of error messages. */
function issuesFor(zones: unknown): string[] {
	const result = configSchema.safeParse({ ...base, zones })
	return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('a routing rule must declare exactly one action', () => {
	test('one action is accepted', () => {
		expect(
			issuesFor({
				'example.com': { emailRouting: { rules: [{ to: 'a@example.com', drop: true }] } }
			})
		).toEqual([])
	})

	test('NO action is refused — a rule that matches mail and does nothing with it', () => {
		const issues = issuesFor({
			'example.com': { emailRouting: { rules: [{ to: 'a@example.com' }] } }
		})

		expect(issues.join('\n')).toContain('exactly one of')
		expect(issues.join('\n')).toContain('found 0')
	})

	test('TWO actions are refused — ambiguous, and one of them would be silently lost', () => {
		const issues = issuesFor({
			'example.com': {
				emailRouting: { rules: [{ to: 'a@example.com', drop: true, worker: 'api' }] }
			}
		})

		expect(issues.join('\n')).toContain('found 2')
	})

	test('the catch-all is held to the same rule', () => {
		expect(issuesFor({ 'example.com': { emailRouting: { catchAll: {} } } }).join('\n')).toContain(
			'exactly one of'
		)
	})
})

describe('one address may have only one rule', () => {
	test('two rules for the same address are refused', () => {
		const issues = issuesFor({
			'example.com': {
				emailRouting: {
					rules: [
						{ to: 'support@example.com', worker: 'api' },
						{ to: 'support@example.com', drop: true }
					]
				}
			}
		})

		expect(issues.join('\n')).toContain('support@example.com')
	})

	test('and CASE is not a way around it', () => {
		// Two live rules racing for the same message, with only one winning by an evaluation order
		// nothing here controls. Differing case makes it easy to write by accident, which is exactly
		// why the comparison is case-insensitive rather than exact.
		const issues = issuesFor({
			'example.com': {
				emailRouting: {
					rules: [
						{ to: 'support@example.com', worker: 'api' },
						{ to: 'SUPPORT@example.com', worker: 'api' }
					]
				}
			}
		})

		expect(issues.join('\n')).toContain('case-insensitively')
	})

	test('two DIFFERENT addresses are fine, so the check is not just rejecting everything', () => {
		expect(
			issuesFor({
				'example.com': {
					emailRouting: {
						rules: [
							{ to: 'support@example.com', worker: 'api' },
							{ to: 'press@example.com', drop: true }
						]
					}
				}
			})
		).toEqual([])
	})
})

describe('the namespace is strict about what it accepts', () => {
	test('an unknown key inside a zone is refused rather than ignored', () => {
		// `.strict()` throughout, so a typo is an error instead of a setting that silently does nothing.
		expect(issuesFor({ 'example.com': { emailRoutting: {} } }).length).toBeGreaterThan(0)
	})

	test('a well-formed DNS record survives validation intact', () => {
		const result = configSchema.safeParse({
			...base,
			zones: {
				'example.com': {
					dns: [{ type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none', ttl: 3600 }]
				}
			}
		})

		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.zones?.['example.com']?.dns?.[0]).toEqual({
				type: 'TXT',
				name: '_dmarc',
				content: 'v=DMARC1; p=none',
				ttl: 3600
			})
		}
	})
})
