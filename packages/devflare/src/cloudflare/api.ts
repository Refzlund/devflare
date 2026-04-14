// =============================================================================
// Cloudflare REST API Client
// =============================================================================
// HTTP client for interacting with Cloudflare's v4 API
// =============================================================================

import { getApiToken, invalidateToken } from './auth'
import type { CloudflareAPIResponse } from './types'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const API_BASE = 'https://api.cloudflare.com/client/v4'
const DEFAULT_TIMEOUT = 10000 // 10 seconds

// Track if we've already retried with a fresh token (avoid infinite loops)
let hasRetriedWithFreshToken = false

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Wrap fetch with a guaranteed timeout using Promise.race
 * AbortSignal can sometimes fail to abort in certain environments
 */
async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number
): Promise<Response> {
	const controller = new AbortController()
	const abortTimeoutId = setTimeout(() => controller.abort(), timeoutMs)
	let rejectTimeoutId: ReturnType<typeof setTimeout> | null = null
	const timeoutPromise = new Promise<never>((_, reject) => {
		rejectTimeoutId = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
	})

	try {
		const response = await Promise.race([
			fetch(url, { ...init, signal: controller.signal }),
			timeoutPromise
		])
		return response
	} finally {
		clearTimeout(abortTimeoutId)
		if (rejectTimeoutId) {
			clearTimeout(rejectTimeoutId)
		}
	}
}

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

export class CloudflareAPIError extends Error {
	constructor(
		message: string,
		public code: number,
		public errors: Array<{ code: number; message: string }>
	) {
		super(message)
		this.name = 'CloudflareAPIError'
	}
}

export class AuthenticationError extends Error {
	constructor(message = 'Not authenticated. Run: devflare login') {
		super(message)
		this.name = 'AuthenticationError'
	}
}

// -----------------------------------------------------------------------------
// API Client
// -----------------------------------------------------------------------------

export interface APIClientOptions {
	/** Override the API token (instead of auto-detecting) */
	token?: string
	/** Request timeout in ms (default: 30000) */
	timeout?: number
}

interface CloudflareJsonRequestOptions {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	body?: unknown
	allowAuthRetry?: boolean
}

/**
 * Create headers for Cloudflare API requests
 */
async function createHeaders(options?: APIClientOptions, forceRefresh = false): Promise<Headers> {
	const token = options?.token ?? await getApiToken(forceRefresh)

	if (!token) {
		throw new AuthenticationError()
	}

	return new Headers({
		'Authorization': `Bearer ${token}`,
		'Content-Type': 'application/json'
	})
}

/**
 * Check if an error is an authentication error (401 or auth-related message)
 */
function isAuthError(response: Response, data: CloudflareAPIResponse<unknown>): boolean {
	if (response.status === 401) return true
	if (!data.success && data.errors?.some((e) =>
		e.code === 10000 || // Auth error code
		e.message?.toLowerCase().includes('authentication') ||
		e.message?.toLowerCase().includes('token')
	)) {
		return true
	}
	return false
}

async function requestCloudflareJson<T>(
	path: string,
	request: CloudflareJsonRequestOptions,
	options?: APIClientOptions
): Promise<{
	response: Response
	data: CloudflareAPIResponse<T>
}> {
	const makeRequest = async (forceRefresh: boolean) => {
		const headers = await createHeaders(options, forceRefresh)
		const response = await fetchWithTimeout(`${API_BASE}${path}`, {
			method: request.method,
			headers,
			...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {})
		}, options?.timeout ?? DEFAULT_TIMEOUT)
		const data = await response.json() as CloudflareAPIResponse<T>

		return {
			response,
			data
		}
	}

	let result = await makeRequest(false)

	if (request.allowAuthRetry === true && isAuthError(result.response, result.data) && !hasRetriedWithFreshToken && !options?.token) {
		hasRetriedWithFreshToken = true
		invalidateToken()

		try {
			result = await makeRequest(true)
		} finally {
			hasRetriedWithFreshToken = false
		}
	}

	return result
}

async function requestCloudflareResult<T>(
	path: string,
	request: CloudflareJsonRequestOptions,
	options?: APIClientOptions
): Promise<T> {
	const { response, data } = await requestCloudflareJson<T>(path, request, options)
	return unwrapCloudflareResult(response, data)
}

function unwrapCloudflareResult<T>(
	response: Response,
	data: CloudflareAPIResponse<T>,
	fallbackMessage = 'API request failed'
): T {
	if (!data.success) {
		throw new CloudflareAPIError(
			data.errors[0]?.message || fallbackMessage,
			response.status,
			data.errors
		)
	}

	return data.result
}

async function throwCloudflareResponseError(
	response: Response,
	fallbackMessage: string
): Promise<never> {
	try {
		const errorData = await response.json() as CloudflareAPIResponse<unknown>
		throw new CloudflareAPIError(
			errorData.errors[0]?.message || fallbackMessage,
			response.status,
			errorData.errors
		)
	} catch (error) {
		if (error instanceof CloudflareAPIError) {
			throw error
		}

		throw new CloudflareAPIError(fallbackMessage, response.status, [])
	}
}

/**
 * Make a GET request to the Cloudflare API
 * Automatically retries with a fresh token on auth failure
 */
export async function apiGet<T>(
	path: string,
	options?: APIClientOptions
): Promise<T> {
	return requestCloudflareResult(path, {
		method: 'GET',
		allowAuthRetry: true
	}, options)
}

/**
 * Make a POST request to the Cloudflare API
 */
export async function apiPost<T>(
	path: string,
	body: unknown,
	options?: APIClientOptions
): Promise<T> {
	return requestCloudflareResult(path, {
		method: 'POST',
		body
	}, options)
}

/**
 * Make a PUT request to the Cloudflare API
 */
export async function apiPut<T>(
	path: string,
	body: unknown,
	options?: APIClientOptions
): Promise<T> {
	return requestCloudflareResult(path, {
		method: 'PUT',
		body
	}, options)
}

/**
 * Make a PATCH request to the Cloudflare API
 */
export async function apiPatch<T>(
	path: string,
	body: unknown,
	options?: APIClientOptions
): Promise<T> {
	return requestCloudflareResult(path, {
		method: 'PATCH',
		body
	}, options)
}

/**
 * Make a DELETE request to the Cloudflare API
 */
export async function apiDelete<T>(
	path: string,
	options?: APIClientOptions
): Promise<T> {
	return requestCloudflareResult(path, {
		method: 'DELETE'
	}, options)
}

/**
 * Make a paginated GET request, fetching all pages
 */
export async function apiGetAll<T>(
	path: string,
	options?: APIClientOptions
): Promise<T[]> {
	const results: T[] = []
	let page = 1
	let cursor: string | undefined
	const perPage = 50
	const maxPages = 100 // Safety limit to prevent infinite loops
	const seenCursors = new Set<string>()

	const extractPaginatedItems = (result: unknown): T[] => {
		if (Array.isArray(result)) {
			return result as T[]
		}

		if (!result || typeof result !== 'object') {
			throw new Error('Expected paginated Cloudflare API result to be an array or an object containing an array.')
		}

		const arrayEntries = Object.entries(result).filter(([, value]) => Array.isArray(value))
		if (arrayEntries.length !== 1) {
			throw new Error('Expected paginated Cloudflare API result object to contain exactly one array property.')
		}

		return arrayEntries[0][1] as T[]
	}

	while (page <= maxPages) {
		const separator = path.includes('?') ? '&' : '?'
		const pagedPath = cursor
			? `${path}${separator}cursor=${encodeURIComponent(cursor)}&per_page=${perPage}`
			: `${path}${separator}page=${page}&per_page=${perPage}`

		const { response, data } = await requestCloudflareJson<T[] | Record<string, unknown>>(pagedPath, {
			method: 'GET',
			allowAuthRetry: true
		}, options)
		unwrapCloudflareResult(response, data)

		const pageResults = extractPaginatedItems(data.result)
		results.push(...pageResults)

		// Stop conditions:
		// 1. No result_info at all
		// 2. No results returned (empty page)
		// 3. We've fetched all items based on total_count
		// 4. total_pages is defined and we've reached it
		if (!data.result_info) {
			break
		}

		// If we got no results, we're done
		if (pageResults.length === 0) {
			break
		}

		const nextCursor = data.result_info.cursor?.trim()
		if (nextCursor) {
			if (seenCursors.has(nextCursor)) {
				break
			}

			seenCursors.add(nextCursor)
			cursor = nextCursor
			continue
		}

		if (cursor) {
			break
		}

		// If we have total_count, check if we've got all items
		if (data.result_info.total_count !== undefined) {
			if (results.length >= data.result_info.total_count) {
				break
			}
		}

		// If we have total_pages, check if we've reached it
		if (data.result_info.total_pages !== undefined) {
			if (page >= data.result_info.total_pages) {
				break
			}
		}

		page++
	}

	return results
}

// -----------------------------------------------------------------------------
// KV-Specific Helpers
// -----------------------------------------------------------------------------
// Cloudflare KV "values" endpoints are NOT JSON envelopes — they return
// raw text/binary. We need dedicated helpers that don't try to parse JSON.

async function requestKVValue(
	accountId: string,
	namespaceId: string,
	key: string,
	request: {
		method: 'GET'
	} | {
		method: 'PUT'
		value: string
	},
	options?: APIClientOptions
): Promise<Response> {
	const token = options?.token ?? await getApiToken()
	if (!token) throw new AuthenticationError()

	const encodedKey = encodeURIComponent(key)
	const url = `${API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodedKey}`

	return fetchWithTimeout(url, {
		method: request.method,
		headers: {
			'Authorization': `Bearer ${token}`,
			...(request.method === 'PUT' ? { 'Content-Type': 'text/plain' } : {})
		},
		...(request.method === 'PUT' ? { body: request.value } : {})
	}, options?.timeout ?? DEFAULT_TIMEOUT)
}

/**
 * Read a KV value (raw text response, not JSON envelope)
 * Returns null if key doesn't exist (404)
 */
export async function kvGet(
	accountId: string,
	namespaceId: string,
	key: string,
	options?: APIClientOptions
): Promise<string | null> {
	const response = await requestKVValue(accountId, namespaceId, key, {
		method: 'GET'
	}, options)

	if (response.status === 404) {
		return null
	}

	if (!response.ok) {
		await throwCloudflareResponseError(response, 'KV read failed')
	}

	return response.text()
}

/**
 * Write a KV value (raw text body, not JSON)
 */
export async function kvPut(
	accountId: string,
	namespaceId: string,
	key: string,
	value: string,
	options?: APIClientOptions
): Promise<void> {
	const response = await requestKVValue(accountId, namespaceId, key, {
		method: 'PUT',
		value
	}, options)

	if (!response.ok) {
		await throwCloudflareResponseError(response, 'KV write failed')
	}
}
