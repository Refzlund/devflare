// =============================================================================
// Remote AI Binding — REST API implementation
// =============================================================================
// Provides an AI binding that calls Cloudflare's REST API directly.
// This allows testing AI functionality without a running dev server.
// =============================================================================

import { createRemoteCloudflareClient } from './remote-cloudflare'

// -----------------------------------------------------------------------------
// Remote AI Binding
// -----------------------------------------------------------------------------

/**
 * Creates a remote AI binding that calls Cloudflare's REST API.
 * Matches the Workers AI binding interface.
 */
export function createRemoteAI(accountId?: string): Ai {
	const cloudflare = createRemoteCloudflareClient(accountId)

	// Create an object that implements the Ai interface via REST API
	// Use type assertion since we're implementing via REST, not the native binding
	const ai = {
		async run(model: string, inputs: unknown): Promise<unknown> {
			return cloudflare.jsonRequest<unknown>({
				method: 'POST',
				path: `/ai/run/${model}`,
				serviceLabel: 'AI',
				body: JSON.stringify(inputs)
			})
		},

		gateway(_gatewayId: string): Ai {
			// Gateway is not supported via REST API, return self
			console.warn('AI Gateway is not supported in remote test mode')
			return ai as unknown as Ai
		}
	}

	return ai as unknown as Ai
}
