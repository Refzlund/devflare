// =============================================================================
// Dev Runtime Status Service — the coordinator's out-of-band answer
// =============================================================================
// A loopback listener owned by the dev-server PROCESS, not by the runtime it
// supervises. That is the whole design: the bridge lives inside workerd, so it
// disappears on every reload, while this survives them all — which is what lets
// an app tell "wait, it is coming back" apart from "nothing is running".
//
// Shaped after `email/host-service.ts`, the repo's other host capability
// exposed over loopback.
//
// → KEY: binds 127.0.0.1 on an ephemeral port. Nothing off the machine can
//   reach it, and it takes no port a user could have configured.
// =============================================================================

import { type Server, createServer } from 'node:http'
import {
	type DevRuntimeState,
	type DevRuntimeStatusBody,
	RUNTIME_STATUS_PATH
} from './runtime-status'

/** A running status listener, and how to reach and stop it. */
export interface RuntimeStatusService {
	/** Absolute URL the app reads the runtime state from. */
	url: string
	/** Port the listener bound to. */
	port: number
	/** Stop the listener and release the port. */
	close(): Promise<void>
}

/**
 * Start the loopback runtime-status listener.
 *
 * @param readState - Answers one request. Async so the coordinator can settle the
 *   state against a live liveness probe rather than a cached belief — the ~6s the
 *   watchdog needs to declare a death would otherwise be reported as `ready`, which
 *   is precisely the window this channel exists to cover.
 * @param options.host - Interface to bind. Defaults to `127.0.0.1`; widening it would
 *   publish the dev server's internal state to the network for no gain.
 * @returns The running service.
 * @throws When the listener cannot bind, or binds without reporting a port.
 */
export function startRuntimeStatusService(
	readState: () => Promise<DevRuntimeState>,
	options: { host?: string } = {}
): Promise<RuntimeStatusService> {
	const host = options.host ?? '127.0.0.1'

	const server: Server = createServer((request, response) => {
		if (request.method !== 'GET' || !request.url?.startsWith(RUNTIME_STATUS_PATH)) {
			response.writeHead(404, { 'content-type': 'application/json' })
			response.end(JSON.stringify({ error: 'Not found' }))
			return
		}

		void (async () => {
			try {
				const body: DevRuntimeStatusBody = { state: await readState() }
				response.writeHead(200, { 'content-type': 'application/json' })
				response.end(JSON.stringify(body))
			} catch (error) {
				// The reader treats any non-200 as "nobody answered", which is the right
				// reading: a coordinator that cannot say what its runtime is doing cannot
				// promise to bring it back either. The cause still travels in the body so
				// it is visible to anyone curling this by hand.
				response.writeHead(500, { 'content-type': 'application/json' })
				response.end(
					JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
				)
			}
		})()
	})

	return new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, host, () => {
			const address = server.address()
			if (address === null || typeof address === 'string') {
				reject(new Error('Devflare runtime status service failed to report a port'))
				return
			}

			resolve({
				url: `http://${host}:${address.port}${RUNTIME_STATUS_PATH}`,
				port: address.port,
				close: () =>
					new Promise<void>((closed, failed) => {
						// `close()` alone only refuses NEW connections; it then waits out every socket
						// still open, and the app process polls this endpoint over a keep-alive one.
						// Waiting is exactly wrong here — the caller is `disposeDevServerState`, and a
						// dev server that will not exit is worse than a status read that gets cut off.
						//
						// → GOTCHA: this must come BEFORE `close()`. Both orders work under Node, but
						//   bun's `node:http` only honours it first — called after, the callback still
						//   waits the full socket lifetime (measured: 1ms vs 2973ms). The two calls sit
						//   in one tick, so nothing can connect between them.
						server.closeAllConnections()
						server.close((error) => {
							// And bun's version takes the listener down with the connections, so the
							// `close()` that follows finds nothing left to close. That is the outcome
							// this asked for, not a failure to report.
							if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
								failed(error)
								return
							}
							closed()
						})
					})
			})
		})
	})
}
