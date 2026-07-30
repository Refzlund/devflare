// =============================================================================
// Runtime Health — notice when the Miniflare runtime has gone away
// =============================================================================
// Miniflare runs the worker in a workerd child process. That child can die
// without devflare doing anything to it — and nothing in the dev server was
// watching, so the coordinator and Vite both kept running against a runtime
// that no longer existed. Every request then failed to reach the bridge and the
// app served "<BINDING> ... is missing" forever, with no log saying why.
//
// This module owns the detection half: a cheap liveness probe, and a watchdog
// that turns a run of failed probes into a single "the runtime is gone" signal.
// Rebuilding the runtime is the caller's job.
// =============================================================================

import { connect } from 'node:net'
import type { ConsolaInstance } from 'consola'

/** How often the runtime is probed. Cheap enough to be free, quick enough to catch a death between requests. */
export const RUNTIME_PROBE_INTERVAL_MS = 2000
/**
 * Consecutive failed probes before the runtime is declared gone. More than one so a probe that lands
 * inside a legitimate reload — when the listener is briefly absent — does not trigger a rebuild.
 */
export const RUNTIME_PROBE_FAILURE_THRESHOLD = 3
/** How long a single probe waits for the connection before counting as a failure. */
export const RUNTIME_PROBE_TIMEOUT_MS = 1000
/**
 * How many times an outage may be recovered before the watchdog stands down. A runtime that dies
 * immediately on every rebuild is broken in a way retrying cannot fix; looping on it would bury the
 * real error under restart noise.
 */
export const RUNTIME_RECOVERY_ATTEMPT_LIMIT = 3

/**
 * Whether something is accepting connections at this address.
 *
 * A plain TCP connect, deliberately: the bridge only needs the listener to exist, and an HTTP request
 * would need a route that is meaningful for every app shape — a worker that 500s, hangs, or has no
 * matching route would then read as "dead" and have its runtime rebuilt underneath it. The tradeoff
 * is that a FOREIGN listener on the same port reads as alive; that only matters if something else
 * seizes the port while the runtime is down, in which case the rebuild fails on the address anyway
 * and the attempt limit reports it.
 *
 * @param options - `host`/`port` of the runtime, and how long to wait before giving up on the connect.
 * @returns true when the connection was accepted.
 */
export function probeTcpReachable(options: {
	host: string
	port: number
	timeoutMs?: number
}): Promise<boolean> {
	const { host, port, timeoutMs = RUNTIME_PROBE_TIMEOUT_MS } = options

	return new Promise<boolean>((resolve) => {
		let settled = false
		const settle = (reachable: boolean) => {
			if (settled) return
			settled = true
			socket.destroy()
			resolve(reachable)
		}

		const socket = connect({ host, port })
		socket.setTimeout(timeoutMs)
		socket.once('connect', () => settle(true))
		socket.once('timeout', () => settle(false))
		// `on`, not `once`: a socket can emit a second error after `destroy()`, and an unhandled
		// 'error' on a stream is a process-level throw.
		socket.on('error', () => settle(false))
	})
}

/**
 * A connect target that is dialable regardless of the address the runtime was bound to.
 *
 * A wildcard bind is not itself a valid destination on every platform, so probe the loopback address
 * of the SAME family. The families do not cross: a `::` bind is reachable on `::1` and NOT on
 * `127.0.0.1`, so collapsing both wildcards to the IPv4 loopback makes a healthy IPv6 runtime look
 * dead — and the watchdog would then kill and rebuild it on a loop.
 *
 * @param host - the configured Miniflare host.
 * @returns a host that can be connected to.
 */
export function dialableHost(host: string): string {
	if (host === '::') return '::1'
	if (host === '0.0.0.0') return '127.0.0.1'
	return host
}

export interface RuntimeWatchdogOptions {
	/** Answers "is the runtime still there?"; injected so the schedule can be tested without sockets. */
	probe: () => Promise<boolean>
	/** Invoked once per outage, after {@link RUNTIME_PROBE_FAILURE_THRESHOLD} consecutive failures. */
	onRuntimeLost: () => Promise<void>
	/** Probe period. */
	intervalMs?: number
	/** Consecutive failures that constitute an outage. */
	failureThreshold?: number
	/** Consecutive unrecovered outages before the watchdog stands down. */
	recoveryAttemptLimit?: number
	/** Schedules the next probe; injected so tests can drive the clock. */
	setTimer?: (fn: () => void, ms: number) => unknown
	/** Cancels a scheduled probe. */
	clearTimer?: (handle: unknown) => void
	logger?: ConsolaInstance
}

export interface RuntimeWatchdog {
	/** Stop probing. Idempotent. */
	stop(): void
}

/**
 * Watch a runtime and report it lost when it stops answering.
 *
 * The next probe is scheduled only once the previous one (and any rebuild it triggered) has finished,
 * so a slow rebuild cannot stack up signals. Reaching the threshold resets the failure count, which
 * spaces successive rebuild attempts a full threshold apart instead of firing on every probe.
 *
 * @param options - see {@link RuntimeWatchdogOptions}.
 * @returns a handle whose `stop()` ends the watch.
 */
export function createRuntimeWatchdog(options: RuntimeWatchdogOptions): RuntimeWatchdog {
	const {
		probe,
		onRuntimeLost,
		intervalMs = RUNTIME_PROBE_INTERVAL_MS,
		failureThreshold = RUNTIME_PROBE_FAILURE_THRESHOLD,
		recoveryAttemptLimit = RUNTIME_RECOVERY_ATTEMPT_LIMIT,
		setTimer = (fn, ms) => setTimeout(fn, ms),
		clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
		logger
	} = options

	let stopped = false
	let timer: unknown = null
	let consecutiveFailures = 0
	// Counts rebuilds since the runtime was last seen alive; a successful probe clears it.
	let recoveryAttempts = 0

	function scheduleNext(): void {
		if (stopped) return
		timer = setTimer(() => {
			void tick()
		}, intervalMs)
	}

	async function tick(): Promise<void> {
		if (stopped) return

		const reachable = await probe().catch(() => false)
		if (stopped) return

		if (reachable) {
			consecutiveFailures = 0
			recoveryAttempts = 0
			scheduleNext()
			return
		}

		consecutiveFailures++
		if (consecutiveFailures < failureThreshold) {
			scheduleNext()
			return
		}

		recoveryAttempts++

		if (recoveryAttempts > recoveryAttemptLimit) {
			logger?.error(
				`The local runtime keeps going away after ${recoveryAttemptLimit} rebuild attempts. ` +
					'Giving up so the real error stays visible — restart `devflare dev` once it is resolved.'
			)
			stop()
			return
		}

		try {
			await onRuntimeLost()
		} catch (error) {
			logger?.error('[devflare dev] runtime rebuild failed:', error)
		}

		// Require another full threshold run before rebuilding again, so a rebuild that takes a moment
		// to bind is not immediately retried on top of itself.
		consecutiveFailures = 0
		scheduleNext()
	}

	function stop(): void {
		if (stopped) return
		stopped = true
		if (timer !== null) {
			clearTimer(timer)
			timer = null
		}
	}

	scheduleNext()

	return { stop }
}
