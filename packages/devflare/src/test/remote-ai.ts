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

interface RemoteAIWithGatewayLog {
	aiGatewayLogId: string | null
}

function encodePathSegment(value: string): string {
	return encodeURIComponent(value)
}

function applyExtraHeaders(headers: Headers, extraHeaders?: object): void {
	if (!extraHeaders) {
		return
	}

	for (const [key, value] of Object.entries(extraHeaders)) {
		headers.set(key, String(value))
	}
}

function createRemoteAIGateway(
	cloudflare: ReturnType<typeof createRemoteCloudflareClient>,
	gatewayId: string,
	owner: RemoteAIWithGatewayLog
): AiGateway {
	const encodedGatewayId = encodePathSegment(gatewayId)

	const gateway = {
		async patchLog(logId: string, data: AiGatewayPatchLog): Promise<void> {
			await cloudflare.jsonRequest<null>({
				method: 'PATCH',
				path: `/ai-gateway/gateways/${encodedGatewayId}/logs/${encodePathSegment(logId)}`,
				serviceLabel: 'AI Gateway',
				body: JSON.stringify(data)
			})
		},

		async getLog(logId: string): Promise<AiGatewayLog> {
			return cloudflare.jsonRequest<AiGatewayLog>({
				method: 'GET',
				path: `/ai-gateway/gateways/${encodedGatewayId}/logs/${encodePathSegment(logId)}`,
				serviceLabel: 'AI Gateway'
			})
		},

		async getUrl(provider?: AIGatewayProviders | string): Promise<string> {
			const accountId = await cloudflare.getAccountId()
			const baseUrl = `https://gateway.ai.cloudflare.com/v1/${encodePathSegment(accountId)}/${encodedGatewayId}`
			return provider ? `${baseUrl}/${encodePathSegment(provider)}` : `${baseUrl}/`
		},

		async run(
			data: AIGatewayUniversalRequest | AIGatewayUniversalRequest[],
			options?: {
				gateway?: UniversalGatewayOptions
				extraHeaders?: object
				signal?: AbortSignal
			}
		): Promise<Response> {
			const [url, token] = await Promise.all([gateway.getUrl(), cloudflare.getToken()])
			const headers = new Headers({
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			})
			applyExtraHeaders(headers, options?.extraHeaders)

			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(data),
				signal: options?.signal
			})

			const logId = response.headers.get('cf-aig-log-id') ?? response.headers.get('cf-ai-gateway-log-id')
			if (logId) {
				owner.aiGatewayLogId = logId
			}

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`AI Gateway API error (${response.status}): ${errorText}`)
			}

			return response
		}
	}

	return gateway as AiGateway
}

/**
 * Creates a remote AI binding that calls Cloudflare's REST API.
 * Matches the Workers AI binding interface.
 */
export function createRemoteAI(accountId?: string): Ai {
	const cloudflare = createRemoteCloudflareClient(accountId)

	// Create an object that implements the Ai interface via REST API
	// Use type assertion since we're implementing via REST, not the native binding
	const ai = {
		aiGatewayLogId: null as string | null,

		async run(model: string, inputs: unknown): Promise<unknown> {
			return cloudflare.jsonRequest<unknown>({
				method: 'POST',
				path: `/ai/run/${model}`,
				serviceLabel: 'AI',
				body: JSON.stringify(inputs)
			})
		},

		gateway(gatewayId: string): AiGateway {
			return createRemoteAIGateway(cloudflare, gatewayId, ai)
		}
	}

	return ai as unknown as Ai
}
