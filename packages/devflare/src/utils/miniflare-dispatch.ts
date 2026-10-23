// =============================================================================
// Miniflare Dispatch — `dispatchFetch` that reaches the runtime under Bun too
// =============================================================================
/*
	→ GOTCHA (Bun): Miniflare 5's `dispatchFetch` no longer rewrites the request
	  URL to the runtime's address. It leaves `http://localhost/…` as written and
	  relies on an undici `dispatcher` to redirect the connection. Bun's built-in
	  `undici` ignores `dispatcher`, so under Bun the request goes to whatever the
	  URL names — `http://localhost/` reaches port 80 of the machine, not the
	  worker. Miniflare 4 rewrote the URL itself, which is why this only surfaced
	  with the upgrade. Under Node the dispatcher works and nothing changes here.
	→ Under Bun the worker therefore sees the runtime's own host in `request.url`
	  (`127.0.0.1:<port>`), exactly as it did with Miniflare 4 under Bun: the
	  header Miniflare uses to carry the original URL is added by that same
	  ignored dispatcher.
*/

import type { Miniflare } from 'miniflare'

/** The slice of a Miniflare instance dispatching needs. */
type DispatchTarget = Pick<Miniflare, 'dispatchFetch' | 'ready'>

/** `dispatchFetch`'s own parameters, so callers keep Miniflare's request/cf typing. */
type DispatchArgs = Parameters<Miniflare['dispatchFetch']>

/**
 * @description Dispatches a request to a Miniflare instance's runtime. Under
 * Bun the URL is first pointed at the runtime's own origin (see the file note),
 * keeping path, query, method, headers, body, abort signal and any `cf` override.
 * @param miniflare - the instance to dispatch into
 * @param input - URL or request, as for `Miniflare#dispatchFetch`
 * @param init - request init, as for `Miniflare#dispatchFetch`
 * @returns the runtime's response
 */
export async function dispatchFetchToRuntime(
	miniflare: DispatchTarget,
	input: DispatchArgs[0],
	init?: DispatchArgs[1]
): ReturnType<Miniflare['dispatchFetch']> {
	if (process.versions.bun === undefined) {
		return miniflare.dispatchFetch(input, init)
	}

	const request = new Request(input as RequestInfo, init as RequestInit)
	const runtimeUrl = await miniflare.ready
	const url = new URL(request.url)
	url.protocol = runtimeUrl.protocol
	url.host = runtimeUrl.host

	const cf = (init as { cf?: unknown } | undefined)?.cf ?? (input as { cf?: unknown }).cf
	return miniflare.dispatchFetch(url.href, {
		method: request.method,
		headers: request.headers,
		body: request.body,
		redirect: request.redirect,
		// Without it, a caller that aborts (a dropped client, a timeout) leaves the
		// runtime request running, which the untouched Node path would cancel.
		signal: request.signal,
		...(cf !== undefined && { cf })
	} as unknown as DispatchArgs[1])
}
