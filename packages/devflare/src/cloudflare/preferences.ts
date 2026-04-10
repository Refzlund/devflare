// =============================================================================
// Account Preferences Module
// =============================================================================
// Stores and retrieves account preferences (global default, etc.)
// 
// Storage Locations:
// - Global default: Stored in devflare KV namespace in user's Cloudflare account
//                   AND cached locally in ~/.devflare/preferences.json
// - Workspace default: Stored in package.json as "devflare.accountId"
// =============================================================================

import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { apiGet, apiPost, kvGet, kvPut } from './api'
import type { KVNamespace } from './types'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEVFLARE_KV_NAMESPACE_TITLE = 'devflare-usage'
const GLOBAL_ACCOUNT_KEY = 'settings:defaultAccountId'
const LOCAL_CACHE_DIR = '.devflare'
const LOCAL_CACHE_FILE = 'preferences.json'

// -----------------------------------------------------------------------------
// Local Cache
// -----------------------------------------------------------------------------

interface LocalPreferences {
	defaultAccountId?: string
	lastUpdated?: string
}

/**
 * Get the path to the local preferences file
 */
function getLocalPreferencesPath(): string {
	return join(homedir(), LOCAL_CACHE_DIR, LOCAL_CACHE_FILE)
}

/**
 * Read local preferences from disk
 */
function readLocalPreferences(): LocalPreferences {
	const path = getLocalPreferencesPath()
	if (!existsSync(path)) {
		return {}
	}

	try {
		const content = readFileSync(path, 'utf-8')
		return JSON.parse(content) as LocalPreferences
	} catch {
		return {}
	}
}

/**
 * Write local preferences to disk
 */
function writeLocalPreferences(prefs: LocalPreferences): void {
	const path = getLocalPreferencesPath()
	const dir = join(homedir(), LOCAL_CACHE_DIR)

	// Ensure directory exists
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}

	writeFileSync(path, JSON.stringify(prefs, null, '\t'), 'utf-8')
}

// -----------------------------------------------------------------------------
// Workspace Preferences (package.json)
// -----------------------------------------------------------------------------

interface PackageJson {
	devflare?: {
		accountId?: string
	}
	[key: string]: unknown
}

/**
 * Find the nearest package.json (searching upward from cwd)
 */
function findPackageJsonPath(startDir?: string): string | null {
	let dir = startDir ?? process.cwd()

	// Walk up the directory tree
	while (dir !== join(dir, '..')) {
		const pkgPath = join(dir, 'package.json')
		if (existsSync(pkgPath)) {
			return pkgPath
		}
		dir = join(dir, '..')
	}

	return null
}

/**
 * Read package.json from a path
 */
function readPackageJson(path: string): PackageJson | null {
	try {
		const content = readFileSync(path, 'utf-8')
		return JSON.parse(content) as PackageJson
	} catch {
		return null
	}
}

/**
 * Write package.json to a path
 */
function writePackageJson(path: string, pkg: PackageJson): void {
	writeFileSync(path, JSON.stringify(pkg, null, '\t') + '\n', 'utf-8')
}

/**
 * Get workspace account ID from nearest package.json
 */
export function getWorkspaceAccountId(): string | null {
	const pkgPath = findPackageJsonPath()
	if (!pkgPath) return null

	const pkg = readPackageJson(pkgPath)
	return pkg?.devflare?.accountId ?? null
}

/**
 * Set workspace account ID in nearest package.json
 * Creates package.json if it doesn't exist
 */
export function setWorkspaceAccountId(accountId: string): string {
	let pkgPath = findPackageJsonPath()
	let pkg: PackageJson

	if (pkgPath) {
		pkg = readPackageJson(pkgPath) ?? {}
	} else {
		// Create a new package.json in cwd
		pkgPath = join(process.cwd(), 'package.json')
		pkg = {
			name: 'workspace',
			private: true
		}
	}

	// Ensure devflare object exists
	if (!pkg.devflare) {
		pkg.devflare = {}
	}

	pkg.devflare.accountId = accountId

	writePackageJson(pkgPath, pkg)

	return pkgPath
}

// -----------------------------------------------------------------------------
// Cloud KV Storage
// -----------------------------------------------------------------------------

/**
 * Find or create the devflare-managed KV namespace
 * (Reuses the same namespace as usage tracking)
 */
async function getOrCreatePreferencesNamespace(accountId: string): Promise<string> {
	// First, try to find existing namespace
	const namespaces = await apiGet<KVNamespace[]>(
		`/accounts/${accountId}/storage/kv/namespaces`
	)

	const existing = namespaces.find((ns) => ns.title === DEVFLARE_KV_NAMESPACE_TITLE)
	if (existing) {
		return existing.id
	}

	// Create new namespace
	const created = await apiPost<KVNamespace>(
		`/accounts/${accountId}/storage/kv/namespaces`,
		{ title: DEVFLARE_KV_NAMESPACE_TITLE }
	)

	return created.id
}

// -----------------------------------------------------------------------------
// Global Default Account
// -----------------------------------------------------------------------------

/**
 * Get the global default account ID
 * 
 * Priority:
 * 1. Local cache (fast, no network)
 * 2. Cloud KV (if local cache is missing)
 * 
 * Returns null if no default is set
 */
export async function getGlobalDefaultAccountId(
	fallbackAccountId: string
): Promise<string | null> {
	// 1. Check local cache first (fast)
	const local = readLocalPreferences()
	if (local.defaultAccountId) {
		return local.defaultAccountId
	}

	// 2. Check cloud KV (requires an account to read from)
	try {
		const namespaceId = await getOrCreatePreferencesNamespace(fallbackAccountId)
		const value = await kvGet(fallbackAccountId, namespaceId, GLOBAL_ACCOUNT_KEY)

		if (value) {
			// Cache locally for next time
			writeLocalPreferences({
				...local,
				defaultAccountId: value,
				lastUpdated: new Date().toISOString()
			})
			return value
		}
	} catch {
		// If we can't access KV, just return null
	}

	return null
}

/**
 * Set the global default account ID
 * Saves to both local cache and cloud KV
 * 
 * @param accountId - The account ID to set as default
 * @param anyAccountId - Any account ID to use for accessing KV (can be the same)
 */
export async function setGlobalDefaultAccountId(
	accountId: string,
	anyAccountId?: string
): Promise<void> {
	const kvAccountId = anyAccountId ?? accountId

	// 1. Save to local cache immediately (fast)
	const local = readLocalPreferences()
	writeLocalPreferences({
		...local,
		defaultAccountId: accountId,
		lastUpdated: new Date().toISOString()
	})

	// 2. Save to cloud KV (for sync across machines)
	try {
		const namespaceId = await getOrCreatePreferencesNamespace(kvAccountId)
		await kvPut(kvAccountId, namespaceId, GLOBAL_ACCOUNT_KEY, accountId)
	} catch {
		// Local save succeeded, cloud save failed - that's okay
		// User can sync again later
	}
}

/**
 * Get the effective account ID to use
 * 
 * Priority:
 * 1. Workspace (package.json) - highest priority
 * 2. Global default (local cache + cloud KV)
 * 3. Primary account (first account in list)
 * 
 * @param primaryAccountId - The primary account ID to use as fallback
 */
export async function getEffectiveAccountId(
	primaryAccountId: string
): Promise<{ accountId: string; source: 'workspace' | 'global' | 'primary' }> {
	// 1. Check workspace first
	const workspaceId = getWorkspaceAccountId()
	if (workspaceId) {
		return { accountId: workspaceId, source: 'workspace' }
	}

	// 2. Check global default
	const globalId = await getGlobalDefaultAccountId(primaryAccountId)
	if (globalId) {
		return { accountId: globalId, source: 'global' }
	}

	// 3. Use primary account
	return { accountId: primaryAccountId, source: 'primary' }
}

/**
 * Clear the global default account ID (both local and cloud)
 */
export async function clearGlobalDefaultAccountId(
	anyAccountId: string
): Promise<void> {
	// Clear local cache
	const local = readLocalPreferences()
	delete local.defaultAccountId
	local.lastUpdated = new Date().toISOString()
	writeLocalPreferences(local)

	// Clear from cloud KV
	try {
		const namespaceId = await getOrCreatePreferencesNamespace(anyAccountId)
		// Write empty string to clear (KV doesn't have delete in our simple helper)
		await kvPut(anyAccountId, namespaceId, GLOBAL_ACCOUNT_KEY, '')
	} catch {
		// Ignore errors
	}
}
