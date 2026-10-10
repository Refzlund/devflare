// =============================================================================
// Remote Mode Configuration
// =============================================================================
// Stores remote mode settings locally to avoid setting env vars every time.
// File location: ~/.devflare/remote.json
// =============================================================================

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Minimum duration in minutes */
const MIN_MINUTES = 1
/** Maximum duration in minutes (24 hours) */
const MAX_MINUTES = 1440

interface RemoteConfig {
	/** Unix timestamp (ms) when remote mode expires */
	expiresAt: number
	/** When remote mode was enabled */
	enabledAt: number
	/** Duration in minutes */
	durationMinutes: number
}

// -----------------------------------------------------------------------------
// Config Path
// -----------------------------------------------------------------------------

function getConfigDir(): string {
	return join(homedir(), '.devflare')
}

function getConfigPath(): string {
	return join(getConfigDir(), 'remote.json')
}

// -----------------------------------------------------------------------------
// Read/Write Config
// -----------------------------------------------------------------------------

function readConfig(): RemoteConfig | null {
	const path = getConfigPath()
	if (!existsSync(path)) return null
	try {
		const content = readFileSync(path, 'utf-8')
		return JSON.parse(content) as RemoteConfig
	} catch {
		return null
	}
}

function writeConfig(config: RemoteConfig): void {
	const dir = getConfigDir()
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}
	writeFileSync(getConfigPath(), JSON.stringify(config, null, '\t'))
}

function deleteConfig(): void {
	const path = getConfigPath()
	if (existsSync(path)) {
		try {
			unlinkSync(path)
		} catch {
			// File may be locked (Windows) or deleted by another process
		}
	}
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable remote mode for a given duration.
 * @param minutes Duration in minutes (default: 30, clamped to 1-1440)
 * @returns The validated minutes value actually used
 */
export function enableRemoteMode(minutes = 30): number {
	// Validate and clamp
	const validMinutes = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.floor(minutes) || 30))

	const now = Date.now()
	writeConfig({
		enabledAt: now,
		expiresAt: now + validMinutes * 60 * 1000,
		durationMinutes: validMinutes
	})

	return validMinutes
}

/**
 * Disable remote mode immediately.
 */
export function disableRemoteMode(): void {
	deleteConfig()
}

/**
 * Get the current remote mode status from stored config.
 * Note: Use getEffectiveRemoteModeStatus() to also include env var override.
 * @returns Status object with isEnabled, remainingMinutes, and expiresAt
 */
export function getRemoteModeStatus(): {
	isEnabled: boolean
	remainingMinutes: number
	expiresAt: Date | null
} {
	const config = readConfig()
	if (!config) {
		return { isEnabled: false, remainingMinutes: 0, expiresAt: null }
	}

	const now = Date.now()
	if (now >= config.expiresAt) {
		// Expired - clean up
		deleteConfig()
		return { isEnabled: false, remainingMinutes: 0, expiresAt: null }
	}

	const remainingMs = config.expiresAt - now
	const remainingMinutes = Math.ceil(remainingMs / 60000)

	return {
		isEnabled: true,
		remainingMinutes,
		expiresAt: new Date(config.expiresAt)
	}
}

/**
 * Get the effective remote mode status including env var override.
 * @returns Status object with isActive, source, and config details
 */
export function getEffectiveRemoteModeStatus(): {
	isActive: boolean
	source: 'env' | 'config' | 'none'
	remainingMinutes: number
	expiresAt: Date | null
	envVarSet: boolean
} {
	// Check env var first
	const envValue = process.env.DEVFLARE_REMOTE ?? ''
	const envVarSet = ['1', 'true', 'yes'].includes(envValue.toLowerCase())

	if (envVarSet) {
		return {
			isActive: true,
			source: 'env',
			remainingMinutes: Number.POSITIVE_INFINITY,
			expiresAt: null,
			envVarSet: true
		}
	}

	// Check stored config
	const status = getRemoteModeStatus()
	if (status.isEnabled) {
		return {
			isActive: true,
			source: 'config',
			remainingMinutes: status.remainingMinutes,
			expiresAt: status.expiresAt,
			envVarSet: false
		}
	}

	return {
		isActive: false,
		source: 'none',
		remainingMinutes: 0,
		expiresAt: null,
		envVarSet: false
	}
}

/**
 * Check if remote mode is currently enabled.
 * Checks both env var (DEVFLARE_REMOTE=1) and stored config.
 */
export function isRemoteModeActive(): boolean {
	// Check env var first (for CI/CD or explicit override)
	const envValue = process.env.DEVFLARE_REMOTE ?? ''
	if (['1', 'true', 'yes'].includes(envValue.toLowerCase())) {
		return true
	}

	// Check stored config
	const status = getRemoteModeStatus()
	return status.isEnabled
}
