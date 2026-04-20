import { describe, expect, test } from 'bun:test'
import {
	renderGeneratedFile,
	resolveUpdatedEntries
} from '../../../scripts/refresh-permission-groups'
import { KNOWN_PERMISSION_GROUP_DISPLAY_NAMES } from '../../../src/cloudflare/tokens'
import { KNOWN_PERMISSION_GROUP_IDS_DATA } from '../../../src/cloudflare/known-permission-group-ids.generated'

describe('known-permission-group-ids.generated.ts', () => {
	test('exports an entry for every symbolic permission name used by tokens.ts', () => {
		const symbolicNames = Object.keys(KNOWN_PERMISSION_GROUP_DISPLAY_NAMES).sort()
		const generatedKeys = Object.keys(KNOWN_PERMISSION_GROUP_IDS_DATA).sort()

		expect(generatedKeys).toEqual(symbolicNames)
	})

	test('every value is either a non-empty string or null (no undefined / no empty strings)', () => {
		for (const [key, value] of Object.entries(KNOWN_PERMISSION_GROUP_IDS_DATA)) {
			if (value === null) {
				continue
			}

			expect(typeof value).toBe('string')
			expect((value as string).length).toBeGreaterThan(0)
			// UUID-ish sanity: must not contain whitespace or commentary if non-null
			expect(/\s/.test(value as string)).toBe(false)
			expect(key).toBeTruthy()
		}
	})
})

describe('resolveUpdatedEntries', () => {
	test('matches each symbolic name to the API permission group with the same display name', () => {
		const apiResponse = [
			{ id: 'uuid-workers-scripts-write', name: 'Workers Scripts Write' },
			{ id: 'uuid-workers-scripts-read', name: 'Workers Scripts Read' },
			{ id: 'uuid-account-settings-read', name: 'Account Settings Read' },
			{ id: 'uuid-workers-kv-write', name: 'Workers KV Storage Write' },
			{ id: 'uuid-workers-kv-read', name: 'Workers KV Storage Read' },
			{ id: 'uuid-account-api-tokens-write', name: 'Account API Tokens Write' },
			{ id: 'uuid-account-api-tokens-read', name: 'Account API Tokens Read' },
			{ id: 'uuid-noise', name: 'Some Other Permission' }
		]

		const entries = resolveUpdatedEntries(apiResponse, { keepExisting: false })

		const resolvedById = Object.fromEntries(
			entries.map((entry) => [entry.symbolicName, entry.resolvedId])
		)

		expect(resolvedById).toEqual({
			WORKERS_SCRIPTS_WRITE: 'uuid-workers-scripts-write',
			WORKERS_SCRIPTS_READ: 'uuid-workers-scripts-read',
			ACCOUNT_SETTINGS_READ: 'uuid-account-settings-read',
			WORKERS_KV_STORAGE_WRITE: 'uuid-workers-kv-write',
			WORKERS_KV_STORAGE_READ: 'uuid-workers-kv-read',
			ACCOUNT_API_TOKENS_WRITE: 'uuid-account-api-tokens-write',
			ACCOUNT_API_TOKENS_READ: 'uuid-account-api-tokens-read'
		})
	})

	test('falls back to null when an entry is missing from the API response', () => {
		const apiResponse = [
			{ id: 'uuid-workers-scripts-write', name: 'Workers Scripts Write' }
		]

		const entries = resolveUpdatedEntries(apiResponse, { keepExisting: false })
		const missingEntry = entries.find((entry) => entry.symbolicName === 'WORKERS_SCRIPTS_READ')

		expect(missingEntry?.resolvedId).toBeNull()
	})

	test('keeps the previous id for missing entries when keepExisting is true and a value is already present', () => {
		// We can only assert this property generically because the current
		// generated data file may legitimately ship with all-null values.
		// The unit under test is the merge logic: a missing API entry with a
		// previously-known id must not be cleared when keepExisting is true.
		const apiResponse: Array<{ id: string; name: string }> = []

		const entries = resolveUpdatedEntries(apiResponse, { keepExisting: true })

		for (const entry of entries) {
			expect(entry.resolvedId).toBe(entry.previousId)
		}
	})

	test('clears entries missing from the API response when keepExisting is false', () => {
		const apiResponse: Array<{ id: string; name: string }> = []

		const entries = resolveUpdatedEntries(apiResponse, { keepExisting: false })

		for (const entry of entries) {
			expect(entry.resolvedId).toBeNull()
		}
	})

	test('ignores duplicate display names and keeps the first match (account-scoped wins by listing order)', () => {
		const apiResponse = [
			{ id: 'uuid-account-scope', name: 'Workers Scripts Write' },
			{ id: 'uuid-zone-scope-duplicate', name: 'Workers Scripts Write' }
		]

		const entries = resolveUpdatedEntries(apiResponse, { keepExisting: false })
		const writeEntry = entries.find((entry) => entry.symbolicName === 'WORKERS_SCRIPTS_WRITE')

		expect(writeEntry?.resolvedId).toBe('uuid-account-scope')
	})
})

describe('renderGeneratedFile', () => {
	test('emits a deterministic, importable TypeScript module with the AUTO-GENERATED banner', () => {
		const apiResponse = [
			{ id: 'uuid-workers-scripts-write', name: 'Workers Scripts Write' }
		]
		const entries = resolveUpdatedEntries(apiResponse, { keepExisting: false })

		const rendered = renderGeneratedFile(entries)

		expect(rendered).toContain('AUTO-GENERATED FILE')
		expect(rendered).toContain('export const KNOWN_PERMISSION_GROUP_IDS_DATA')
		expect(rendered).toContain("WORKERS_SCRIPTS_WRITE: 'uuid-workers-scripts-write'")
		expect(rendered).toContain('WORKERS_SCRIPTS_READ: null')
		// File ends with a single trailing newline
		expect(rendered.endsWith('\n')).toBe(true)
		expect(rendered.endsWith('\n\n')).toBe(false)
	})

	test('produces stable output for the same input (idempotent across calls)', () => {
		const apiResponse = [
			{ id: 'uuid-workers-scripts-write', name: 'Workers Scripts Write' }
		]
		const entries = resolveUpdatedEntries(apiResponse, { keepExisting: false })

		const first = renderGeneratedFile(entries)
		const second = renderGeneratedFile(entries)

		expect(first).toBe(second)
	})
})
