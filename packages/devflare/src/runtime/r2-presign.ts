// =============================================================================
// R2 Presigned URLs — direct browser ↔ bucket transfers (worker-safe)
// =============================================================================
// One API for both environments:
//   - Production: mints a real S3 SigV4 presigned URL against
//     `https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>` using R2
//     S3 API credentials read from `env` (or passed explicitly).
//   - Devflare local dev / test harness: mints a URL against the devflare
//     gateway's `/_devflare/r2/presigned/<binding>/<key>` endpoint, signed
//     with a per-boot HMAC secret. The gateway validates signature, expiry,
//     method, content type and size before writing to the local R2 binding,
//     so quota/enforcement logic behaves the same as against real R2.
//
// The local canonical-string format MUST stay in sync with the embedded
// gateway validator in `src/bridge/r2-presign-runtime.ts`.
// =============================================================================

import { AwsV4Signer } from 'aws4fetch'

// -----------------------------------------------------------------------------
// Shared local-presign protocol constants
// -----------------------------------------------------------------------------

/** URL path prefix of the local presign endpoint served by devflare gateways. */
export const R2_PRESIGN_LOCAL_PATH_PREFIX = '/_devflare/r2/presigned/'

/** Version tag prepended to the local canonical string (breaks old URLs on format changes). */
const LOCAL_CANONICAL_VERSION = 'devflare:r2-presign:v1'

/** Env/var names devflare injects in local dev + tests to enable local presigning. */
export const R2_PRESIGN_SECRET_VAR = 'DEVFLARE_R2_PRESIGN_SECRET'
export const R2_PRESIGN_ORIGIN_VAR = 'DEVFLARE_R2_PRESIGN_ORIGIN'

/** Var (injected at deploy compile time) mapping R2 binding names to bucket metadata. */
export const R2_BUCKETS_VAR = 'DEVFLARE_R2_BUCKETS'

/** Default env/secret names for R2 S3 API credentials in production. */
export const R2_ACCOUNT_ID_VAR = 'R2_ACCOUNT_ID'
export const R2_ACCESS_KEY_ID_VAR = 'R2_ACCESS_KEY_ID'
export const R2_SECRET_ACCESS_KEY_VAR = 'R2_SECRET_ACCESS_KEY'

/** Maximum expiry accepted by S3-style presigned URLs (7 days, in seconds). */
const MAX_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60

/** Default presigned URL lifetime (15 minutes, in seconds). */
const DEFAULT_EXPIRES_IN_SECONDS = 15 * 60

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * R2 S3 API credentials used for production presigning.
 * Create them under Cloudflare Dashboard → R2 → Manage R2 API Tokens.
 */
export interface R2PresignCredentials {
	/** Cloudflare account id that owns the bucket (not secret). */
	accountId: string
	/** R2 S3 API access key id. */
	accessKeyId: string
	/** R2 S3 API secret access key. Store as a Worker secret, never in config. */
	secretAccessKey: string
}

/**
 * Options shared by `presignR2Put` and `presignR2Get`.
 */
export interface R2PresignBaseOptions {
	/**
	 * URL lifetime in seconds. Enforced by R2 in production and by the
	 * devflare gateway locally.
	 *
	 * @default 900 (15 minutes). Maximum 604800 (7 days).
	 */
	expiresIn?: number

	/**
	 * Production credentials override. When omitted they are read from `env`
	 * under `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
	 * Ignored in local dev (the gateway signs with its own per-boot secret).
	 */
	credentials?: R2PresignCredentials

	/**
	 * Production bucket name override. When omitted it is resolved from the
	 * `DEVFLARE_R2_BUCKETS` var that `devflare` injects at deploy compile
	 * time from `bindings.r2`. Ignored in local dev (the binding name routes
	 * directly to the local bucket).
	 */
	bucketName?: string

	/**
	 * Jurisdiction of the production bucket (e.g. `'eu'`), which changes the
	 * S3 endpoint host. When omitted it is resolved from `DEVFLARE_R2_BUCKETS`
	 * (i.e. from the `jurisdiction` field on the R2 binding config).
	 */
	jurisdiction?: string
}

/**
 * Options for `presignR2Put`.
 */
export interface R2PresignPutOptions extends R2PresignBaseOptions {
	/**
	 * Content type the uploader must send. Enforced cryptographically in both
	 * environments: it is a signed header in production and part of the
	 * signed canonical string locally, so a mismatching `Content-Type` on the
	 * actual PUT is rejected.
	 */
	contentType?: string

	/**
	 * Exact body size in bytes the uploader must send. Enforced in both
	 * environments (signed `Content-Length` header in production; header +
	 * actual byte count locally). Prefer this over `maxSizeBytes` when the
	 * file size is known up front — it is the only size guarantee real R2
	 * presigned PUTs can enforce. GOTCHA: the client must then send a
	 * fixed-size body (`File`/`Blob`/`ArrayBuffer`); a streamed body carries
	 * no `Content-Length` header and fails the signed-header check.
	 */
	contentLength?: number

	/**
	 * Upper size bound in bytes. Enforced by the devflare gateway locally.
	 * GOTCHA: real R2 presigned PUT URLs CANNOT enforce an upper bound —
	 * only an exact signed `Content-Length` — so in production this value is
	 * advisory. Always confirm the object with a server-side `head()` before
	 * committing quota.
	 */
	maxSizeBytes?: number
}

/**
 * Options for `presignR2Get`.
 */
export type R2PresignGetOptions = R2PresignBaseOptions

/**
 * A presigned request the browser can execute directly against storage.
 */
export interface PresignedR2Request {
	/** Fully-signed URL to fetch. Treat as opaque; it embeds the signature. */
	url: string
	/** HTTP method the URL was signed for (`HEAD` is also accepted for `GET` URLs). */
	method: 'PUT' | 'GET'
	/**
	 * Headers the client MUST send for the signature to validate (e.g. the
	 * pinned `content-type`). `content-length` is intentionally omitted —
	 * browsers set it automatically from the request body and reject manual
	 * assignment.
	 */
	headers: Record<string, string>
	/** Moment the URL stops being accepted. */
	expiresAt: Date
	/** Object key the URL operates on. */
	key: string
	/** `'local'` when served by the devflare gateway, `'remote'` for real R2. */
	mode: 'local' | 'remote'
}

/** Parsed entry of the injected `DEVFLARE_R2_BUCKETS` mapping. */
interface R2BucketVarEntry {
	bucketName: string
	jurisdiction?: string
}

// -----------------------------------------------------------------------------
// Env reading
// -----------------------------------------------------------------------------

/**
 * Read a string value by name from the platform `env`, falling back to
 * `process.env`. Handles dev-mode env proxies gracefully: any non-string
 * (e.g. a bridge binding proxy) is treated as absent.
 */
function readEnvString(env: Record<string, unknown>, name: string): string | undefined {
	let own: unknown
	try {
		own = env?.[name]
	} catch {
		own = undefined
	}
	if (typeof own === 'string' && own.length > 0) return own

	const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
		.process?.env
	const fromProcess = processEnv?.[name]
	return typeof fromProcess === 'string' && fromProcess.length > 0 ? fromProcess : undefined
}

/**
 * Resolve the local presign context (origin + secret) injected by devflare in
 * dev/test. Returns `null` outside devflare-managed local environments.
 */
function resolveLocalContext(
	env: Record<string, unknown>
): { origin: string; secret: string } | null {
	const secret = readEnvString(env, R2_PRESIGN_SECRET_VAR)
	const origin = readEnvString(env, R2_PRESIGN_ORIGIN_VAR)
	if (!secret || !origin) return null
	return { origin: origin.replace(/\/$/, ''), secret }
}

/**
 * Parse the injected `DEVFLARE_R2_BUCKETS` mapping from `env`. Accepts either
 * a JSON string var or an already-parsed object (wrangler JSON vars).
 */
function readBucketsVar(env: Record<string, unknown>): Record<string, R2BucketVarEntry> | null {
	let raw: unknown
	try {
		raw = env?.[R2_BUCKETS_VAR]
	} catch {
		return null
	}
	if (raw === undefined || raw === null) {
		const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
			.process?.env
		raw = processEnv?.[R2_BUCKETS_VAR]
	}

	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw)
		} catch {
			return null
		}
	}
	if (!raw || typeof raw !== 'object') return null

	const entries: Record<string, R2BucketVarEntry> = {}
	for (const [binding, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== 'object') continue
		const bucketName = (value as { bucketName?: unknown }).bucketName
		if (typeof bucketName !== 'string' || bucketName.length === 0) continue
		const jurisdiction = (value as { jurisdiction?: unknown }).jurisdiction
		entries[binding] = {
			bucketName,
			...(typeof jurisdiction === 'string' && jurisdiction.length > 0 && { jurisdiction })
		}
	}
	return entries
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * Validate the binding/key/options tuple shared by PUT and GET presigning.
 * Returns the effective expiry in seconds.
 *
 * @throws {RangeError} on out-of-range `expiresIn`, `contentLength` or `maxSizeBytes`.
 * @throws {TypeError} on an empty binding or key.
 */
function validateCommonInputs(binding: string, key: string, options: R2PresignPutOptions): number {
	if (typeof binding !== 'string' || binding.length === 0) {
		throw new TypeError('[devflare] presignR2*: `binding` must be a non-empty R2 binding name.')
	}
	if (typeof key !== 'string' || key.length === 0) {
		throw new TypeError('[devflare] presignR2*: `key` must be a non-empty object key.')
	}
	if (key.startsWith('/')) {
		throw new TypeError('[devflare] presignR2*: `key` must not start with "/".')
	}
	// Control characters would make the newline-joined local canonical string
	// ambiguous; no legitimate object key needs them.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: the control range is the point
	const controlChars = /[\u0000-\u001f\u007f]/
	if (controlChars.test(key) || controlChars.test(binding)) {
		throw new TypeError(
			'[devflare] presignR2*: `binding`/`key` must not contain control characters.'
		)
	}

	const expiresIn = options.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS
	if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_EXPIRES_IN_SECONDS) {
		throw new RangeError(
			`[devflare] presignR2*: \`expiresIn\` must be an integer between 1 and ${MAX_EXPIRES_IN_SECONDS} seconds (got ${expiresIn}).`
		)
	}

	if (options.contentLength !== undefined) {
		if (!Number.isInteger(options.contentLength) || options.contentLength < 0) {
			throw new RangeError(
				'[devflare] presignR2Put: `contentLength` must be a non-negative integer byte count.'
			)
		}
	}
	if (options.maxSizeBytes !== undefined) {
		if (!Number.isInteger(options.maxSizeBytes) || options.maxSizeBytes < 1) {
			throw new RangeError(
				'[devflare] presignR2Put: `maxSizeBytes` must be a positive integer byte count.'
			)
		}
	}
	if (
		options.contentLength !== undefined &&
		options.maxSizeBytes !== undefined &&
		options.contentLength > options.maxSizeBytes
	) {
		throw new RangeError(
			`[devflare] presignR2Put: \`contentLength\` (${options.contentLength}) exceeds \`maxSizeBytes\` (${options.maxSizeBytes}).`
		)
	}

	return expiresIn
}

// -----------------------------------------------------------------------------
// Key encoding
// -----------------------------------------------------------------------------

/**
 * Percent-encode an object key for use in a URL path, RFC 3986-strict
 * (S3 canonical-URI compatible), preserving `/` as the segment separator.
 */
function encodeKeyPath(key: string): string {
	return key
		.split('/')
		.map((segment) =>
			encodeURIComponent(segment).replace(
				/[!'()*]/g,
				(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
			)
		)
		.join('/')
}

// -----------------------------------------------------------------------------
// Local (devflare gateway) presigning
// -----------------------------------------------------------------------------

/** Compute a lowercase hex HMAC-SHA256 of `message` with `secret` via WebCrypto. */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const encoder = new TextEncoder()
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	)
	const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
	return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Build the canonical string covered by the local signature. MUST match
 * `buildCanonicalString` in `src/bridge/r2-presign-runtime.ts` byte-for-byte.
 */
function buildLocalCanonicalString(input: {
	method: 'PUT' | 'GET'
	binding: string
	key: string
	expires: number
	contentType?: string
	contentLength?: number
	maxSizeBytes?: number
}): string {
	return [
		LOCAL_CANONICAL_VERSION,
		input.method,
		input.binding,
		input.key,
		String(input.expires),
		input.contentType ?? '',
		input.contentLength !== undefined ? String(input.contentLength) : '',
		input.maxSizeBytes !== undefined ? String(input.maxSizeBytes) : ''
	].join('\n')
}

/** Mint a signed URL against the devflare gateway's local presign endpoint. */
async function presignLocal(input: {
	origin: string
	secret: string
	method: 'PUT' | 'GET'
	binding: string
	key: string
	expiresIn: number
	contentType?: string
	contentLength?: number
	maxSizeBytes?: number
}): Promise<PresignedR2Request> {
	const expires = Math.floor(Date.now() / 1000) + input.expiresIn
	const signature = await hmacSha256Hex(
		input.secret,
		buildLocalCanonicalString({
			method: input.method,
			binding: input.binding,
			key: input.key,
			expires,
			contentType: input.contentType,
			contentLength: input.contentLength,
			maxSizeBytes: input.maxSizeBytes
		})
	)

	const url = new URL(
		`${input.origin}${R2_PRESIGN_LOCAL_PATH_PREFIX}${encodeURIComponent(input.binding)}/${encodeKeyPath(input.key)}`
	)
	url.searchParams.set('X-Devflare-Method', input.method)
	url.searchParams.set('X-Devflare-Expires', String(expires))
	if (input.contentType !== undefined) {
		url.searchParams.set('X-Devflare-Content-Type', input.contentType)
	}
	if (input.contentLength !== undefined) {
		url.searchParams.set('X-Devflare-Content-Length', String(input.contentLength))
	}
	if (input.maxSizeBytes !== undefined) {
		url.searchParams.set('X-Devflare-Max-Size', String(input.maxSizeBytes))
	}
	url.searchParams.set('X-Devflare-Signature', signature)

	return {
		url: url.toString(),
		method: input.method,
		headers: input.contentType !== undefined ? { 'content-type': input.contentType } : {},
		expiresAt: new Date(expires * 1000),
		key: input.key,
		mode: 'local'
	}
}

// -----------------------------------------------------------------------------
// Remote (real R2, S3 SigV4) presigning
// -----------------------------------------------------------------------------

/**
 * Resolve production credentials from options or env.
 *
 * @throws {Error} naming exactly which credential values are missing.
 */
function resolveCredentials(
	env: Record<string, unknown>,
	options: R2PresignBaseOptions
): R2PresignCredentials {
	if (options.credentials) return options.credentials

	const accountId = readEnvString(env, R2_ACCOUNT_ID_VAR)
	const accessKeyId = readEnvString(env, R2_ACCESS_KEY_ID_VAR)
	const secretAccessKey = readEnvString(env, R2_SECRET_ACCESS_KEY_VAR)
	if (accountId && accessKeyId && secretAccessKey) {
		return { accountId, accessKeyId, secretAccessKey }
	}

	const missing = [
		!accountId && R2_ACCOUNT_ID_VAR,
		!accessKeyId && R2_ACCESS_KEY_ID_VAR,
		!secretAccessKey && R2_SECRET_ACCESS_KEY_VAR
	].filter(Boolean)
	throw new Error(
		`[devflare] presignR2*: missing R2 S3 credentials (${missing.join(', ')}). ` +
			'Provide them as Worker secrets (`wrangler secret put <NAME>`) or pass ' +
			'`options.credentials`. Create R2 S3 credentials under Cloudflare Dashboard → R2 → ' +
			'Manage R2 API Tokens. In devflare local dev no credentials are needed — this error ' +
			'usually means the code runs in production without the secrets set.'
	)
}

/**
 * Resolve the production bucket for a binding from options or the injected
 * `DEVFLARE_R2_BUCKETS` mapping.
 *
 * @throws {Error} when the bucket cannot be resolved.
 */
function resolveBucket(
	env: Record<string, unknown>,
	binding: string,
	options: R2PresignBaseOptions
): R2BucketVarEntry {
	if (options.bucketName) {
		return {
			bucketName: options.bucketName,
			...(options.jurisdiction && { jurisdiction: options.jurisdiction })
		}
	}

	const entry = readBucketsVar(env)?.[binding]
	if (entry) {
		return {
			bucketName: entry.bucketName,
			...((options.jurisdiction ?? entry.jurisdiction) && {
				jurisdiction: options.jurisdiction ?? entry.jurisdiction
			})
		}
	}

	throw new Error(
		`[devflare] presignR2*: cannot resolve the bucket name for binding '${binding}'. ` +
			`Deploy through devflare (which injects the ${R2_BUCKETS_VAR} var from \`bindings.r2\`) ` +
			'or pass `options.bucketName` explicitly.'
	)
}

/** Mint a real S3 SigV4 presigned URL against the R2 S3 endpoint. */
async function presignRemote(input: {
	credentials: R2PresignCredentials
	bucket: R2BucketVarEntry
	method: 'PUT' | 'GET'
	key: string
	expiresIn: number
	contentType?: string
	contentLength?: number
}): Promise<PresignedR2Request> {
	const jurisdictionHost = input.bucket.jurisdiction ? `.${input.bucket.jurisdiction}` : ''
	const endpoint = new URL(
		`https://${input.credentials.accountId}${jurisdictionHost}.r2.cloudflarestorage.com` +
			`/${input.bucket.bucketName}/${encodeKeyPath(input.key)}`
	)
	endpoint.searchParams.set('X-Amz-Expires', String(input.expiresIn))

	// Headers listed here become part of X-Amz-SignedHeaders, so R2 rejects
	// requests that send different values — that is the enforcement mechanism.
	const signedHeaders: Record<string, string> = {}
	if (input.contentType !== undefined) signedHeaders['content-type'] = input.contentType
	if (input.contentLength !== undefined) {
		signedHeaders['content-length'] = String(input.contentLength)
	}

	const signer = new AwsV4Signer({
		url: endpoint.toString(),
		method: input.method,
		accessKeyId: input.credentials.accessKeyId,
		secretAccessKey: input.credentials.secretAccessKey,
		region: 'auto',
		service: 's3',
		signQuery: true,
		// aws4fetch skips content-type/content-length by default; opt them in.
		allHeaders: true,
		headers: signedHeaders
	})
	const signed = await signer.sign()

	return {
		url: signed.url.toString(),
		method: input.method,
		headers: input.contentType !== undefined ? { 'content-type': input.contentType } : {},
		expiresAt: new Date(Date.now() + input.expiresIn * 1000),
		key: input.key,
		mode: 'remote'
	}
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Presign a direct-to-R2 `PUT` URL for a browser (or any HTTP client) upload.
 *
 * Resolves to a real R2 S3 presigned URL in production and to a signed
 * devflare-gateway URL in local dev and the test harness — same call, same
 * guarantees (signature, expiry, method, content type, size), so upload and
 * quota logic can be exercised identically in every environment.
 *
 * @param env - The platform env (`platform.env` in SvelteKit, `env` in a
 * Worker handler). Used to detect the local dev context and to read
 * production credentials/bucket mapping.
 * @param binding - The R2 binding name from `bindings.r2` (e.g. `'BUCKET'`).
 * @param key - Object key to upload to. Percent-encoding is handled internally.
 * @param options - Expiry, enforcement (content type / length / max size) and
 * production credential overrides.
 * @returns The presigned request: `url` to PUT to, `headers` the client must
 * send, and `expiresAt`.
 * @throws {Error} in production when credentials or the bucket mapping are missing.
 * @throws {TypeError | RangeError} on invalid inputs.
 *
 * @example
 * ```ts
 * // Server (SvelteKit endpoint) — reserve quota first, then presign:
 * const { url, headers } = await presignR2Put(platform.env, 'BUCKET', `media/${id}.png`, {
 *   expiresIn: 600,
 *   contentType: file.type,
 *   contentLength: file.size
 * })
 *
 * // Browser — upload directly to storage:
 * await fetch(url, { method: 'PUT', body: file, headers })
 *
 * // Server — finalize: confirm the object before committing quota:
 * const head = await platform.env.BUCKET.head(`media/${id}.png`)
 * ```
 */
export async function presignR2Put(
	env: Record<string, unknown>,
	binding: string,
	key: string,
	options: R2PresignPutOptions = {}
): Promise<PresignedR2Request> {
	const expiresIn = validateCommonInputs(binding, key, options)

	const local = resolveLocalContext(env)
	if (local) {
		return presignLocal({
			...local,
			method: 'PUT',
			binding,
			key,
			expiresIn,
			contentType: options.contentType,
			contentLength: options.contentLength,
			maxSizeBytes: options.maxSizeBytes
		})
	}

	return presignRemote({
		credentials: resolveCredentials(env, options),
		bucket: resolveBucket(env, binding, options),
		method: 'PUT',
		key,
		expiresIn,
		contentType: options.contentType,
		contentLength: options.contentLength
	})
}

/**
 * Presign a direct-from-R2 `GET` URL (also valid for `HEAD`) so a browser can
 * download an object without routing the bytes through the Worker.
 *
 * Same dev/prod symmetry as {@link presignR2Put}. Note that browser reads
 * from real R2 additionally require CORS rules on the bucket itself.
 *
 * @param env - The platform env (see {@link presignR2Put}).
 * @param binding - The R2 binding name from `bindings.r2`.
 * @param key - Object key to read.
 * @param options - Expiry and production credential overrides.
 * @returns The presigned request; `headers` is always empty for GET.
 * @throws {Error} in production when credentials or the bucket mapping are missing.
 * @throws {TypeError | RangeError} on invalid inputs.
 */
export async function presignR2Get(
	env: Record<string, unknown>,
	binding: string,
	key: string,
	options: R2PresignGetOptions = {}
): Promise<PresignedR2Request> {
	const expiresIn = validateCommonInputs(binding, key, options)

	const local = resolveLocalContext(env)
	if (local) {
		return presignLocal({ ...local, method: 'GET', binding, key, expiresIn })
	}

	return presignRemote({
		credentials: resolveCredentials(env, options),
		bucket: resolveBucket(env, binding, options),
		method: 'GET',
		key,
		expiresIn
	})
}
