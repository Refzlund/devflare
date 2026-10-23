// =============================================================================
// Dev Runtime Status — the contract, and the app-side half of it
// =============================================================================
// The bridge endpoint an app connects to is served from INSIDE the workerd
// runtime (`gateway-script.ts`, on the Miniflare port), so every runtime reload
// is a bridge outage. From the app side those outages are indistinguishable
// from `devflare dev` not running at all — both are a refused socket — and that
// ambiguity is what made the connect budget an unwinnable compromise: long
// enough to ride out a rebuild hangs every request when the dev server is
// genuinely absent, short enough to fail fast cannot outlast one.
//
// The dev server process is the one participant that survives every reload, so
// it answers the question out-of-band, on a loopback listener of its own that
// no runtime restart can take away.
//
// This module owns the vocabulary both ends speak plus the reader the app uses.
// The listener lives in `runtime-status-service.ts`, deliberately separate: it
// needs `node:http`, and this half is imported by `sveltekit/platform.ts` on
// every dev request.
// =============================================================================

/**
 * Every state the dev server can report, as the single list both the type and
 * the wire-shape guard are derived from.
 */
const DEV_RUNTIME_STATES = ['starting', 'ready', 'reloading', 'failed', 'stopping'] as const

/**
 * What the dev server says the local runtime is doing.
 *
 * - `starting` — the coordinator is up but the runtime has not been ready once yet.
 * - `ready` — the runtime answered a liveness probe at the moment of asking.
 * - `reloading` — the runtime is not answering AND the coordinator owns bringing it
 *   back. This covers both a deliberate reload (config/worker/DO change) and a death
 *   the watchdog has yet to notice, because the two are the same fact to a caller:
 *   wait, something is going to fix it.
 * - `failed` — the watchdog stood down after its rebuild budget was spent. Nothing
 *   further is coming; waiting is futile.
 * - `stopping` — the coordinator is shutting down.
 */
export type DevRuntimeState = (typeof DEV_RUNTIME_STATES)[number]

/**
 * What the app SAW when it asked.
 *
 * `'unreachable'` is not a state the coordinator can report — it is the absence of
 * an answer, and so means the dev server itself is gone (never started, exited, or
 * a stale `DEVFLARE_RUNTIME_STATUS_URL` from a previous run). Keeping it in the same
 * union as the reported states is the point of this module: it is exactly the case
 * the connect path must NOT confuse with `reloading`.
 */
export type DevRuntimeReading = DevRuntimeState | 'unreachable'

/** Body of a status response. */
export interface DevRuntimeStatusBody {
	state: DevRuntimeState
}

/** Path the coordinator's status listener answers on. */
export const RUNTIME_STATUS_PATH = '/_devflare/runtime-status'

/**
 * Environment variable carrying the absolute status URL into the app process.
 *
 * A full URL rather than a port: the listener takes an ephemeral port on the
 * loopback interface, so there is nothing for the reader to reconstruct and no
 * default worth guessing — its absence correctly means "no coordinator to ask".
 */
export const RUNTIME_STATUS_URL_ENV = 'DEVFLARE_RUNTIME_STATUS_URL'

/**
 * How long one status read waits. Generous for a loopback GET against an idle
 * Node process, and deliberately longer than the coordinator's own liveness
 * probe so a slow-but-alive coordinator is never misread as absent.
 */
export const RUNTIME_STATUS_READ_TIMEOUT_MS = 1000

/** Whether an arbitrary decoded value is one of the states the coordinator reports. */
function isDevRuntimeState(value: unknown): value is DevRuntimeState {
	return typeof value === 'string' && (DEV_RUNTIME_STATES as readonly string[]).includes(value)
}

/**
 * The status URL for this process, if a `devflare dev` coordinator supplied one.
 *
 * @param env - Environment to read; injectable so the reader is testable without touching `process.env`.
 * @returns The URL, or `undefined` when the app is not running under a coordinator that
 *   offers the channel (a hand-started `vite dev`, or an older dev server).
 */
export function getRuntimeStatusUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
	const url = env[RUNTIME_STATUS_URL_ENV]?.trim()
	return url ? url : undefined
}

/**
 * Ask the coordinator what the local runtime is doing.
 *
 * A read that does not complete IS the answer — `'unreachable'` — rather than an
 * error to propagate: the caller's whole question is "is anyone there?", and a
 * refused connection, a timeout and a garbled body all answer it the same way. This
 * is the modelled-domain-failure case, not a suppressed exception; there is no
 * second consumer that could do anything else with the throw.
 *
 * @param url - Absolute status URL, as published in {@link RUNTIME_STATUS_URL_ENV}.
 * @param options - `timeoutMs` for the single read, and an injectable `fetchImpl` for tests.
 * @returns The reported state, or `'unreachable'` when nothing answered.
 */
export async function readDevRuntimeState(
	url: string,
	options: {
		timeoutMs?: number
		fetchImpl?: typeof fetch
	} = {}
): Promise<DevRuntimeReading> {
	const { timeoutMs = RUNTIME_STATUS_READ_TIMEOUT_MS, fetchImpl = fetch } = options

	try {
		const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
		if (!response.ok) return 'unreachable'

		const body = (await response.json()) as Partial<DevRuntimeStatusBody>
		return isDevRuntimeState(body.state) ? body.state : 'unreachable'
	} catch {
		return 'unreachable'
	}
}
