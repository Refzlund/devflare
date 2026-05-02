import { describe, expect, test } from 'bun:test'
import {
	filterDevflareManagedTokens,
	matchesKnownPermissionGroup,
	normalizeDevflareTokenName,
	selectAllReusablePermissionGroups,
	selectDevflarePermissionGroups,
	stripDevflareTokenNamePrefix
} from '../../../src/cloudflare/tokens'

describe('selectDevflarePermissionGroups', () => {
	test('keeps Devflare-relevant permission groups and excludes unrelated ones', () => {
		const selected = selectDevflarePermissionGroups([
			{
				id: 'account-api-tokens-write',
				name: 'Account API Tokens Write',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'workers-scripts-write',
				name: 'Workers Scripts Write',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'd1-write',
				name: 'D1 Write',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'browser-rendering-read',
				name: 'Browser Rendering Read',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'account-waf-write',
				name: 'Account WAF Write',
				scopes: ['com.cloudflare.api.account']
			}
		])

		expect(selected.map((group) => group.id)).toEqual([
			'workers-scripts-write',
			'd1-write',
			'browser-rendering-read'
		])
	})

	test('keeps account and zone-scoped Devflare permission groups but excludes user-scoped matches', () => {
		const selected = selectDevflarePermissionGroups([
			{
				id: 'workers-routes-write-zone',
				name: 'Workers Routes Write',
				scopes: ['com.cloudflare.api.account.zone']
			},
			{
				id: 'workers-scripts-write-account',
				name: 'Workers Scripts Write',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'workers-scripts-write-user',
				name: 'Workers Scripts Write',
				scopes: ['com.cloudflare.api.user']
			}
		])

		expect(selected.map((group) => group.id)).toEqual([
			'workers-routes-write-zone',
			'workers-scripts-write-account'
		])
	})

	test('throws when nothing matches the Devflare permission set', () => {
		expect(() => {
			selectDevflarePermissionGroups([
				{
					id: 'account-waf-write',
					name: 'Account WAF Write',
					scopes: ['com.cloudflare.api.account']
				}
			])
		}).toThrow('Could not map the available Cloudflare permission groups')
	})

	test('keeps every Read/Write/Edit/Admin variant for each Devflare-managed product so deploy provisioning never fails on a missing variant', () => {
		// The deploy pipeline lists, creates and updates resources across every
		// product family below — a missing variant on the resulting token
		// surfaces as `ERROR Deployment failed: Could not list <Product> ...`
		// during `bunx devflare deploy`, so this test guards that all common
		// verbs survive selection per product.
		const productVariantFixtures: ReadonlyArray<{
			productName: string
			variants: ReadonlyArray<string>
		}> = [
				{ productName: 'R2', variants: ['Read', 'Write', 'Edit', 'Admin'] },
				{ productName: 'D1', variants: ['Read', 'Write', 'Edit', 'Admin', 'Metadata Read'] },
				{ productName: 'Workers Scripts', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Workers Routes', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Workers KV Storage', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Workers R2 Storage', variants: ['Read', 'Write', 'Edit', 'Bucket Item Read', 'Bucket Item Write'] },
				{ productName: 'Queues', variants: ['Read', 'Write', 'Edit', 'Admin'] },
				{ productName: 'Hyperdrive', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Vectorize', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'AI', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Browser Rendering', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Pages', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Email Routing', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Images', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Stream', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Logs', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Logpush', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'DNS', variants: ['Read', 'Write', 'Edit'] },
				{ productName: 'Cache Purge', variants: [''] }
			]

		const fixtures = productVariantFixtures.flatMap(({ productName, variants }) => {
			return variants.map((variant) => {
				const fullName = variant === '' ? productName : `${productName} ${variant}`
				return {
					id: fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
					name: fullName,
					scopes: [
						['Workers Routes', 'DNS', 'Cache Purge'].includes(productName)
							? 'com.cloudflare.api.account.zone'
							: 'com.cloudflare.api.account'
					]
				}
			})
		})

		const selectedNames = new Set(
			selectDevflarePermissionGroups(fixtures).map((group) => group.name)
		)

		const missing: string[] = []
		for (const { productName, variants } of productVariantFixtures) {
			for (const variant of variants) {
				const fullName = variant === '' ? productName : `${productName} ${variant}`
				if (!selectedNames.has(fullName)) {
					missing.push(fullName)
				}
			}
		}

		expect(missing).toEqual([])
	})

	test('still excludes Account API Tokens permission groups even when other Account-prefixed groups are loosened', () => {
		// `Account API Tokens Write/Read` lets a token rotate / delete other
		// tokens — that authority must never end up on a deploy token, even
		// after loosening `Account Settings` / `Account Analytics` patterns.
		const selected = selectDevflarePermissionGroups([
			{
				id: 'account-api-tokens-write',
				name: 'Account API Tokens Write',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'account-api-tokens-read',
				name: 'Account API Tokens Read',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'account-settings-edit',
				name: 'Account Settings Edit',
				scopes: ['com.cloudflare.api.account']
			}
		])

		expect(selected.map((group) => group.id)).toEqual(['account-settings-edit'])
	})

	test('keeps every reusable permission group for all-flags mode but still excludes token-management groups', () => {
		const selected = selectAllReusablePermissionGroups([
			{
				id: 'account-api-tokens-write',
				name: 'Account API Tokens Write',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'workers-scripts-write',
				name: 'Workers Scripts Write',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'vectorize-write',
				name: 'Vectorize Write',
				scopes: ['com.cloudflare.api.account']
			}
		])

		expect(selected.map((group) => group.id)).toEqual([
			'workers-scripts-write',
			'vectorize-write'
		])
	})

	test('keeps account and zone-scoped reusable permission groups for all-flags mode', () => {
		const selected = selectAllReusablePermissionGroups([
			{
				id: 'workers-scripts-write-account',
				name: 'Workers Scripts Write',
				scopes: ['com.cloudflare.api.account']
			},
			{
				id: 'workers-scripts-write-zone',
				name: 'Workers Scripts Write',
				scopes: ['com.cloudflare.api.account.zone']
			},
			{
				id: 'vectorize-write-user',
				name: 'Vectorize Write',
				scopes: ['com.cloudflare.api.user']
			},
			{
				id: 'vectorize-write-account',
				name: 'Vectorize Write',
				scopes: ['com.cloudflare.api.account']
			}
		])

		expect(selected.map((group) => group.id)).toEqual([
			'workers-scripts-write-account',
			'workers-scripts-write-zone',
			'vectorize-write-account'
		])
	})

	test('filters large mixed-scope permission catalogs below Cloudflare\'s limit', () => {
		const accountScopedGroups = Array.from({ length: 200 }, (_, index) => ({
			id: `account-${index + 1}`,
			name: `Reusable Account Permission ${index + 1}`,
			scopes: ['com.cloudflare.api.account']
		}))
		const zoneScopedGroups = Array.from({ length: 99 }, (_, index) => ({
			id: `zone-${index + 1}`,
			name: `Reusable Zone Permission ${index + 1}`,
			scopes: ['com.cloudflare.api.account.zone']
		}))

		const selected = selectAllReusablePermissionGroups([
			...accountScopedGroups,
			...zoneScopedGroups,
			{
				id: 'account-api-tokens-write',
				name: 'Account API Tokens Write',
				scopes: ['com.cloudflare.api.account']
			}
		])

		expect(selected).toHaveLength(299)
		expect(selected.filter((group) => group.id.startsWith('account-'))).toHaveLength(200)
		expect(selected.filter((group) => group.id.startsWith('zone-'))).toHaveLength(99)
	})

	test('normalizes Devflare-managed token names to the devflare- prefix', () => {
		expect(normalizeDevflareTokenName('preview')).toBe('devflare-preview')
		expect(normalizeDevflareTokenName('devflare-preview')).toBe('devflare-preview')
	})

	test('strips the devflare- prefix for display without changing unprefixed names', () => {
		expect(stripDevflareTokenNamePrefix('devflare-preview')).toBe('preview')
		expect(stripDevflareTokenNamePrefix('preview')).toBe('preview')
	})

	test('filters account-owned tokens down to Devflare-managed names', () => {
		const filtered = filterDevflareManagedTokens([
			{
				id: 'token_1',
				name: 'devflare-preview',
				status: 'active'
			},
			{
				id: 'token_2',
				name: 'manual-token',
				status: 'active'
			}
		])

		expect(filtered.map((token) => token.id)).toEqual(['token_1'])
	})
})

describe('matchesKnownPermissionGroup', () => {
	test('prefers id match over display name and falls back to exact display-name match with warning', () => {
		const knownIds = {
			WORKERS_SCRIPTS_WRITE: 'verified-workers-scripts-write-id',
			WORKERS_SCRIPTS_READ: undefined,
			ACCOUNT_SETTINGS_READ: undefined,
			WORKERS_KV_STORAGE_WRITE: undefined,
			WORKERS_KV_STORAGE_READ: undefined,
			ACCOUNT_API_TOKENS_WRITE: undefined,
			ACCOUNT_API_TOKENS_READ: undefined
		}
		const knownDisplayNames = {
			WORKERS_SCRIPTS_WRITE: 'Workers Scripts Write',
			WORKERS_SCRIPTS_READ: 'Workers Scripts Read',
			ACCOUNT_SETTINGS_READ: 'Account Settings Read',
			WORKERS_KV_STORAGE_WRITE: 'Workers KV Storage Write',
			WORKERS_KV_STORAGE_READ: 'Workers KV Storage Read',
			ACCOUNT_API_TOKENS_WRITE: 'Account API Tokens Write',
			ACCOUNT_API_TOKENS_READ: 'Account API Tokens Read'
		}

		const permissionsList = [
			// id-matched — display name deliberately different / renamed
			{
				id: 'verified-workers-scripts-write-id',
				name: 'Workers Scripts: Write (renamed by Cloudflare)',
				scopes: ['com.cloudflare.api.account']
			},
			// display-name-matched — id not in the known map
			{
				id: 'some-unrelated-id-for-read',
				name: 'Workers Scripts Read',
				scopes: ['com.cloudflare.api.account']
			},
			// should NOT match either — substring-only name
			{
				id: 'unrelated',
				name: 'Workers Scripts Write Delegated',
				scopes: ['com.cloudflare.api.account']
			},
			// should NOT match — wrong id and wrong name
			{
				id: 'other',
				name: 'Some Other Group',
				scopes: ['com.cloudflare.api.account']
			}
		]

		const warnCalls: string[] = []
		const originalWarn = console.warn
		console.warn = (...args: unknown[]) => {
			warnCalls.push(args.map(String).join(' '))
		}

		try {
			const writeMatches = permissionsList.filter((group) =>
				matchesKnownPermissionGroup('WORKERS_SCRIPTS_WRITE', group, {
					knownIds,
					knownDisplayNames
				})
			)
			const readMatches = permissionsList.filter((group) =>
				matchesKnownPermissionGroup('WORKERS_SCRIPTS_READ', group, {
					knownIds,
					knownDisplayNames
				})
			)

			// Id-matched: matches only the exact id, even though the display name drifted
			expect(writeMatches.map((group) => group.id)).toEqual([
				'verified-workers-scripts-write-id'
			])
			// Display-name fallback: matches ONLY the exact name, not substrings
			expect(readMatches.map((group) => group.id)).toEqual([
				'some-unrelated-id-for-read'
			])

			// No warning for id-matched path
			expect(
				warnCalls.some((message) => message.includes('WORKERS_SCRIPTS_WRITE'))
			).toBe(false)
			// Warning emitted for display-name fallback path
			expect(
				warnCalls.some((message) => message.includes('WORKERS_SCRIPTS_READ'))
			).toBe(true)
		} finally {
			console.warn = originalWarn
		}
	})
})
