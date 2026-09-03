// =============================================================================
// DO WebSocket Round-Trip Integration Test
// =============================================================================
// Exercises the REAL dev-server gateway (getGatewayScript embeds the shared
// GATEWAY_RUNTIME_JS WebSocket relay) end-to-end: a BridgeClient opens a DO
// WebSocket via stub.connect() and round-trips both binary and text data in
// both directions. This guards the gateway<->client WsData wire-format
// agreement (a mismatch silently dropped all WS payloads before).
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Miniflare } from 'miniflare'
import { BridgeClient } from '../../../src/bridge/client'
import { createEnvProxy, setBindingHints } from '../../../src/bridge/proxy'
import { getGatewayScript } from '../../../src/dev-server/gateway-script'

const PORT = 9796

// An echo Durable Object that accepts a WebSocket and, for every message,
// echoes the payload back (binary stays binary) and then sends a text marker so
// both the binary and the TEXT-flag DO->client paths are exercised.
const echoDoSource = `
export class EchoWsDO {
	async fetch(request) {
		if (request.headers.get('Upgrade') === 'websocket') {
			const { 0: client, 1: server } = new WebSocketPair()
			server.accept()
			server.addEventListener('message', (event) => {
				if (typeof event.data === 'string') {
					server.send('echo:' + event.data)
				} else {
					server.send(event.data)
					server.send('text-after-binary')
				}
			})
			return new Response(null, { status: 101, webSocket: client })
		}
		return new Response('echo do')
	}
}
`

type ConnectStub = { connect(url: string, options?: { headers?: HeadersInit }): Promise<Socket> }
type ConnectNamespace = { getByName(name: string): ConnectStub }

describe('DO WebSocket relay (real gateway runtime)', () => {
	let miniflare: Miniflare
	let client: BridgeClient
	let env: Record<string, unknown>

	beforeAll(async () => {
		const { Miniflare } = await import('miniflare')

		miniflare = new Miniflare({
			modules: true,
			script: `${echoDoSource}\n${getGatewayScript([])}`,
			durableObjects: { ECHO: 'EchoWsDO' },
			port: PORT
		})
		await miniflare.ready

		client = new BridgeClient({ url: `ws://127.0.0.1:${PORT}` })
		await client.connect()

		setBindingHints({ ECHO: 'do' })
		env = createEnvProxy({ client })
	})

	afterAll(async () => {
		await client.disconnect()
		await miniflare.dispose()
	})

	test('round-trips binary (both directions) and a TEXT-flagged frame through the bridge', async () => {
		const stub = (env.ECHO as ConnectNamespace).getByName('room-1')
		const socket = await stub.connect('https://do/ws', {
			headers: { Upgrade: 'websocket' }
		})

		const writer = socket.writable.getWriter()
		const reader = socket.readable.getReader()

		// client -> DO (inbound binary WsData decode) and DO -> client (outbound
		// binary WsData encode): the exact bytes must survive the round-trip.
		await writer.write(new Uint8Array([1, 2, 3, 4, 250]))

		const first = await reader.read()
		expect(first.done).toBe(false)
		expect([...(first.value ?? [])]).toEqual([1, 2, 3, 4, 250])

		// DO -> client text frame (TEXT flag honored): arrives as decoded bytes.
		const second = await reader.read()
		expect(second.done).toBe(false)
		expect(new TextDecoder().decode(second.value)).toBe('text-after-binary')

		await writer.close()
		await socket.close()
	})
})
