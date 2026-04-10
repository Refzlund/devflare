// =============================================================================
// Remote AI Binding — REST API implementation
// =============================================================================
// Provides an AI binding that calls Cloudflare's REST API directly.
// This allows testing AI functionality without a running dev server.
// =============================================================================

import { getApiToken } from '../cloudflare/auth'
import { getPrimaryAccount } from '../cloudflare/account'
import { getEffectiveAccountId } from '../cloudflare/preferences'

// -----------------------------------------------------------------------------
// Remote AI Binding
// -----------------------------------------------------------------------------

/**
 * Creates a remote AI binding that calls Cloudflare's REST API.
 * Matches the Workers AI binding interface.
 */
export function createRemoteAI(accountId?: string): Ai {
	let resolvedAccountId: string | null = null

	async function getAccountId(): Promise<string> {
		if (accountId) return accountId
		if (resolvedAccountId) return resolvedAccountId

		const primary = await getPrimaryAccount()
		if (!primary) {
			throw new Error('No Cloudflare account found. Run: bunx wrangler login')
		}

		const { accountId: effectiveId } = await getEffectiveAccountId(primary.id)
		resolvedAccountId = effectiveId
		return effectiveId
	}

	async function getToken(): Promise<string> {
		const token = await getApiToken()
		if (!token) {
			throw new Error('Not authenticated. Run: bunx wrangler login')
		}
		return token
	}

	// Create an object that implements the Ai interface via REST API
	// Use type assertion since we're implementing via REST, not the native binding
	const ai = {
		async run(model: string, inputs: unknown): Promise<unknown> {
			const [acctId, token] = await Promise.all([getAccountId(), getToken()])

			const url = `https://api.cloudflare.com/client/v4/accounts/${acctId}/ai/run/${model}`

			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(inputs)
			})

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`AI API error (${response.status}): ${errorText}`)
			}

			const result = await response.json() as {
				success: boolean
				result: unknown
				errors?: Array<{ message: string }>
			}

			if (!result.success) {
				const message = result.errors?.[0]?.message || 'Unknown AI error'
				throw new Error(`AI API error: ${message}`)
			}

			return result.result
		},

		gateway(_gatewayId: string): Ai {
			// Gateway is not supported via REST API, return self
			console.warn('AI Gateway is not supported in remote test mode')
			return ai as unknown as Ai
		}
	}

	return ai as unknown as Ai
}
