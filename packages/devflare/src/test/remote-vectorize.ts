// =============================================================================
// Remote Vectorize Binding — REST API implementation
// =============================================================================
// Provides a Vectorize binding that calls Cloudflare's REST API directly.
// This allows testing Vectorize functionality without a running dev server.
// =============================================================================

import { getApiToken } from '../cloudflare/auth'
import { getPrimaryAccount } from '../cloudflare/account'
import { getEffectiveAccountId } from '../cloudflare/preferences'

// -----------------------------------------------------------------------------
// Remote Vectorize Binding
// -----------------------------------------------------------------------------

/**
 * Creates a remote Vectorize binding that calls Cloudflare's REST API.
 * Matches the Workers Vectorize binding interface.
 */
export function createRemoteVectorize(indexName: string, accountId?: string): VectorizeIndex {
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

	async function apiRequest<T>(
		method: string,
		endpoint: string,
		body?: unknown
	): Promise<T> {
		const [acctId, token] = await Promise.all([getAccountId(), getToken()])

		const url = `https://api.cloudflare.com/client/v4/accounts/${acctId}/vectorize/v2/indexes/${indexName}${endpoint}`

		const response = await fetch(url, {
			method,
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: body ? JSON.stringify(body) : undefined
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Vectorize API error (${response.status}): ${errorText}`)
		}

		const result = await response.json() as {
			success: boolean
			result: T
			errors?: Array<{ message: string }>
		}

		if (!result.success) {
			const message = result.errors?.[0]?.message || 'Unknown Vectorize error'
			throw new Error(`Vectorize API error: ${message}`)
		}

		return result.result
	}

	async function ndjsonRequest<T>(
		endpoint: string,
		vectors: VectorizeVector[]
	): Promise<T> {
		const [acctId, token] = await Promise.all([getAccountId(), getToken()])
		const url = `https://api.cloudflare.com/client/v4/accounts/${acctId}/vectorize/v2/indexes/${indexName}${endpoint}`

		// Vectorize uses NDJSON for insert/upsert
		const ndjson = vectors.map((v) => JSON.stringify(v)).join('\n')

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/x-ndjson'
			},
			body: ndjson
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Vectorize API error (${response.status}): ${errorText}`)
		}

		const result = await response.json() as {
			success: boolean
			result: T
			errors?: Array<{ message: string }>
		}

		if (!result.success) {
			const message = result.errors?.[0]?.message || 'Unknown Vectorize error'
			throw new Error(`Vectorize API error: ${message}`)
		}

		return result.result
	}

	// Create an object that implements VectorizeIndex via REST API
	// Use type assertions since we're implementing via REST, not the native binding
	const vectorize = {
		async describe(): Promise<VectorizeIndexDetails> {
			return apiRequest<VectorizeIndexDetails>('GET', '')
		},

		async query(
			vector: number[] | Float32Array | Float64Array,
			options?: VectorizeQueryOptions
		): Promise<VectorizeMatches> {
			const vectorArray = Array.isArray(vector) ? vector : Array.from(vector)

			return apiRequest<VectorizeMatches>('POST', '/query', {
				vector: vectorArray,
				topK: options?.topK ?? 10,
				returnValues: options?.returnValues ?? false,
				returnMetadata: options?.returnMetadata ?? 'none',
				namespace: options?.namespace,
				filter: options?.filter
			})
		},

		async insert(vectors: VectorizeVector[]): Promise<VectorizeVectorMutation> {
			const result = await ndjsonRequest<{ mutationId: string; count: number; ids?: string[] }>('/insert', vectors)
			return {
				count: result.count,
				ids: result.ids || vectors.map((v) => v.id)
			}
		},

		async upsert(vectors: VectorizeVector[]): Promise<VectorizeVectorMutation> {
			const result = await ndjsonRequest<{ mutationId: string; count: number; ids?: string[] }>('/upsert', vectors)
			return {
				count: result.count,
				ids: result.ids || vectors.map((v) => v.id)
			}
		},

		async deleteByIds(ids: string[]): Promise<VectorizeVectorMutation> {
			const result = await apiRequest<{ mutationId: string; count: number }>('POST', '/delete-by-ids', { ids })
			return {
				count: result.count,
				ids
			}
		},

		async getByIds(ids: string[]): Promise<VectorizeVector[]> {
			return apiRequest<VectorizeVector[]>('POST', '/get-by-ids', { ids })
		}
	}

	return vectorize as unknown as VectorizeIndex
}
