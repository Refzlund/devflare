// =============================================================================
// Outbound-email loopback service — workerd → host, during `devflare dev`
// =============================================================================
// In `devflare dev` the local `sendEmail` binding is bundled INTO the composed
// worker, and workerd has no raw sockets — so an SMTP relay cannot live there.
// This is the host-side listener the worker posts a fully-composed message to;
// it is the same shape the browser shim uses to expose a host capability to a
// worker (a loopback HTTP server on 127.0.0.1, its URL baked into the generated
// worker at dev-start).
//
// → KEY: binds 127.0.0.1 only, on an ephemeral port. Nothing off the machine
//   can reach it, and it takes no port a user could have configured.
// =============================================================================

import { type Server, createServer } from 'node:http'
import type { EmailDelivery } from '../utils/email-delivery'
import { handleHostDelivery } from './host-sink'
import type { ResolvedEmailRuntime } from './runtime-config'

/** A running loopback service, and how to reach and stop it. */
export interface OutboundEmailService {
	/** Absolute URL the composed worker posts deliveries to. */
	url: string
	/** Port the service bound to. */
	port: number
	/** Stop the service and release the port. */
	close(): Promise<void>
}

/** Path the loopback service answers on. */
export const OUTBOUND_EMAIL_PATH = '/_devflare/email/outbound'

function readBody(request: import('node:http').IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = ''
		request.setEncoding('utf8')
		request.on('data', (chunk: string) => {
			body += chunk
		})
		request.on('end', () => resolve(body))
		request.on('error', reject)
	})
}

/**
 * Start the loopback outbound-email service.
 *
 * @param getRuntime - Read per request, so a config reload during dev takes
 *   effect without restarting the service.
 * @param options.host - Interface to bind. Defaults to `127.0.0.1`; there is no
 *   reason to widen it, and widening it would expose a mail relay.
 * @returns The running service.
 */
export function startOutboundEmailService(
	getRuntime: () => ResolvedEmailRuntime,
	options: { host?: string } = {}
): Promise<OutboundEmailService> {
	const host = options.host ?? '127.0.0.1'

	const server: Server = createServer((request, response) => {
		if (request.method !== 'POST' || !request.url?.startsWith(OUTBOUND_EMAIL_PATH)) {
			response.writeHead(404, { 'content-type': 'application/json' })
			response.end(JSON.stringify({ error: 'Not found' }))
			return
		}

		// Requiring a JSON content-type keeps a page open in the dev browser from
		// reaching this with a simple (preflight-free) cross-origin POST.
		if (!request.headers['content-type']?.includes('application/json')) {
			response.writeHead(415, { 'content-type': 'application/json' })
			response.end(JSON.stringify({ error: 'Expected content-type: application/json' }))
			return
		}

		void (async () => {
			try {
				const delivery = JSON.parse(await readBody(request)) as EmailDelivery
				const result = await handleHostDelivery(delivery, getRuntime())
				response.writeHead(200, { 'content-type': 'application/json' })
				response.end(JSON.stringify(result))
			} catch (error) {
				// The worker awaits this response, so the failure has to travel
				// back as a body rather than only reaching the dev-server console.
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
				reject(new Error('Devflare outbound email service failed to report a port'))
				return
			}

			resolve({
				url: `http://${host}:${address.port}${OUTBOUND_EMAIL_PATH}`,
				port: address.port,
				close: () =>
					new Promise<void>((closed, failed) => {
						server.close((error) => (error ? failed(error) : closed()))
					})
			})
		})
	})
}
