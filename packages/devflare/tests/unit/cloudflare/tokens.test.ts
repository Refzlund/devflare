import { describe, expect, test } from 'bun:test'
import {
	filterDevflareManagedTokens,
	normalizeDevflareTokenName,
	selectAllReusablePermissionGroups,
	selectDevflarePermissionGroups
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

	test('ignores matching permission names that are not account-scoped', () => {
		const selected = selectDevflarePermissionGroups([
			{
				id: 'workers-scripts-write-zone',
				name: 'Workers Scripts Write',
				scopes: ['com.cloudflare.api.account.zone']
			},
			{
				id: 'workers-scripts-write-account',
				name: 'Workers Scripts Write',
				scopes: ['com.cloudflare.api.account']
			}
		])

		expect(selected.map((group) => group.id)).toEqual([
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

	test('keeps only account-scoped reusable permission groups for all-flags mode', () => {
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
			'vectorize-write-account'
		])
	})

	test('filters large mixed-scope permission catalogs below Cloudflare\'s limit', () => {
		const accountScopedGroups = Array.from({ length: 299 }, (_, index) => ({
			id: `account-${index + 1}`,
			name: `Reusable Account Permission ${index + 1}`,
			scopes: ['com.cloudflare.api.account']
		}))
		const zoneScopedGroups = Array.from({ length: 49 }, (_, index) => ({
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
		expect(selected.every((group) => group.id.startsWith('account-'))).toBe(true)
	})

	test('normalizes Devflare-managed token names to the devflare- prefix', () => {
		expect(normalizeDevflareTokenName('preview')).toBe('devflare-preview')
		expect(normalizeDevflareTokenName('devflare-preview')).toBe('devflare-preview')
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