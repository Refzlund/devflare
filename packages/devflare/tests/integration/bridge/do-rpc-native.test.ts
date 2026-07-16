// =============================================================================
// DO Native-RPC Integration Test (real gateway runtime)
// =============================================================================
// Exercises the REAL dev-server gateway (getGatewayScript embeds the shared
// GATEWAY_RUNTIME_JS RPC dispatcher) end-to-end against a Durable Object that
// `extends DurableObject` AND defines its own websocket-only fetch() handler.
//
// Reproduces the reported bug: calling an RPC method (env.DO.getByName(id).push)
// through `devflare dev` was mis-routed to the DO's fetch(), which returned a
// 426 text body ("expected a websocket upgrade"); the gateway then tried to
// JSON.parse that body and the call failed with a bogus "is not valid JSON"
// error. The fix dispatches method calls natively (stub[method](...args)) and
// never through fetch(), while fetch()/WebSocket keep reaching the handler.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Miniflare } from 'miniflare'
import { BridgeClient } from '../../../src/bridge/client'
import { createEnvProxy, setBindingHints } from '../../../src/bridge/proxy'
import { getGatewayScript } from '../../../src/dev-server/gateway-script'

const PORT = 9798

// A Durable Object that mirrors the reported ui-dreamer DocRoom: RPC methods
// push()/pull() returning structured values, AND a fetch() that ONLY accepts a
// websocket upgrade (426 for everything else). The RPC methods must be reachable
// without ever touching fetch().
const rpcDoSource = `
import { DurableObject } from 'cloudflare:workers'

export class DocRoom extends DurableObject {
	async push(b64) {
		const seq = ((await this.ctx.storage.get('seq')) ?? 0) + 1
		await this.ctx.storage.put('seq', seq)
		await this.ctx.storage.put('frame:' + seq, b64)
		return { seq }
	}

	async pull(since) {
		const seq = (await this.ctx.storage.get('seq')) ?? 0
		const framesB64 = []
		for (let i = since + 1; i <= seq; i++) {
			const frame = await this.ctx.storage.get('frame:' + i)
			if (frame !== undefined) framesB64.push(frame)
		}
		return { seq, framesB64 }
	}

	fetch(request) {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('expected a websocket upgrade', { status: 426 })
		}
		return new Response(null, { status: 101 })
	}
}
`

type RpcStub = DurableObjectStub & Record<string, (...args: unknown[]) => Promise<unknown>>
type RpcNamespace = { getByName(name: string): RpcStub }

describe('DO native RPC through the real gateway (past a custom fetch handler)', () => {
	let miniflare: Miniflare
	let client: BridgeClient
	let env: Record<string, unknown>

	beforeAll(async () => {
		const { Miniflare } = await import('miniflare')

		miniflare = new Miniflare({
			modules: true,
			script: `${rpcDoSource}\n${getGatewayScript([])}`,
			// A recent compatibility date is required for native Durable Object RPC.
			compatibilityDate: '2026-04-28',
			durableObjects: { DOC_ROOM: 'DocRoom' },
			port: PORT
		})
		await miniflare.ready

		client = new BridgeClient({ url: `ws://127.0.0.1:${PORT}` })
		await client.connect()

		setBindingHints({ DOC_ROOM: 'do' })
		env = createEnvProxy({ client })
	})

	afterAll(async () => {
		await client.disconnect()
		await miniflare.dispose()
	})

	test('push() returns its structured value instead of the fetch 426 / JSON-parse error', async () => {
		const room = (env.DOC_ROOM as RpcNamespace).getByName('room-1')
		const result = await room.push('AAAA')
		expect(result).toEqual({ seq: 1 })
	})

	test('RPC state persists across calls, and pull() returns the pushed frames', async () => {
		const room = (env.DOC_ROOM as RpcNamespace).getByName('room-2')
		expect(await room.push('AAAA')).toEqual({ seq: 1 })
		expect(await room.push('BBBB')).toEqual({ seq: 2 })
		expect(await room.pull(0)).toEqual({ seq: 2, framesB64: ['AAAA', 'BBBB'] })
	})

	test('the DO fetch() handler is still reached for non-RPC requests (426 preserved)', async () => {
		// The RPC fix must not hijack fetch(): a real fetch() still hits the
		// user handler and returns its websocket-only 426.
		const room = (
			env.DOC_ROOM as unknown as {
				getByName(name: string): DurableObjectStub
			}
		).getByName('room-3')
		const response = await room.fetch('http://do/')
		expect(response.status).toBe(426)
		expect(await response.text()).toBe('expected a websocket upgrade')
	})
})
