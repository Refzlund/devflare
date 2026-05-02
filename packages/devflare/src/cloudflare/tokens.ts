import { apiDelete, apiGetAll, apiPost, apiPut, type APIClientOptions } from './api'
import { KNOWN_PERMISSION_GROUP_IDS_DATA } from './known-permission-group-ids.generated'
import type {
	AccountOwnedAPIToken,
	AccountOwnedAPITokenDeleteResult,
	AccountOwnedAPITokenPolicy,
	AccountTokenPermissionGroup
} from './types'

const MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS = 300
export const DEVFLARE_MANAGED_TOKEN_PREFIX = 'devflare-'
const ACCOUNT_OWNED_TOKEN_SCOPE = 'com.cloudflare.api.account'
const ACCOUNT_ZONE_OWNED_TOKEN_SCOPE = 'com.cloudflare.api.account.zone'

const ACCOUNT_API_TOKENS_PERMISSION_GROUP_NAME_PATTERN = /^Account API Tokens\b/i
const DEVFLARE_MANAGED_TOKEN_NAME_PATTERN = /^devflare-/i

// Devflare-managed tokens must include every variant (Read / Write / Edit /
// Admin / Metadata Read / etc.) of every product permission group it touches.
// Cloudflare's REST endpoints often distinguish read vs. edit vs. admin
// operations on the *same* resource (e.g. listing R2 buckets requires the
// "Workers R2 Storage" read permission while creating a bucket requires the
// edit permission), so granting only one variant deterministically breaks
// downstream provisioning. Each pattern below intentionally matches the full
// product family (`/^Product /i`) rather than a specific verb, so any new
// variant Cloudflare publishes — including new admin tiers — gets picked up
// automatically when the token is (re-)created.
const DEVFLARE_PERMISSION_GROUP_NAME_PATTERNS = [
	/^Account Analytics /i,
	/^Account Settings /i,
	/^Account Filter Lists /i,
	/^AI /i,
	/^Analytics /i,
	/^Browser Rendering /i,
	/^Cache Purge\b/i,
	/^D1 /i,
	/^DNS /i,
	/^Email /i,
	/^Hyperdrive /i,
	/^Images /i,
	/^Logs /i,
	/^Logpush /i,
	/^Pages /i,
	/^Queues /i,
	/^R2 /i,
	/^SSL and Certificates /i,
	/^Stream /i,
	/^Vectorize /i,
	/^Workers /i,
	/^Zone Settings /i,
	/^Zone /i
] as const

/**
 * Symbolic names for individual Cloudflare permission groups we care about
 * when reasoning about a Devflare token policy. Stable ids (when known)
 * should be preferred over display names, which Cloudflare is free to
 * rename or localize at any time.
 *
 * Entries set to `undefined` have not been confidently verified against
 * Cloudflare's `GET /accounts/:id/tokens/permission_groups` endpoint and
 * fall back to exact display-name matching via
 * {@link KNOWN_PERMISSION_GROUP_DISPLAY_NAMES}.
 *
 * The verified UUIDs (or `null` placeholders) live in
 * `known-permission-group-ids.generated.ts`, which is rewritten by
 * `scripts/refresh-permission-groups.ts` against a maintainer's Cloudflare
 * account so this file does not need hand-edits when Cloudflare publishes
 * or rotates permission-group ids.
 */
function deriveKnownPermissionGroupIds<TKey extends string>(
	data: Record<TKey, string | null>
): Record<TKey, string | undefined> {
	const result = {} as Record<TKey, string | undefined>
	for (const key of Object.keys(data) as TKey[]) {
		const value = data[key]
		result[key] = value === null ? undefined : value
	}
	return result
}

export const KNOWN_PERMISSION_GROUP_IDS = deriveKnownPermissionGroupIds(
	KNOWN_PERMISSION_GROUP_IDS_DATA
) satisfies Record<string, string | undefined>

/**
 * Canonical display names used for exact-match fallback when the
 * corresponding id in {@link KNOWN_PERMISSION_GROUP_IDS} is not verified.
 *
 * Exact matches only — no substring / case-insensitive matching — so
 * drift (e.g. Cloudflare adding a suffix or renaming) is caught rather
 * than silently mis-matching.
 */
export const KNOWN_PERMISSION_GROUP_DISPLAY_NAMES: Record<
	keyof typeof KNOWN_PERMISSION_GROUP_IDS,
	string
> = {
	WORKERS_SCRIPTS_WRITE: 'Workers Scripts Write',
	WORKERS_SCRIPTS_READ: 'Workers Scripts Read',
	ACCOUNT_SETTINGS_READ: 'Account Settings Read',
	WORKERS_KV_STORAGE_WRITE: 'Workers KV Storage Write',
	WORKERS_KV_STORAGE_READ: 'Workers KV Storage Read',
	ACCOUNT_API_TOKENS_WRITE: 'Account API Tokens Write',
	ACCOUNT_API_TOKENS_READ: 'Account API Tokens Read'
}

export type KnownPermissionGroupName = keyof typeof KNOWN_PERMISSION_GROUP_IDS

/**
 * Match a Cloudflare permission group against a known symbolic name,
 * preferring the stable id and falling back to an *exact* display-name
 * match. Logs a `console.warn` on fallback so drift is visible in logs.
 *
 * The `options` hook exists so callers (and tests) can supply their own
 * id / display-name tables without mutating the module-level maps.
 */
export function matchesKnownPermissionGroup(
	symbolicName: KnownPermissionGroupName,
	permissionGroup: Pick<AccountTokenPermissionGroup, 'id' | 'name'>,
	options?: {
		knownIds?: Record<string, string | undefined>
		knownDisplayNames?: Record<string, string>
	}
): boolean {
	const knownIds = options?.knownIds ?? KNOWN_PERMISSION_GROUP_IDS
	const knownDisplayNames = options?.knownDisplayNames ?? KNOWN_PERMISSION_GROUP_DISPLAY_NAMES

	const expectedId = knownIds[symbolicName]
	if (typeof expectedId === 'string' && expectedId.length > 0) {
		return permissionGroup.id === expectedId
	}

	const expectedName = knownDisplayNames[symbolicName]
	if (typeof expectedName === 'string' && permissionGroup.name === expectedName) {
		console.warn(
			`[devflare] Matched Cloudflare permission group '${symbolicName}' by display name `
			+ `('${expectedName}') because no verified id is configured. Cloudflare display `
			+ 'names are unstable; please file an issue to add the permission-group id to '
			+ 'KNOWN_PERMISSION_GROUP_IDS.'
		)
		return true
	}

	return false
}

// Cloudflare lets a bootstrap token manage API tokens, but it does not allow the
// created sub-token to inherit token-management permissions. Devflare therefore
// uses the bootstrap token for minting and excludes Account API Tokens permissions
// from the resulting reusable Devflare token.

interface RawAccountOwnedAPITokenPolicy {
	id?: string
	effect?: 'allow' | 'deny'
	permission_groups?: Array<{
		id: string
		name?: string
	}>
}

interface RawAccountOwnedAPIToken {
	id: string
	name?: string
	status?: string
	value?: string
	issued_on?: string
	modified_on?: string
	last_used_on?: string
	policies?: RawAccountOwnedAPITokenPolicy[]
}

interface AccountOwnedAPITokenCreatePolicy {
	effect: 'allow'
	resources: Record<string, unknown>
	permission_groups: Array<{ id: string }>
}

type ScopedPermissionGroup = Pick<AccountTokenPermissionGroup, 'id' | 'scopes'>

function dedupePermissionGroups(
	permissionGroups: AccountTokenPermissionGroup[]
): AccountTokenPermissionGroup[] {
	const seenIds = new Set<string>()

	return permissionGroups.filter((permissionGroup) => {
		if (seenIds.has(permissionGroup.id)) {
			return false
		}

		seenIds.add(permissionGroup.id)
		return true
	})
}

function dedupePermissionGroupIds(permissionGroupIds: string[]): string[] {
	return Array.from(new Set(permissionGroupIds.map((id) => id.trim()).filter(Boolean)))
}

function dedupeScopedPermissionGroups(
	permissionGroups: ScopedPermissionGroup[]
): ScopedPermissionGroup[] {
	const seenIds = new Set<string>()

	return permissionGroups.filter((permissionGroup) => {
		const id = permissionGroup.id.trim()
		if (!id || seenIds.has(id)) {
			return false
		}

		seenIds.add(id)
		return true
	})
}

function permissionGroupHasScope(
	permissionGroup: ScopedPermissionGroup,
	scope: string
): boolean {
	return permissionGroup.scopes.some((value) => value.trim() === scope)
}

function buildCreateTokenPoliciesFromPermissionGroups(
	accountId: string,
	permissionGroups: ScopedPermissionGroup[]
): AccountOwnedAPITokenCreatePolicy[] {
	const dedupedPermissionGroups = dedupeScopedPermissionGroups(permissionGroups)
	const accountPermissionGroupIds = dedupePermissionGroupIds(
		dedupedPermissionGroups
			.filter((permissionGroup) => permissionGroupHasScope(permissionGroup, ACCOUNT_OWNED_TOKEN_SCOPE))
			.map((permissionGroup) => permissionGroup.id)
	)
	const zonePermissionGroupIds = dedupePermissionGroupIds(
		dedupedPermissionGroups
			.filter((permissionGroup) => permissionGroupHasScope(permissionGroup, ACCOUNT_ZONE_OWNED_TOKEN_SCOPE))
			.map((permissionGroup) => permissionGroup.id)
	)
	const policies: AccountOwnedAPITokenCreatePolicy[] = []

	if (accountPermissionGroupIds.length > 0) {
		policies.push({
			effect: 'allow',
			resources: {
				[`com.cloudflare.api.account.${accountId}`]: '*'
			},
			permission_groups: accountPermissionGroupIds.map((id) => ({ id }))
		})
	}

	if (zonePermissionGroupIds.length > 0) {
		policies.push({
			effect: 'allow',
			resources: {
				[`com.cloudflare.api.account.${accountId}`]: {
					[`${ACCOUNT_ZONE_OWNED_TOKEN_SCOPE}.*`]: '*'
				}
			},
			permission_groups: zonePermissionGroupIds.map((id) => ({ id }))
		})
	}

	return policies
}

function buildCreateTokenPoliciesFromPermissionGroupIds(
	accountId: string,
	permissionGroupIds: string[]
): AccountOwnedAPITokenCreatePolicy[] {
	const dedupedPermissionGroupIds = dedupePermissionGroupIds(permissionGroupIds)
	if (dedupedPermissionGroupIds.length === 0) {
		return []
	}

	return [
		{
			effect: 'allow',
			resources: {
				[`com.cloudflare.api.account.${accountId}`]: '*'
			},
			permission_groups: dedupedPermissionGroupIds.map((id) => ({ id }))
		}
	]
}

function excludeAccountApiTokensPermissionGroups(
	permissionGroups: AccountTokenPermissionGroup[]
): AccountTokenPermissionGroup[] {
	return permissionGroups.filter((permissionGroup) => {
		return !ACCOUNT_API_TOKENS_PERMISSION_GROUP_NAME_PATTERN.test(permissionGroup.name)
	})
}

function keepAccountOwnedTokenCompatiblePermissionGroups(
	permissionGroups: AccountTokenPermissionGroup[]
): AccountTokenPermissionGroup[] {
	return permissionGroups.filter((permissionGroup) => {
		return permissionGroup.scopes.some((scope) => {
			const normalizedScope = scope.trim()
			return normalizedScope === ACCOUNT_OWNED_TOKEN_SCOPE
				|| normalizedScope === ACCOUNT_ZONE_OWNED_TOKEN_SCOPE
		})
	})
}

function selectReusableAccountOwnedTokenPermissionGroups(
	permissionGroups: AccountTokenPermissionGroup[]
): AccountTokenPermissionGroup[] {
	return dedupePermissionGroups(
		excludeAccountApiTokensPermissionGroups(
			keepAccountOwnedTokenCompatiblePermissionGroups(permissionGroups)
		)
	)
}

function parseOptionalDate(value?: string): Date | undefined {
	if (!value) {
		return undefined
	}

	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function mapAccountOwnedAPITokenPolicy(
	policy: RawAccountOwnedAPITokenPolicy
): AccountOwnedAPITokenPolicy {
	return {
		id: policy.id,
		effect: policy.effect,
		permissionGroups: policy.permission_groups?.map((permissionGroup) => ({
			id: permissionGroup.id,
			name: permissionGroup.name
		}))
	}
}

function mapAccountOwnedAPIToken(token: RawAccountOwnedAPIToken): AccountOwnedAPIToken {
	return {
		id: token.id,
		name: token.name ?? token.id,
		status: token.status,
		value: token.value,
		issuedOn: parseOptionalDate(token.issued_on),
		modifiedOn: parseOptionalDate(token.modified_on),
		lastUsedOn: parseOptionalDate(token.last_used_on),
		policies: token.policies?.map(mapAccountOwnedAPITokenPolicy)
	}
}

export function isDevflareManagedTokenName(name: string): boolean {
	return DEVFLARE_MANAGED_TOKEN_NAME_PATTERN.test(name.trim())
}

export function normalizeDevflareTokenName(name: string): string {
	const trimmedName = name.trim()
	if (!trimmedName) {
		throw new Error('Devflare token name cannot be empty')
	}

	const suffix = isDevflareManagedTokenName(trimmedName)
		? trimmedName.replace(DEVFLARE_MANAGED_TOKEN_NAME_PATTERN, '')
		: trimmedName

	if (!suffix) {
		throw new Error('Devflare token name cannot be empty')
	}

	return `${DEVFLARE_MANAGED_TOKEN_PREFIX}${suffix}`
}

export function stripDevflareTokenNamePrefix(name: string): string {
	const trimmedName = name.trim()
	if (!trimmedName) {
		return trimmedName
	}

	const strippedName = trimmedName.replace(DEVFLARE_MANAGED_TOKEN_NAME_PATTERN, '')
	return strippedName || trimmedName
}

export function filterDevflareManagedTokens(
	tokens: AccountOwnedAPIToken[]
): AccountOwnedAPIToken[] {
	return tokens.filter((token) => isDevflareManagedTokenName(token.name))
}

export function selectDevflarePermissionGroups(
	permissionGroups: AccountTokenPermissionGroup[]
): AccountTokenPermissionGroup[] {
	const selectedPermissionGroups = dedupePermissionGroups(selectReusableAccountOwnedTokenPermissionGroups(permissionGroups).filter((permissionGroup) => {
		return DEVFLARE_PERMISSION_GROUP_NAME_PATTERNS.some((pattern) => {
			return pattern.test(permissionGroup.name)
		})
	}))

	if (selectedPermissionGroups.length === 0) {
		throw new Error(
			'Could not map the available Cloudflare permission groups to a Devflare token policy.'
		)
	}

	if (selectedPermissionGroups.length > MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS) {
		throw new Error(
			`Devflare selected ${selectedPermissionGroups.length} permission groups, which exceeds Cloudflare's ${MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS}-group limit for account-owned tokens.`
		)
	}

	return selectedPermissionGroups
}

export function selectAllReusablePermissionGroups(
	permissionGroups: AccountTokenPermissionGroup[]
): AccountTokenPermissionGroup[] {
	const selectedPermissionGroups = selectReusableAccountOwnedTokenPermissionGroups(permissionGroups)

	if (selectedPermissionGroups.length === 0) {
		throw new Error(
			'Could not find any reusable account/zone-scoped Cloudflare permission groups for this Devflare token.'
		)
	}

	if (selectedPermissionGroups.length > MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS) {
		throw new Error(
			`Devflare selected ${selectedPermissionGroups.length} permission groups, which exceeds Cloudflare\'s ${MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS}-group limit for account-owned tokens.`
		)
	}

	return selectedPermissionGroups
}

export async function listAccountTokenPermissionGroups(
	accountId: string,
	options?: APIClientOptions
): Promise<AccountTokenPermissionGroup[]> {
	const permissionGroups = await apiGetAll<AccountTokenPermissionGroup>(
		`/accounts/${accountId}/tokens/permission_groups`,
		options
	)

	return dedupePermissionGroups(permissionGroups)
}

export async function listAccountOwnedAPITokens(
	accountId: string,
	options?: APIClientOptions
): Promise<AccountOwnedAPIToken[]> {
	const tokens = await apiGetAll<RawAccountOwnedAPIToken>(`/accounts/${accountId}/tokens`, options)
	return tokens.map(mapAccountOwnedAPIToken)
}

export async function deleteAccountOwnedAPIToken(
	accountId: string,
	tokenId: string,
	options?: APIClientOptions
): Promise<AccountOwnedAPITokenDeleteResult> {
	return apiDelete<AccountOwnedAPITokenDeleteResult>(`/accounts/${accountId}/tokens/${tokenId}`, options)
}

export async function rollAccountOwnedAPITokenValue(
	accountId: string,
	tokenId: string,
	options?: APIClientOptions
): Promise<string> {
	return apiPut<string>(`/accounts/${accountId}/tokens/${tokenId}/value`, {}, options)
}

export async function createAccountOwnedAPIToken(
	accountId: string,
	options: {
		name: string
		permissionGroupIds?: string[]
		permissionGroups?: ScopedPermissionGroup[]
	},
	clientOptions?: APIClientOptions
): Promise<AccountOwnedAPIToken> {
	const permissionGroupIds = dedupePermissionGroupIds(
		options.permissionGroups?.map((permissionGroup) => permissionGroup.id)
			?? options.permissionGroupIds
			?? []
	)

	if (permissionGroupIds.length === 0) {
		throw new Error('Cannot create a Devflare token without any permission groups')
	}

	if (permissionGroupIds.length > MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS) {
		throw new Error(
			`Cannot create a Devflare token with more than ${MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS} permission groups.`
		)
	}

	const policies = options.permissionGroups
		? buildCreateTokenPoliciesFromPermissionGroups(accountId, options.permissionGroups)
		: buildCreateTokenPoliciesFromPermissionGroupIds(accountId, permissionGroupIds)

	if (policies.length === 0) {
		throw new Error('Cannot create a Devflare token without any account- or zone-scoped permission groups')
	}

	const createdToken = await apiPost<RawAccountOwnedAPIToken>(
		`/accounts/${accountId}/tokens`,
		{
			name: options.name,
			policies
		},
		clientOptions
	)

	return mapAccountOwnedAPIToken(createdToken)
}
