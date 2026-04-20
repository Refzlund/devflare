import { apiDelete, apiGetAll, apiPost, apiPut, type APIClientOptions } from './api'
import type {
	AccountOwnedAPIToken,
	AccountOwnedAPITokenDeleteResult,
	AccountOwnedAPITokenPolicy,
	AccountTokenPermissionGroup
} from './types'

const MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS = 300
export const DEVFLARE_MANAGED_TOKEN_PREFIX = 'devflare-'
const ACCOUNT_OWNED_TOKEN_SCOPE = 'com.cloudflare.api.account'

const ACCOUNT_API_TOKENS_PERMISSION_GROUP_NAME_PATTERN = /^Account API Tokens\b/i
const DEVFLARE_MANAGED_TOKEN_NAME_PATTERN = /^devflare-/i

const DEVFLARE_PERMISSION_GROUP_NAME_PATTERNS = [
	/^Account Analytics Read$/i,
	/^Account Settings Read$/i,
	/^Analytics Read$/i,
	/^AI /i,
	/^Browser Rendering /i,
	/^D1 (Metadata Read|Read|Write)$/i,
	/^Email (Routing|Sending) /i,
	/^Hyperdrive /i,
	/^Queues /i,
	/^Vectorize /i,
	/^Workers /i
] as const

/**
 * Symbolic names for individual Cloudflare permission groups we care about
 * when reasoning about a Devflare token policy. Stable ids (when known)
 * should be preferred over display names, which Cloudflare is free to
 * rename or localize at any time.
 *
 * Entries set to `undefined` have not been confidently verified against
 * Cloudflare's public docs at authoring time and fall back to exact
 * display-name matching via {@link KNOWN_PERMISSION_GROUP_DISPLAY_NAMES}.
 * Replace with the real UUID returned by
 * `GET /accounts/:id/tokens/permission_groups` when verified.
 */
export const KNOWN_PERMISSION_GROUP_IDS = {
	// TODO: id not verified from Cloudflare public docs at authoring time.
	WORKERS_SCRIPTS_WRITE: undefined,
	// TODO: id not verified from Cloudflare public docs at authoring time.
	WORKERS_SCRIPTS_READ: undefined,
	// TODO: id not verified from Cloudflare public docs at authoring time.
	ACCOUNT_SETTINGS_READ: undefined,
	// TODO: id not verified from Cloudflare public docs at authoring time.
	WORKERS_KV_STORAGE_WRITE: undefined,
	// TODO: id not verified from Cloudflare public docs at authoring time.
	WORKERS_KV_STORAGE_READ: undefined,
	// TODO: id not verified from Cloudflare public docs at authoring time.
	ACCOUNT_API_TOKENS_WRITE: undefined,
	// TODO: id not verified from Cloudflare public docs at authoring time.
	ACCOUNT_API_TOKENS_READ: undefined
} satisfies Record<string, string | undefined>

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
		return permissionGroup.scopes.some((scope) => scope.trim() === ACCOUNT_OWNED_TOKEN_SCOPE)
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
			'Could not find any reusable account-scoped Cloudflare permission groups for this Devflare token.'
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
		permissionGroupIds: string[]
	},
	clientOptions?: APIClientOptions
): Promise<AccountOwnedAPIToken> {
	const permissionGroupIds = dedupePermissionGroupIds(options.permissionGroupIds)

	if (permissionGroupIds.length === 0) {
		throw new Error('Cannot create a Devflare token without any permission groups')
	}

	if (permissionGroupIds.length > MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS) {
		throw new Error(
			`Cannot create a Devflare token with more than ${MAX_ACCOUNT_OWNED_TOKEN_PERMISSION_GROUPS} permission groups.`
		)
	}

	const createdToken = await apiPost<RawAccountOwnedAPIToken>(
		`/accounts/${accountId}/tokens`,
		{
			name: options.name,
			policies: [
				{
					effect: 'allow',
					resources: {
						[`com.cloudflare.api.account.${accountId}`]: '*'
					},
					permission_groups: permissionGroupIds.map((id) => ({ id }))
				}
			]
		},
		clientOptions
	)

	return mapAccountOwnedAPIToken(createdToken)
}