// =============================================================================
// R2 Presign Gateway Runtime — Shared Inline Script Source
// =============================================================================
// Validates and serves the local presigned R2 endpoint
// (`/_devflare/r2/presigned/<binding>/<key>`) inside the Miniflare gateway
// worker. Embedded verbatim (like `GATEWAY_RUNTIME_JS`) into:
//   - the dev-server gateway (`src/dev-server/gateway-script.ts`)
//   - the programmatic/test gateway (`src/bridge/miniflare.ts`)
//   - the test-context gateway (`src/test/simple-context-gateway-script.ts`)
//
// The canonical-string format MUST stay in sync with
// `buildLocalCanonicalString` in `src/runtime/r2-presign.ts` byte-for-byte.
// All symbols are `__devflareR2Presign`-prefixed so embedding never collides.
// =============================================================================

/**
 * Inline JS defining `__devflareR2PresignHandle(request, env, url)`, which
 * returns a `Response` when the request targets the local presign endpoint
 * and `null` otherwise. Enforces signature, expiry, method, content type and
 * size against the per-boot secret in `env.DEVFLARE_R2_PRESIGN_SECRET`, then
 * executes the object operation on the local R2 binding.
 */
export const R2_PRESIGN_RUNTIME_JS = `
const __devflareR2PresignPrefix = '/_devflare/r2/presigned/'

const __devflareR2PresignCors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, PUT, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Expose-Headers': 'ETag, Content-Type, Content-Length'
}

function __devflareR2PresignError(status, code, message) {
	return new Response(JSON.stringify({ error: { code, message } }), {
		status,
		headers: { 'Content-Type': 'application/json', ...__devflareR2PresignCors }
	})
}

async function __devflareR2PresignHmacHex(secret, message) {
	const encoder = new TextEncoder()
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	)
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
	return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time hex comparison (uses workerd's timingSafeEqual when present).
function __devflareR2PresignEqual(expectedHex, actualHex) {
	if (typeof actualHex !== 'string' || actualHex.length !== expectedHex.length) return false
	const encoder = new TextEncoder()
	const expected = encoder.encode(expectedHex)
	const actual = encoder.encode(actualHex)
	const subtle = crypto.subtle
	if (subtle && typeof subtle.timingSafeEqual === 'function') {
		return subtle.timingSafeEqual(expected, actual)
	}
	let diff = 0
	for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i]
	return diff === 0
}

// MUST match buildLocalCanonicalString in src/runtime/r2-presign.ts.
function __devflareR2PresignCanonical(method, binding, key, expires, contentType, contentLength, maxSize) {
	return [
		'devflare:r2-presign:v1',
		method,
		binding,
		key,
		expires,
		contentType || '',
		contentLength || '',
		maxSize || ''
	].join('\\n')
}

/**
 * Handle a request to the local presigned R2 endpoint; returns null when the
 * path does not match so gateways can fall through to their other routes.
 */
async function __devflareR2PresignHandle(request, env, url) {
	if (!url.pathname.startsWith(__devflareR2PresignPrefix)) return null

	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: { ...__devflareR2PresignCors, 'Access-Control-Max-Age': '86400' }
		})
	}

	const rest = url.pathname.slice(__devflareR2PresignPrefix.length)
	const slashIndex = rest.indexOf('/')
	if (slashIndex <= 0 || slashIndex === rest.length - 1) {
		return __devflareR2PresignError(400, 'bad_request', 'Expected /_devflare/r2/presigned/<binding>/<key>.')
	}
	const binding = decodeURIComponent(rest.slice(0, slashIndex))
	const key = rest
		.slice(slashIndex + 1)
		.split('/')
		.map((segment) => decodeURIComponent(segment))
		.join('/')

	const secret = env.DEVFLARE_R2_PRESIGN_SECRET
	if (typeof secret !== 'string' || secret.length === 0) {
		return __devflareR2PresignError(
			500,
			'presign_unconfigured',
			'DEVFLARE_R2_PRESIGN_SECRET is not configured on the devflare gateway. '
				+ 'This endpoint is only served for configs with R2 bindings.'
		)
	}

	const params = url.searchParams
	const signedMethod = params.get('X-Devflare-Method')
	const expires = params.get('X-Devflare-Expires')
	const providedSignature = params.get('X-Devflare-Signature')
	const signedContentType = params.get('X-Devflare-Content-Type')
	const signedContentLength = params.get('X-Devflare-Content-Length')
	const signedMaxSize = params.get('X-Devflare-Max-Size')

	if (!signedMethod || !expires || !providedSignature) {
		return __devflareR2PresignError(403, 'missing_parameters', 'Missing presign query parameters.')
	}

	const expectedSignature = await __devflareR2PresignHmacHex(
		secret,
		__devflareR2PresignCanonical(
			signedMethod, binding, key, expires, signedContentType, signedContentLength, signedMaxSize
		)
	)
	if (!__devflareR2PresignEqual(expectedSignature, providedSignature)) {
		return __devflareR2PresignError(403, 'invalid_signature', 'Presigned URL signature mismatch.')
	}

	if (Math.floor(Date.now() / 1000) > Number(expires)) {
		return __devflareR2PresignError(403, 'expired', 'Presigned URL has expired.')
	}

	const methodAllowed = signedMethod === 'GET'
		? request.method === 'GET' || request.method === 'HEAD'
		: request.method === signedMethod
	if (!methodAllowed) {
		return __devflareR2PresignError(
			403,
			'method_mismatch',
			'URL was presigned for ' + signedMethod + ', got ' + request.method + '.'
		)
	}

	const bucket = env[binding]
	if (!bucket || typeof bucket.put !== 'function' || typeof bucket.head !== 'function') {
		return __devflareR2PresignError(404, 'unknown_binding', 'R2 binding not found: ' + binding)
	}

	if (request.method === 'PUT') {
		const sentContentType = request.headers.get('Content-Type')
		if (signedContentType !== null && sentContentType !== signedContentType) {
			return __devflareR2PresignError(
				403,
				'content_type_mismatch',
				'URL was presigned for Content-Type "' + signedContentType + '", got "' + sentContentType + '".'
			)
		}

		const body = await request.arrayBuffer()
		if (signedContentLength !== null && body.byteLength !== Number(signedContentLength)) {
			return __devflareR2PresignError(
				403,
				'content_length_mismatch',
				'URL was presigned for exactly ' + signedContentLength + ' bytes, got ' + body.byteLength + '.'
			)
		}
		if (signedMaxSize !== null && body.byteLength > Number(signedMaxSize)) {
			return __devflareR2PresignError(
				413,
				'too_large',
				'Body of ' + body.byteLength + ' bytes exceeds the presigned maximum of ' + signedMaxSize + '.'
			)
		}

		const putContentType = sentContentType || signedContentType || undefined
		const result = await bucket.put(key, body, {
			...(putContentType && { httpMetadata: { contentType: putContentType } })
		})
		return new Response(null, {
			status: 200,
			headers: { ...__devflareR2PresignCors, ...(result?.httpEtag && { ETag: result.httpEtag }) }
		})
	}

	// GET / HEAD
	const objectHeaders = (object) => ({
		...__devflareR2PresignCors,
		'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
		'Content-Length': String(object.size),
		...(object.httpEtag && { ETag: object.httpEtag })
	})

	if (request.method === 'HEAD') {
		const object = await bucket.head(key)
		if (!object) return __devflareR2PresignError(404, 'not_found', 'Object not found: ' + key)
		return new Response(null, { status: 200, headers: objectHeaders(object) })
	}

	const object = await bucket.get(key)
	if (!object) return __devflareR2PresignError(404, 'not_found', 'Object not found: ' + key)
	return new Response(object.body, { status: 200, headers: objectHeaders(object) })
}
`
