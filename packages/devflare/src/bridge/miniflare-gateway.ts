// =============================================================================
// Miniflare Gateway Assembly — script generation + R2 presign wiring
// =============================================================================
// The gateway worker script and the per-boot R2 presign setup used by
// `startMiniflare()` (`./miniflare.ts`). Split out so the orchestration file
// stays focused on translating options into Miniflare config.
// =============================================================================

import { GATEWAY_RUNTIME_JS } from './gateway-runtime'
import { R2_PRESIGN_RUNTIME_JS } from './r2-presign-runtime'

/**
 * Local presign context for a running Miniflare instance: the HTTP origin the
 * gateway listens on plus the per-boot HMAC secret it validates presigned R2
 * URLs with. Feed these to `presignR2Put`/`presignR2Get` (as
 * `DEVFLARE_R2_PRESIGN_ORIGIN`/`DEVFLARE_R2_PRESIGN_SECRET` env values) to
 * mint URLs this instance accepts.
 */
export interface R2PresignContext {
	/** Gateway HTTP origin, e.g. `http://127.0.0.1:8787`. */
	origin: string
	/** Per-boot HMAC signing secret shared with the gateway worker. */
	secret: string
}

/** Binding-map shapes accepted by Miniflare options (array or name → id record). */
type NamedBindings = string[] | Record<string, string> | undefined

/** Whether a Miniflare binding map actually declares at least one binding. */
export function hasNamedBindings(bindings: NamedBindings): boolean {
	if (!bindings) {
		return false
	}

	if (Array.isArray(bindings)) {
		return bindings.length > 0
	}

	return Object.keys(bindings).length > 0
}

/**
 * Generates a lightweight HTTP-only gateway worker script for
 * `startMiniflare()` usage (tests, scripts, programmatic access).
 *
 * The RPC dispatch logic is shared with `dev-server/gateway-script.ts` via
 * `GATEWAY_RUNTIME_JS`, and the local presigned-R2 endpoint via
 * `R2_PRESIGN_RUNTIME_JS`. This gateway exposes the dispatcher over a plain
 * HTTP endpoint (`POST /_devflare/rpc`). The full WebSocket bridge with
 * streaming and WebSocket proxying lives in `./server.ts` / the dev-server
 * gateway.
 */
export function generateGatewayScript(): string {
	return `
${GATEWAY_RUNTIME_JS}

${R2_PRESIGN_RUNTIME_JS}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)

		const presignResponse = await __devflareR2PresignHandle(request, env, url)
		if (presignResponse) {
			return presignResponse
		}

		if (url.pathname === '/_devflare/health') {
			return new Response(JSON.stringify({ ok: true, status: 'ok', bindings: Object.keys(env) }), {
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (url.pathname === '/_devflare/rpc' && request.method === 'POST') {
			try {
				const { method, params } = await request.json()
				const result = await executeRpcMethod(method, params, env, ctx)
				return new Response(JSON.stringify({ ok: true, result }), {
					headers: { 'Content-Type': 'application/json' }
				})
			} catch (error) {
				return new Response(JSON.stringify({
					ok: false,
					error: { code: error?.code || 'RPC_ERROR', message: error?.message || String(error) }
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}

		return new Response('Devflare Gateway', { status: 200 })
	}
}
`
}

/**
 * Ensure a per-boot R2 presign secret is present in the worker bindings when
 * R2 buckets are configured, so the embedded gateway endpoint can validate
 * presigned URLs. Respects a caller-provided secret; returns a `null` context
 * (and the options untouched) when the instance has no R2 buckets.
 */
export function resolveR2PresignSetup<
	TOptions extends {
		r2Buckets?: NamedBindings
		port?: number
		bindings?: Record<string, unknown>
	}
>(options: TOptions): { options: TOptions; r2Presign: R2PresignContext | null } {
	if (!hasNamedBindings(options.r2Buckets)) {
		return { options, r2Presign: null }
	}

	const provided = options.bindings?.DEVFLARE_R2_PRESIGN_SECRET
	const secret =
		typeof provided === 'string' && provided.length > 0
			? provided
			: `${crypto.randomUUID()}${crypto.randomUUID()}`
	const origin = `http://127.0.0.1:${options.port ?? 8787}`

	return {
		options: {
			...options,
			bindings: {
				...options.bindings,
				DEVFLARE_R2_PRESIGN_SECRET: secret,
				DEVFLARE_R2_PRESIGN_ORIGIN: origin
			}
		},
		r2Presign: { origin, secret }
	}
}
