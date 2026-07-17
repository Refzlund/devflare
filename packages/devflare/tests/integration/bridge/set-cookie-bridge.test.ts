// =============================================================================
// Set-Cookie Fidelity Through the Bridge (workerd gateway)
// =============================================================================
// Regression for multi-`Set-Cookie` corruption: a DO/service response that sets
// several cookies must survive the bridge round-trip as SEPARATE cookies, not a
// single comma-joined value.
//
// The gateway's `serializeResponse` (in `GATEWAY_RUNTIME_JS`) runs inside
// workerd. `Headers.entries()`/`forEach()` there COMBINE multiple `Set-Cookie`
// into one value on a compatibility date < 2023-08-01 (before `getSetCookie`),
// which used to drop the second cookie / mangle the first. This drives the REAL
// gateway script over its `POST /_devflare/rpc` endpoint (the same
// `executeRpcMethod` → `do.fetch` → `serializeResponse` path the bridge client
// uses) and deserializes host-side, asserting both cookies survive on both an
// old and a modern compat date.
// =============================================================================

import { afterAll, describe, expect, test } from 'bun:test'
import type { Miniflare } from 'miniflare'
import { generateGatewayScript } from '../../../src/bridge/miniflare-gateway'
import {
	type SerializedResponse,
	deserializeResponse
} from '../../../src/bridge/v2/value-serialization'

const COOKIE_A = 'a=1; Path=/; SameSite=Lax'
const COOKIE_B = 'b=2; Path=/; HttpOnly'

// A Durable Object that sets two cookies with distinct attributes.
const cookieDoClass = `
	export class CookieDO {
		constructor(state, env) {}
		async fetch(request) {
			const headers = new Headers()
			headers.append('Set-Cookie', ${JSON.stringify(COOKIE_A)})
			headers.append('Set-Cookie', ${JSON.stringify(COOKIE_B)})
			headers.set('Content-Type', 'text/plain')
			return new Response('ok', { headers })
		}
	}
`

/**
 * Spin up the REAL gateway worker (shared `GATEWAY_RUNTIME_JS`) with the
 * cookie-setting DO, do a bridged `do.fetch`, and return the host-side
 * deserialized `Response` plus the raw serialized `Set-Cookie` entries.
 *
 * @param compatibilityDate - The gateway worker's compat date; < 2023-08-01
 *   triggers workerd's `Set-Cookie` combining (the bug), >= keeps them split.
 */
async function fetchThroughBridge(compatibilityDate: string): Promise<{
	dispose: () => Promise<void>
	rawSetCookieEntries: [string, string][]
	response: Response
}> {
	const { Miniflare } = await import('miniflare')
	const mf: Miniflare = new Miniflare({
		modules: true,
		script: `${cookieDoClass}\n${generateGatewayScript()}`,
		durableObjects: { COOKIE_DO: 'CookieDO' },
		compatibilityDate,
		port: 0
	})
	await mf.ready

	const rpc = async (
		method: string,
		params: unknown[]
	): Promise<{ ok: boolean; result: unknown }> => {
		const res = await mf.dispatchFetch('http://localhost/_devflare/rpc', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ method, params })
		})
		return res.json() as Promise<{ ok: boolean; result: unknown }>
	}

	const idResult = await rpc('COOKIE_DO.do.idFromName', ['cookie-room'])
	const serializedRequest = { url: 'http://do/set', method: 'GET', headers: [], body: null }
	const fetchResult = await rpc('COOKIE_DO.do.fetch', [
		'COOKIE_DO',
		idResult.result,
		serializedRequest
	])

	const serialized = fetchResult.result as SerializedResponse
	const rawSetCookieEntries = serialized.headers.filter(
		([key]) => key.toLowerCase() === 'set-cookie'
	)
	const response = deserializeResponse(serialized)

	return { dispose: () => mf.dispose(), rawSetCookieEntries, response }
}

describe('Set-Cookie fidelity through the workerd bridge gateway', () => {
	const instances: Array<() => Promise<void>> = []

	afterAll(async () => {
		await Promise.all(instances.map((dispose) => dispose()))
	})

	// The old compat date is the one that WITHOUT the fix collapses the two
	// cookies into `a=1; ..., b=2; ...`; the modern date is the no-regression
	// guard. Both must round-trip both cookies byte-faithfully.
	for (const compatibilityDate of ['2022-01-01', '2024-01-01']) {
		test(`preserves both Set-Cookie headers (compat ${compatibilityDate})`, async () => {
			const { dispose, rawSetCookieEntries, response } = await fetchThroughBridge(compatibilityDate)
			instances.push(dispose)

			// The gateway must serialize each cookie as its own entry, never one
			// comma-joined value.
			expect(rawSetCookieEntries).toEqual([
				['set-cookie', COOKIE_A],
				['set-cookie', COOKIE_B]
			])

			// And the host-side Response exposes both, attributes intact.
			expect(response.headers.getSetCookie()).toEqual([COOKIE_A, COOKIE_B])
			expect(response.headers.get('content-type')).toBe('text/plain')
		})
	}
})
