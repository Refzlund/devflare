// =============================================================================
// Wrangler Authentication Utilities
// =============================================================================
// Utilities for checking wrangler login status and remote binding requirements
// =============================================================================

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { DevflareConfig } from '../config/schema'

const execAsync = promisify(exec)

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface WranglerAuthStatus {
	loggedIn: boolean
	accountId?: string
	email?: string
	error?: string
}

export interface RemoteBindingCheck {
	hasRemoteBindings: boolean
	remoteBindings: string[]
	missingAccountId: boolean
	notLoggedIn: boolean
}

// -----------------------------------------------------------------------------
// Remote Binding Detection
// -----------------------------------------------------------------------------

/**
 * Check if the config contains any bindings that require remote access
 */
export function detectRemoteBindings(config: DevflareConfig): string[] {
	const remoteBindings: string[] = []
	const bindings = config.bindings

	if (!bindings) return remoteBindings

	// AI binding
	if (bindings.ai) {
		remoteBindings.push(`AI (binding: ${bindings.ai.binding})`)
	}

	// Vectorize bindings
	if (bindings.vectorize) {
		for (const [name] of Object.entries(bindings.vectorize)) {
			remoteBindings.push(`Vectorize (binding: ${name})`)
		}
	}

	return remoteBindings
}

// -----------------------------------------------------------------------------
// Wrangler Auth Check
// -----------------------------------------------------------------------------

/**
 * Check if wrangler is logged in by running `wrangler whoami`
 *
 * Returns:
 * - loggedIn: true if user is authenticated
 * - accountId: the account ID if available
 * - email: the email if available
 * - error: error message if check failed
 */
export async function checkWranglerAuth(): Promise<WranglerAuthStatus> {
	try {
		const { stdout, stderr } = await execAsync('bunx wrangler whoami', {
			timeout: 15000 // 15 second timeout
		})

		const output = stdout + stderr

		// Check for "not authenticated" or similar messages
		if (
			output.includes('not authenticated') ||
			output.includes('Not logged in') ||
			output.includes('wrangler login')
		) {
			return {
				loggedIn: false,
				error: 'Not logged in to Wrangler'
			}
		}

		// Try to extract account info from output
		// Example output: "👋 You are logged in with an OAuth Token, associated with the email example@domain.com!"
		// Or: "Account ID: abc123..."
		const emailMatch = output.match(/email[:\s]+([^\s!]+)/i)
		const accountMatch = output.match(/Account\s+ID[:\s]+([a-f0-9]+)/i)

		return {
			loggedIn: true,
			email: emailMatch?.[1],
			accountId: accountMatch?.[1]
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error)

		// If wrangler command fails, user is likely not logged in
		if (msg.includes('ENOENT') || msg.includes('not found')) {
			return {
				loggedIn: false,
				error: 'Wrangler not installed. Run: npm install -g wrangler'
			}
		}

		return {
			loggedIn: false,
			error: msg
		}
	}
}

// -----------------------------------------------------------------------------
// Combined Check
// -----------------------------------------------------------------------------

/**
 * Check if remote bindings are properly configured
 *
 * Returns warnings if:
 * - Config has remote-only bindings but no accountId
 * - Config has remote-only bindings but user is not logged in to wrangler
 */
export async function checkRemoteBindingRequirements(
	config: DevflareConfig
): Promise<RemoteBindingCheck> {
	const remoteBindings = detectRemoteBindings(config)

	if (remoteBindings.length === 0) {
		return {
			hasRemoteBindings: false,
			remoteBindings: [],
			missingAccountId: false,
			notLoggedIn: false
		}
	}

	// Check if accountId is set
	const missingAccountId = !config.accountId

	// Check wrangler auth status
	const authStatus = await checkWranglerAuth()
	const notLoggedIn = !authStatus.loggedIn

	return {
		hasRemoteBindings: true,
		remoteBindings,
		missingAccountId,
		notLoggedIn
	}
}
