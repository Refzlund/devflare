// =============================================================================
// Wrangler Auth Extraction
// =============================================================================
// Extracts usable API token from wrangler's config or via `wrangler auth token`
// 
// Strategy:
// 1. Read oauth_token + expiration_time from wrangler's config file (fast)
// 2. If token is valid (not expired), use it directly
// 3. If expired, call `wrangler auth token` to refresh (slow but necessary)
// =============================================================================

import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import type { WranglerAuth } from './types'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const WRANGLER_CONFIG_FILE = 'config/default.toml'

// Buffer before expiration to trigger refresh (5 minutes)
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

// In-memory cache (for repeated calls within same process)
let cachedToken: string | null = null
let cacheExpiresAt = 0

/**
 * Invalidate the cached token (call when API returns auth error)
 * This forces the next getApiToken() call to refresh via wrangler
 */
export function invalidateToken(): void {
	cachedToken = null
	cacheExpiresAt = 0
}

// -----------------------------------------------------------------------------
// Path Resolution
// -----------------------------------------------------------------------------

/**
 * Get possible paths to wrangler's config file
 * Returns array of paths to check, in order of priority
 */
function getWranglerConfigPaths(): string[] {
	const paths: string[] = []

	// Windows: %APPDATA%\xdg.config\.wrangler
	if (process.platform === 'win32' && process.env.APPDATA) {
		paths.push(join(process.env.APPDATA, 'xdg.config', '.wrangler', WRANGLER_CONFIG_FILE))
	}

	// XDG_CONFIG_HOME (cross-platform)
	if (process.env.XDG_CONFIG_HOME) {
		paths.push(join(process.env.XDG_CONFIG_HOME, '.wrangler', WRANGLER_CONFIG_FILE))
	}

	// Standard Unix location: ~/.wrangler
	paths.push(join(homedir(), '.wrangler', WRANGLER_CONFIG_FILE))

	return paths
}

/**
 * Get the path to wrangler's config file (first existing path)
 */
export function getWranglerConfigPath(): string | null {
	const paths = getWranglerConfigPaths()

	for (const path of paths) {
		if (existsSync(path)) {
			return path
		}
	}

	return null
}

/**
 * Check if wrangler config file exists
 */
export function hasWranglerConfig(): boolean {
	return getWranglerConfigPath() !== null
}

/**
 * Parse TOML-like config file (simple parser for wrangler's format).
 *
 * Wrangler's OAuth config is flat root-section key/value pairs. Any keys
 * inside a `[section]` header are deliberately ignored so that a future
 * wrangler release that adds a section does not silently leak unrelated
 * keys into our lookup (e.g. a `[section]\noauth_token = "x"` under a
 * non-root section would otherwise be picked up as the root token).
 */
function parseSimpleToml(content: string): Record<string, string> {
	const result: Record<string, string> = {}
	const lines = content.split('\n')
	let inRootSection = true

	for (const line of lines) {
		const trimmed = line.trim()

		// Skip comments and empty lines
		if (trimmed.startsWith('#') || trimmed === '') continue

		// Track section headers: we only accept keys from the implicit root
		// section (before any `[section]` header).
		if (trimmed.startsWith('[')) {
			inRootSection = false
			continue
		}

		if (!inRootSection) continue

		// Parse key = "value" or key = 'value'
		const match = trimmed.match(/^(\w+)\s*=\s*["'](.*)["']$/)
		if (match) {
			result[match[1]] = match[2]
		}
	}

	return result
}

/**
 * Extract OAuth token info from wrangler's stored configuration (sync)
 * Returns token and expiration time if available
 */
function readWranglerConfig(): { token: string; expiresAt: Date } | null {
	const configPath = getWranglerConfigPath()

	if (!configPath || !existsSync(configPath)) {
		return null
	}

	try {
		const content = readFileSync(configPath, 'utf-8')
		const config = parseSimpleToml(content)

		const token = config.oauth_token
		const expirationTime = config.expiration_time

		if (token && expirationTime) {
			return {
				token,
				expiresAt: new Date(expirationTime)
			}
		}

		return null
	} catch {
		return null
	}
}

/**
 * Extract OAuth token info from wrangler's stored configuration
 */
export async function getWranglerAuth(): Promise<WranglerAuth | null> {
	const config = readWranglerConfig()
	if (!config) return null

	const configPath = getWranglerConfigPath()
	if (!configPath) return null

	try {
		const content = readFileSync(configPath, 'utf-8')
		const parsed = parseSimpleToml(content)

		return {
			oauthToken: parsed.oauth_token,
			refreshToken: parsed.refresh_token,
			expiresAt: config.expiresAt
		}
	} catch {
		return null
	}
}

/**
 * Refresh the token via `wrangler auth token` command
 * This is slow (~2-3s) so only called when necessary
 */
function refreshWranglerToken(): string | null {
	try {
		// Use bunx for faster startup than npx
		const result = execSync('bunx wrangler auth token', {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout: 15000
		})

		// Extract token from output (last non-empty line)
		const lines = result.trim().split(/\r?\n/).filter((l) => l.trim().length > 0)
		const token = lines[lines.length - 1]?.trim()

		if (token && token.length >= 20 && !token.includes('wrangler') && !token.includes('⛅')) {
			return token
		}

		return null
	} catch {
		return null
	}
}

/**
 * Get the API token to use for Cloudflare API requests
 * 
 * Strategy (fast path first):
 * 1. Check in-memory cache (unless forceRefresh)
 * 2. Check CLOUDFLARE_API_TOKEN env var
 * 3. Read token from wrangler config (if not expired)
 * 4. Call `wrangler auth token` to refresh (slow, only when needed)
 * 
 * @param forceRefresh - Skip cache and force a refresh via wrangler
 */
export async function getApiToken(forceRefresh = false): Promise<string | null> {
	// 1. Check in-memory cache (unless forcing refresh)
	if (!forceRefresh && cachedToken && Date.now() < cacheExpiresAt) {
		return cachedToken
	}

	// 2. Check environment variable (always takes priority, can't be refreshed)
	const envToken = process.env.CLOUDFLARE_API_TOKEN
	if (envToken) {
		return envToken
	}

	// 3. Try to read from wrangler config (fast path, unless forcing refresh)
	if (!forceRefresh) {
		const config = readWranglerConfig()
		if (config) {
			const now = Date.now()
			const expiresAt = config.expiresAt.getTime()

			// If token is valid (with buffer), use it directly
			if (now < expiresAt - EXPIRY_BUFFER_MS) {
				cachedToken = config.token
				cacheExpiresAt = expiresAt - EXPIRY_BUFFER_MS
				return config.token
			}
		}
	}

	// 4. Token expired, missing, or forced refresh - call wrangler (slow path)
	const refreshedToken = refreshWranglerToken()
	if (refreshedToken) {
		// Cache for 5 minutes (wrangler will have updated the config file)
		cachedToken = refreshedToken
		cacheExpiresAt = Date.now() + EXPIRY_BUFFER_MS
		return refreshedToken
	}

	return null
}

/**
 * Check if we have valid authentication
 */
export async function isAuthenticated(): Promise<boolean> {
	const token = await getApiToken()
	return token !== null
}
