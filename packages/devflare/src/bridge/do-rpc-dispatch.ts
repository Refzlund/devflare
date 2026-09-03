// =============================================================================
// Durable Object RPC Dispatch — native-first, fetch `_rpc` fallback
// =============================================================================
// Used by the canonical gateway (`src/bridge/server.ts`). The inlined dev
// gateway keeps a behavior-equivalent copy in `GATEWAY_RUNTIME_JS`
// (`src/bridge/gateway-runtime.ts`) because it runs inside the Miniflare sandbox
// and cannot import from the host package — keep the two in sync.
// =============================================================================

/**
 * Dispatch a single Durable Object RPC method call to its stub.
 *
 * A DO that `extends DurableObject` (from `cloudflare:workers`) exposes its
 * methods as native RPC on the stub, so the method is invoked DIRECTLY as
 * `stub[method](...args)` — exactly as on real Cloudflare. This is the ONLY
 * correct path for a DO that ALSO defines its own `fetch()`: routing the call
 * through `fetch()` would hand devflare's internal `_rpc` probe to the user
 * handler, which may reject it (e.g. a websocket-only `fetch()` returning 426),
 * yielding a non-JSON body that then fails to parse.
 *
 * The fetch `_rpc` convention is kept only as a fallback for DOs that are not
 * RPC-enabled (see `callDurableObjectRpcViaFetch`).
 *
 * @param stub - The resolved Durable Object stub to dispatch against.
 * @param methodName - The RPC method name requested by the client proxy.
 * @param args - The already-deserialized positional arguments for the method.
 * @returns The method's return value (or the `_rpc` fallback's result).
 * @throws Re-throws any genuine error from the method; only a workerd
 *   "does not support RPC" signal is swallowed to trigger the fetch fallback.
 */
export async function callDurableObjectRpc(
	stub: DurableObjectStub,
	methodName: string,
	args: unknown[]
): Promise<unknown> {
	// biome-ignore lint/suspicious/noExplicitAny: RPC methods are dispatched dynamically by name.
	const dynamicStub = stub as any
	if (typeof dynamicStub[methodName] === 'function') {
		try {
			return await dynamicStub[methodName](...args)
		} catch (error) {
			if (!isDurableObjectRpcUnsupported(error)) {
				throw error
			}
			// The stub proxies every property as callable, so a non-RPC DO only
			// reveals itself when the call throws; fall through to `_rpc`.
		}
	}
	return callDurableObjectRpcViaFetch(stub, methodName, args)
}

/**
 * Legacy fallback: call a DO method through its `fetch()` handler using the
 * `POST /_rpc` convention (`{ ok, result, error }` JSON envelope). Retained for
 * DOs that expose methods via a fetch dispatcher rather than native RPC.
 *
 * @param stub - The resolved Durable Object stub.
 * @param methodName - The method name to place in the `_rpc` envelope.
 * @param args - Positional arguments serialized as `params`.
 * @returns The `result` field of the DO's `_rpc` JSON response.
 * @throws When the DO reports `ok: false` (surfacing its error message).
 */
async function callDurableObjectRpcViaFetch(
	stub: DurableObjectStub,
	methodName: string,
	args: unknown[]
): Promise<unknown> {
	const response = await stub.fetch(
		new Request('http://do/_rpc', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ method: methodName, params: args })
		})
	)

	const result = (await response.json()) as {
		ok: boolean
		result?: unknown
		error?: { message: string }
	}
	if (!result.ok) {
		throw new Error(result.error?.message ?? 'DO RPC failed')
	}
	return result.result
}

/**
 * True when `error` is workerd's signal that a Durable Object has no native RPC
 * (its class was not declared `extends DurableObject`) — the cue to fall back to
 * the fetch `_rpc` convention rather than surfacing the error to the caller.
 *
 * @param error - The value thrown by a native `stub[method](...)` attempt.
 * @returns Whether the message identifies a non-RPC-enabled Durable Object.
 */
function isDurableObjectRpcUnsupported(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return message.includes('does not support RPC')
}
