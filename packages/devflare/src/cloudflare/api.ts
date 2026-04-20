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
// Fetch with timeout
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
// Envelope parsing
// -----------------------------------------------------------------------------

interface ParseEnvelopeOptions {
	endpoint: string
	allow404?: boolean
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
	if (text.length === 0) return { ok: false }
	try {
		return { ok: true, value: JSON.parse(text) }
	} catch {
		return { ok: false }
	}
}

function isEnvelopeShape(value: unknown): value is CloudflareAPIResponse<unknown> {
	if (!value || typeof value !== 'object') return false
	const record = value as Record<string, unknown>
	return typeof record.success === 'boolean'
		&& Array.isArray(record.errors)
		&& Array.isArray(record.messages)
		&& 'result' in record
}

function envelopeFailureError(
	response: Response,
	envelope: CloudflareAPIResponse<unknown>,
	endpoint: string
): CloudflareAPIError {
	const first = envelope.errors[0]
	const message = first
		? `Cloudflare ${endpoint} failed (${first.code}): ${first.message}`
		: `Cloudflare ${endpoint} failed`
	return new CloudflareAPIError(message, response.status, envelope.errors)
}

/**
 * Read a response body once (as text) and decode the Cloudflare v4 envelope
 * without throwing on `success: false`. Returns `null` when a 404 is
 * explicitly allowed via `allow404: true`.
 *
 * Throws `CloudflareAPIError` when the body is not valid JSON or does not
 * match the expected v4 envelope shape.
 */
async function decodeCloudflareEnvelope<T>(
	response: Response,
	opts: ParseEnvelopeOptions
): Promise<CloudflareAPIResponse<T> | null> {
	if (opts.allow404 === true && response.status === 404) {
		return null
	}

	const text = await response.text()
	const parsed = tryParseJson(text)

	if (!parsed.ok) {
		throw new CloudflareAPIError(
			'Cloudflare API returned an invalid JSON response.',
			response.status,
			[]
		)
	}

	if (!isEnvelopeShape(parsed.value)) {
		throw new CloudflareAPIError(
			`Cloudflare ${opts.endpoint} returned a non-envelope JSON response.`,
			response.status,
			[]
		)
	}

	return parsed.value as CloudflareAPIResponse<T>
}

/**
 * Canonical Cloudflare v4 envelope parser.
 *
 * - Reads the response body exactly once (text -> tryParseJson).
 * - Enforces the `{ success, errors, messages, result }` shape.
 * - Throws `CloudflareAPIError` when `success === false`, surfacing
 *   `errors[0].code` and `errors[0].message`.
 * - Treats `404` as success when `allow404: true` is passed, returning
 *   `null as T` without reading the body.
 */
export async function parseCloudflareEnvelope<T>(
	response: Response,
	opts: ParseEnvelopeOptions
): Promise<T> {
	const envelope = await decodeCloudflareEnvelope<T>(response, opts)
	if (envelope === null) {
		return null as T
	}

	if (!envelope.success) {
		throw envelopeFailureError(response, envelope, opts.endpoint)
	}

	return envelope.result
}

/**
 * Raw JSON parser for Cloudflare endpoints that do not use the v4 envelope.
 * Reads the body once as text and parses it as JSON.
 */
export async function parseRawJson<T>(
	response: Response,
	opts: { endpoint: string }
): Promise<T> {
	const text = await response.text()
	const parsed = tryParseJson(text)
	if (!parsed.ok) {
		throw new CloudflareAPIError(
			`Cloudflare ${opts.endpoint} returned an invalid JSON response.`,
			response.status,
			[]
		)
	}
	return parsed.value as T
}

// -----------------------------------------------------------------------------
// Auth session
// -----------------------------------------------------------------------------

export interface CloudflareAuthSession {
	getAuthHeader(forceRefresh?: boolean): Promise<string>
	invalidate(): void
}

interface CreateAuthSessionOptions {
	accountId?: string
	tokenProvider?: (forceRefresh: boolean) => Promise<string | null>
	onInvalidate?: () => void
}

/**
 * Create a small auth session abstraction that centralises "which token are
 * we sending" for every request. The session owns token resolution and
 * invalidation so request code does not call `getApiToken` directly.
 */
export function createCloudflareAuthSession(opts: CreateAuthSessionOptions = {}): CloudflareAuthSession {
	const provider = opts.tokenProvider ?? ((forceRefresh: boolean) => getApiToken(forceRefresh))
	const onInvalidate = opts.onInvalidate ?? invalidateToken

	return {
		async getAuthHeader(forceRefresh = false) {
			const token = await provider(forceRefresh)
			if (!token) {
				throw new AuthenticationError()
			}
			return `Bearer ${token}`
		},
		invalidate() {
			onInvalidate()
		}
	}
}

const defaultAuthSession = createCloudflareAuthSession({})

async function resolveAuthHeader(options?: APIClientOptions, forceRefresh = false): Promise<string> {
	if (options?.token) {
		return `Bearer ${options.token}`
	}
	return defaultAuthSession.getAuthHeader(forceRefresh)
}

// -----------------------------------------------------------------------------
// API Client
// -----------------------------------------------------------------------------

export interface APIClientOptions {
	/** Override the API token (instead of auto-detecting) */
	token?: string
	/** Request timeout in ms (default: 10000) */
	timeout?: number
}

interface CloudflareJsonRequestOptions {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	body?: unknown
	allowAuthRetry?: boolean
}

/**
 * Check if a decoded envelope represents an auth failure worth retrying.
 */
function isAuthError(response: Response, envelope: CloudflareAPIResponse<unknown>): boolean {
	if (response.status === 401) return true
	if (!envelope.success && envelope.errors?.some((e) =>
		e.code === 10000 || // Auth error code
		e.message?.toLowerCase().includes('authentication') ||
		e.message?.toLowerCase().includes('token')
	)) {
		return true
	}
	return false
}

/**
 * Execute a Cloudflare JSON request and return the decoded envelope without
 * throwing on `success: false` so callers can inspect and retry on auth
 * errors before surfacing failures.
 *
 * Bursts of resource creates (KV, D1, Queues during deploy) can hit
 * Cloudflare's per-account rate limits, and edge proxies occasionally return
 * 5xx. We retry network errors and 429/5xx responses with bounded
 * exponential backoff before surfacing the failure.
 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const RETRY_BASE_DELAY_MS = 250
const RETRY_MAX_ATTEMPTS = 4

function shouldRetryResponse(response: Response): boolean {
	return RETRYABLE_STATUS.has(response.status)
}

function backoffDelayMs(attempt: number, retryAfterHeader: string | null): number {
	if (retryAfterHeader) {
		const parsed = Number(retryAfterHeader)
		if (Number.isFinite(parsed) && parsed > 0) {
			return Math.min(parsed * 1000, 10_000)
		}
	}
	const base = RETRY_BASE_DELAY_MS * 2 ** attempt
	const jitter = Math.random() * RETRY_BASE_DELAY_MS
	return Math.min(base + jitter, 10_000)
}

async function requestCloudflareJson<T>(
	path: string,
	request: CloudflareJsonRequestOptions,
	options?: APIClientOptions
): Promise<{
	response: Response
	envelope: CloudflareAPIResponse<T>
}> {
	const endpoint = `${request.method} ${path}`

	const makeRequest = async (forceRefresh: boolean) => {
		const authorization = await resolveAuthHeader(options, forceRefresh)
		const headers = new Headers({
			'Authorization': authorization,
			'Content-Type': 'application/json'
		})
		const response = await fetchWithTimeout(`${API_BASE}${path}`, {
			method: request.method,
			headers,
			...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {})
		}, options?.timeout ?? DEFAULT_TIMEOUT)
		const envelope = await decodeCloudflareEnvelope<T>(response, { endpoint })
		// allow404 is not set, so envelope is non-null.
		return { response, envelope: envelope as CloudflareAPIResponse<T> }
	}

	let result: { response: Response; envelope: CloudflareAPIResponse<T> } | null = null
	let lastError: unknown = null
	for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
		try {
			result = await makeRequest(false)
		} catch (error) {
			lastError = error
			if (attempt < RETRY_MAX_ATTEMPTS - 1) {
				await new Promise((r) => setTimeout(r, backoffDelayMs(attempt, null)))
				continue
			}
			throw error
		}
		const current = result
		if (!shouldRetryResponse(current.response) || attempt === RETRY_MAX_ATTEMPTS - 1) {
			break
		}
		await new Promise((r) => setTimeout(r, backoffDelayMs(attempt, current.response.headers.get('retry-after'))))
	}

	if (!result) {
		throw lastError ?? new Error(`Cloudflare API request failed: ${endpoint}`)
	}

	if (request.allowAuthRetry === true && isAuthError(result.response, result.envelope) && !options?.token) {
		defaultAuthSession.invalidate()
		result = await makeRequest(true)
	}

	return result
}

async function requestCloudflareResult<T>(
	path: string,
	request: CloudflareJsonRequestOptions,
	options?: APIClientOptions
): Promise<T> {
	const { response, envelope } = await requestCloudflareJson<T>(path, request, options)
	if (!envelope.success) {
		throw envelopeFailureError(response, envelope, `${request.method} ${path}`)
	}
	return envelope.result
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

		const { response, envelope } = await requestCloudflareJson<T[] | Record<string, unknown>>(pagedPath, {
			method: 'GET',
			allowAuthRetry: true
		}, options)

		if (!envelope.success) {
			throw envelopeFailureError(response, envelope, `GET ${pagedPath}`)
		}

		const pageResults = extractPaginatedItems(envelope.result)
		results.push(...pageResults)

		// Stop conditions:
		// 1. No result_info at all
		// 2. No results returned (empty page)
		// 3. We've fetched all items based on total_count
		// 4. total_pages is defined and we've reached it
		if (!envelope.result_info) {
			break
		}

		// If we got no results, we're done
		if (pageResults.length === 0) {
			break
		}

		const nextCursor = envelope.result_info.cursor?.trim()
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
		if (envelope.result_info.total_count !== undefined) {
			if (results.length >= envelope.result_info.total_count) {
				break
			}
		}

		// If we have total_pages, check if we've reached it
		if (envelope.result_info.total_pages !== undefined) {
			if (page >= envelope.result_info.total_pages) {
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
// Cloudflare KV "values" endpoints are NOT JSON envelopes on success — they
// return raw text/binary. Error responses still return a v4 envelope, which
// we decode through the canonical parser.

async function requestKVValue(
	accountId: string,
	namespaceId: string,
	key: string,
	request: {
		method: 'GET'
	} | {
		method: 'PUT'
		value: string
	} | {
		method: 'DELETE'
	},
	options?: APIClientOptions
): Promise<Response> {
	const authorization = await resolveAuthHeader(options)

	const encodedKey = encodeURIComponent(key)
	const url = `${API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodedKey}`

	return fetchWithTimeout(url, {
		method: request.method,
		headers: {
			'Authorization': authorization,
			...(request.method === 'PUT' ? { 'Content-Type': 'text/plain' } : {})
		},
		...(request.method === 'PUT' ? { body: request.value } : {})
	}, options?.timeout ?? DEFAULT_TIMEOUT)
}

/**
 * Surface a failed KV-value response as a typed CloudflareAPIError by
 * decoding the envelope the error path emits.
 */
async function throwKVValueError(response: Response, endpoint: string): Promise<never> {
	// parseCloudflareEnvelope throws CloudflareAPIError either on !success or
	// when the body is not a valid envelope.
	await parseCloudflareEnvelope<unknown>(response, { endpoint })
	// If the body somehow parsed as a successful envelope on a non-ok
	// response, still surface a typed error.
	throw new CloudflareAPIError(`Cloudflare ${endpoint} failed`, response.status, [])
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
		await throwKVValueError(response, 'KV read')
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
		await throwKVValueError(response, 'KV write')
	}
}

/**
 * Delete a KV key
 * Treats 404 as success (key already absent).
 */
export async function kvDelete(
	accountId: string,
	namespaceId: string,
	key: string,
	options?: APIClientOptions
): Promise<void> {
	const response = await requestKVValue(accountId, namespaceId, key, {
		method: 'DELETE'
	}, options)

	if (response.status === 404) {
		return
	}

	if (!response.ok) {
		await throwKVValueError(response, 'KV delete')
	}
}
