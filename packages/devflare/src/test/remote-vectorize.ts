// =============================================================================
// Remote Vectorize Binding — REST API implementation
// =============================================================================
// Provides a Vectorize binding that calls Cloudflare's REST API directly.
// This allows testing Vectorize functionality without a running dev server.
// =============================================================================

import { createRemoteCloudflareClient } from './remote-cloudflare'

// -----------------------------------------------------------------------------
// Remote Vectorize Binding
// -----------------------------------------------------------------------------

/**
 * Creates a remote Vectorize binding that calls Cloudflare's REST API.
 * Matches the Workers Vectorize binding interface.
 */
export function createRemoteVectorize(indexName: string, accountId?: string): VectorizeIndex {
	const cloudflare = createRemoteCloudflareClient(accountId)

	async function apiRequest<T>(
		method: string,
		endpoint: string,
		body?: unknown
	): Promise<T> {
		return cloudflare.jsonRequest<T>({
			method,
			path: `/vectorize/v2/indexes/${indexName}${endpoint}`,
			serviceLabel: 'Vectorize',
			body: body ? JSON.stringify(body) : undefined
		})
	}

	async function ndjsonRequest<T>(
		endpoint: string,
		vectors: VectorizeVector[]
	): Promise<T> {
		// Vectorize uses NDJSON for insert/upsert
		const ndjson = vectors.map((v) => JSON.stringify(v)).join('\n')

		return cloudflare.jsonRequest<T>({
			method: 'POST',
			path: `/vectorize/v2/indexes/${indexName}${endpoint}`,
			serviceLabel: 'Vectorize',
			contentType: 'application/x-ndjson',
			body: ndjson
		})
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
