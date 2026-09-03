import { getPrimaryAccount } from '../cloudflare/account'
import { getApiToken } from '../cloudflare/auth'
import { getEffectiveAccountId } from '../cloudflare/preferences'

interface CloudflareApiEnvelope<T> {
	success: boolean
	result: T
	errors?: Array<{ message: string }>
}

export interface RemoteCloudflareJsonRequestOptions {
	method: string
	path: string
	serviceLabel: string
	body?: string
	contentType?: string
}

export function createRemoteCloudflareClient(accountId?: string): {
	getAccountId: () => Promise<string>
	getToken: () => Promise<string>
	jsonRequest: <T>(options: RemoteCloudflareJsonRequestOptions) => Promise<T>
} {
	let resolvedAccountId: string | null = null

	async function getAccountId(): Promise<string> {
		if (accountId) {
			return accountId
		}
		if (resolvedAccountId) {
			return resolvedAccountId
		}

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

	async function jsonRequest<T>(options: RemoteCloudflareJsonRequestOptions): Promise<T> {
		const [acctId, token] = await Promise.all([getAccountId(), getToken()])
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${acctId}${options.path}`,
			{
				method: options.method,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': options.contentType ?? 'application/json'
				},
				body: options.body
			}
		)

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`${options.serviceLabel} API error (${response.status}): ${errorText}`)
		}

		const result = (await response.json()) as CloudflareApiEnvelope<T>
		if (!result.success) {
			const message = result.errors?.[0]?.message || `Unknown ${options.serviceLabel} error`
			throw new Error(`${options.serviceLabel} API error: ${message}`)
		}

		return result.result
	}

	return {
		getAccountId,
		getToken,
		jsonRequest
	}
}
