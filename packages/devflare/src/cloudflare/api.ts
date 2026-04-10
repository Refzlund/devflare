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
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

	try {
		const response = await Promise.race([
			fetch(url, { ...init, signal: controller.signal }),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
			)
		])
		return response
	} finally {
		clearTimeout(timeoutId)
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

/**
 * Make a GET request to the Cloudflare API
 * Automatically retries with a fresh token on auth failure
 */
export async function apiGet<T>(
	path: string,
	options?: APIClientOptions
): Promise<T> {
	const makeRequest = async (forceRefresh: boolean) => {
		const headers = await createHeaders(options, forceRefresh)
		const url = `${API_BASE}${path}`
		const timeout = options?.timeout ?? DEFAULT_TIMEOUT

		const response = await fetchWithTimeout(url, {
			method: 'GET',
			headers
		}, timeout)

		const data = await response.json() as CloudflareAPIResponse<T>
		return { response, data }
	}

	// First attempt
	let { response, data } = await makeRequest(false)

	// If auth error and we haven't retried yet, try with fresh token
	if (isAuthError(response, data) && !hasRetriedWithFreshToken && !options?.token) {
		hasRetriedWithFreshToken = true
		invalidateToken()
		;({ response, data } = await makeRequest(true))
		hasRetriedWithFreshToken = false
	}

	if (!data.success) {
		throw new CloudflareAPIError(
			data.errors[0]?.message || 'API request failed',
			response.status,
			data.errors
		)
	}

	return data.result
}

/**
 * Make a POST request to the Cloudflare API
 */
export async function apiPost<T>(
	path: string,
	body: unknown,
	options?: APIClientOptions
): Promise<T> {
	const headers = await createHeaders(options)
	const url = `${API_BASE}${path}`
	const timeout = options?.timeout ?? DEFAULT_TIMEOUT

	const response = await fetchWithTimeout(url, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	}, timeout)

	const data = await response.json() as CloudflareAPIResponse<T>

	if (!data.success) {
		throw new CloudflareAPIError(
			data.errors[0]?.message || 'API request failed',
			response.status,
			data.errors
		)
	}

	return data.result
}

/**
 * Make a PUT request to the Cloudflare API
 */
export async function apiPut<T>(
	path: string,
	body: unknown,
	options?: APIClientOptions
): Promise<T> {
	const headers = await createHeaders(options)
	const url = `${API_BASE}${path}`
	const timeout = options?.timeout ?? DEFAULT_TIMEOUT

	const response = await fetchWithTimeout(url, {
		method: 'PUT',
		headers,
		body: JSON.stringify(body)
	}, timeout)

	const data = await response.json() as CloudflareAPIResponse<T>

	if (!data.success) {
		throw new CloudflareAPIError(
			data.errors[0]?.message || 'API request failed',
			response.status,
			data.errors
		)
	}

	return data.result
}

/**
 * Make a PATCH request to the Cloudflare API
 */
export async function apiPatch<T>(
	path: string,
	body: unknown,
	options?: APIClientOptions
): Promise<T> {
	const headers = await createHeaders(options)
	const url = `${API_BASE}${path}`
	const timeout = options?.timeout ?? DEFAULT_TIMEOUT

	const response = await fetchWithTimeout(url, {
		method: 'PATCH',
		headers,
		body: JSON.stringify(body)
	}, timeout)

	const data = await response.json() as CloudflareAPIResponse<T>

	if (!data.success) {
		throw new CloudflareAPIError(
			data.errors[0]?.message || 'API request failed',
			response.status,
			data.errors
		)
	}

	return data.result
}

/**
 * Make a DELETE request to the Cloudflare API
 */
export async function apiDelete<T>(
	path: string,
	options?: APIClientOptions
): Promise<T> {
	const headers = await createHeaders(options)
	const url = `${API_BASE}${path}`
	const timeout = options?.timeout ?? DEFAULT_TIMEOUT

	const response = await fetchWithTimeout(url, {
		method: 'DELETE',
		headers
	}, timeout)

	const data = await response.json() as CloudflareAPIResponse<T>

	if (!data.success) {
		throw new CloudflareAPIError(
			data.errors[0]?.message || 'API request failed',
			response.status,
			data.errors
		)
	}

	return data.result
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
	const perPage = 50
	const maxPages = 100 // Safety limit to prevent infinite loops

	while (page <= maxPages) {
		const separator = path.includes('?') ? '&' : '?'
		const pagedPath = `${path}${separator}page=${page}&per_page=${perPage}`

		const headers = await createHeaders(options)
		const url = `${API_BASE}${pagedPath}`
		const timeout = options?.timeout ?? DEFAULT_TIMEOUT

		const response = await fetchWithTimeout(url, {
			method: 'GET',
			headers
		}, timeout)

		const data = await response.json() as CloudflareAPIResponse<T[]>

		if (!data.success) {
			throw new CloudflareAPIError(
				data.errors[0]?.message || 'API request failed',
				response.status,
				data.errors
			)
		}

		results.push(...data.result)

		// Stop conditions:
		// 1. No result_info at all
		// 2. No results returned (empty page)
		// 3. We've fetched all items based on total_count
		// 4. total_pages is defined and we've reached it
		if (!data.result_info) {
			break
		}

		// If we got no results, we're done
		if (data.result.length === 0) {
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
	const token = options?.token ?? await getApiToken()
	if (!token) throw new AuthenticationError()

	// URL-encode the key (keys may contain : and other special chars)
	const encodedKey = encodeURIComponent(key)
	const url = `${API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodedKey}`

	const timeout = options?.timeout ?? DEFAULT_TIMEOUT
	const response = await fetchWithTimeout(url, {
		method: 'GET',
		headers: { 'Authorization': `Bearer ${token}` }
	}, timeout)

	if (response.status === 404) {
		return null
	}

	if (!response.ok) {
		// Try to parse error response
		try {
			const errorData = await response.json() as CloudflareAPIResponse<unknown>
			throw new CloudflareAPIError(
				errorData.errors[0]?.message || 'KV read failed',
				response.status,
				errorData.errors
			)
		} catch {
			throw new CloudflareAPIError('KV read failed', response.status, [])
		}
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
	const token = options?.token ?? await getApiToken()
	if (!token) throw new AuthenticationError()

	// URL-encode the key
	const encodedKey = encodeURIComponent(key)
	const url = `${API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodedKey}`

	const timeout = options?.timeout ?? DEFAULT_TIMEOUT
	const response = await fetchWithTimeout(url, {
		method: 'PUT',
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'text/plain'
		},
		body: value // Raw value, NOT JSON.stringify
	}, timeout)

	if (!response.ok) {
		try {
			const errorData = await response.json() as CloudflareAPIResponse<unknown>
			throw new CloudflareAPIError(
				errorData.errors[0]?.message || 'KV write failed',
				response.status,
				errorData.errors
			)
		} catch {
			throw new CloudflareAPIError('KV write failed', response.status, [])
		}
	}
}
