// =============================================================================
// Bridge Transport v2 â€” End-to-End Codec + Streaming Serialization Tests
// =============================================================================
//
// These tests use the in-memory `createTransportV2Pair()` to wire two
// `TransportV2Codec` instances together and exercise the full v2 stack:
// handshake, RPC, and streaming `Request`/`Response` body transfer through
// `serializeRequestV2` / `deserializeRequestV2`.
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	TransportV2Codec,
	createTransportV2Pair,
	deserializeRequestV2,
	deserializeResponseV2,
	serializeRequestV2,
	serializeResponseV2
} from '../../../../src/bridge/v2'

function pair(opts?: {
	clientCaps?: string[]
	serverCaps?: string[]
	onServerCall?: (call: import('../../../../src/bridge/v2').TransportV2RpcCall, server: TransportV2Codec) => void
}) {
	const { a, b } = createTransportV2Pair()
	const client = new TransportV2Codec(a, { capabilities: opts?.clientCaps ?? [] })
	const server = new TransportV2Codec(b, {
		capabilities: opts?.serverCaps ?? [],
		onRpcCall: (call) => opts?.onServerCall?.(call, server)
	})
	return { client, server }
}

describe('TransportV2Codec â€” handshake', () => {
	test('client.sendHello() resolves both sides with the negotiated capability intersection', async () => {
		const { client, server } = pair({
			clientCaps: ['streaming-bodies', 'codegen-gateway', 'experimental'],
			serverCaps: ['streaming-bodies', 'codegen-gateway']
		})
		client.sendHello()
		const [clientResult, serverResult] = await Promise.all([client.handshake, server.handshake])
		expect(clientResult.protocolVersion).toBe(2)
		expect(serverResult.protocolVersion).toBe(2)
		expect(clientResult.capabilities).toEqual(['codegen-gateway', 'streaming-bodies'])
		expect(serverResult.capabilities).toEqual(['codegen-gateway', 'streaming-bodies'])
	})

	test('handshake rejects when the underlying transport closes before completion', async () => {
		const { client, server } = pair()
		// Pre-attach a catch on the server side so its rejection (when the
		// peer's close cascades through) does not surface as an unhandled
		// promise rejection in the test runner.
		server.handshake.catch(() => { })
		client.close(1000, 'before hello')
		await expect(client.handshake).rejects.toThrow(/v2 transport closed/)
	})
})

describe('TransportV2Codec â€” RPC', () => {
	test('client.call resolves with the server\'s rpc.ok result', async () => {
		const { client, server } = pair({
			onServerCall: (call, srv) => {
				if (call.method === 'echo') srv.respondOk(call.id, call.params[0])
			}
		})
		client.sendHello()
		await Promise.all([client.handshake, server.handshake])
		const result = await client.call('echo', ['hello world'])
		expect(result).toBe('hello world')
	})

	test('client.call rejects with the server\'s rpc.err message', async () => {
		const { client, server } = pair({
			onServerCall: (call, srv) => {
				srv.respondErr(call.id, { code: 'EBOOM', message: 'server exploded', details: { trace: 'x' } })
			}
		})
		client.sendHello()
		await Promise.all([client.handshake, server.handshake])
		await expect(client.call('whatever')).rejects.toMatchObject({
			message: 'server exploded'
		})
	})

	test('all pending RPC calls reject when the codec closes', async () => {
		const { client, server } = pair({
			// Server intentionally never replies.
			onServerCall: () => { }
		})
		client.sendHello()
		await Promise.all([client.handshake, server.handshake])
		const pending = client.call('never-resolves')
		client.close()
		await expect(pending).rejects.toThrow(/v2 transport closed/)
	})
})

describe('serializeRequestV2 / deserializeRequestV2 â€” streaming bodies', () => {
	test('round-trips a streaming Request body through v2 without buffering', async () => {
		const { client, server } = pair()
		client.sendHello()
		await Promise.all([client.handshake, server.handshake])

		const sourceText = 'a'.repeat(1500)
		const sourceRequest = new Request('https://example.com/upload', {
			method: 'POST',
			headers: { 'content-type': 'text/plain', 'content-length': String(sourceText.length) },
			body: sourceText
		})

		const serverCall = new Promise<string>((resolve, reject) => {
			server.setRpcCallHandler((call) => {
				if (call.method !== 'upload') return
				try {
					const serialized = call.params[0] as import('../../../../src/bridge/v2').TransportV2SerializedRequest
					const reconstructed = deserializeRequestV2(serialized, server)
					reconstructed.text().then((text) => {
						server.respondOk(call.id, { length: text.length })
						resolve(text)
					}).catch(reject)
				} catch (error) {
					reject(error as Error)
				}
			})
		})

		const { serialized, bodyStreamPromise } = serializeRequestV2(sourceRequest, client, 'rpc_test_1')
		expect(serialized.body?.type).toBe('stream')

		const replyPromise = client.call('upload', [serialized])
		await bodyStreamPromise
		const [reply, serverText] = await Promise.all([replyPromise, serverCall])

		expect(reply).toEqual({ length: sourceText.length })
		expect(serverText).toBe(sourceText)
	})

	test('serializeRequestV2 emits no body ref for an empty body', () => {
		const { client } = pair()
		const request = new Request('https://example.com/', { method: 'GET' })
		const { serialized } = serializeRequestV2(request, client, 'rpc_x')
		expect(serialized.body).toBeNull()
	})

	test('round-trips a streaming Response body through v2 without buffering', async () => {
		const { client, server } = pair()
		client.sendHello()
		await Promise.all([client.handshake, server.handshake])

		const responseText = 'response-bytes-' + 'b'.repeat(500)

		server.setRpcCallHandler((call) => {
			if (call.method !== 'download') return
			const response = new Response(responseText, {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			})
			const { serialized, bodyStreamPromise } = serializeResponseV2(response, server, call.id)
			server.respondOk(call.id, { response: serialized })
			bodyStreamPromise.catch(() => { })
		})

		const reply = await client.call('download', [])
		const serializedResponse = (reply as { response: import('../../../../src/bridge/v2').TransportV2SerializedResponse }).response
		const reconstructed = deserializeResponseV2(serializedResponse, client)
		const text = await reconstructed.text()
		expect(reconstructed.status).toBe(200)
		expect(text).toBe(responseText)
	})
})

describe('TransportV2Codec â€” frame routing isolation', () => {
	test('non-v2 control messages are forwarded to onUnknownControl', async () => {
		const { a, b } = createTransportV2Pair()
		const seen: string[] = []
		const left = new TransportV2Codec(a, { onUnknownControl: (m) => seen.push(m) })
		const right = new TransportV2Codec(b)
		// No handshake in this test; pre-catch to suppress unhandled rejection on close.
		left.handshake.catch(() => { })
		right.handshake.catch(() => { })
		// Manually post a v1 message kind:
		right.sendText('{"t":"event","topic":"v1-topic","data":42}')
		// Wait one microtask cycle for delivery.
		await Promise.resolve()
		await Promise.resolve()
		expect(seen).toEqual(['{"t":"event","topic":"v1-topic","data":42}'])
		left.close()
		right.close()
	})

	test('non-BodyChunk binary frames are forwarded to onUnknownBinary', async () => {
		const { a, b } = createTransportV2Pair()
		const seen: import('../../../../src/bridge/v2').TransportV2DecodedBinaryFrame[] = []
		const left = new TransportV2Codec(a, { onUnknownBinary: (f) => seen.push(f) })
		const right = new TransportV2Codec(b)
		left.handshake.catch(() => { })
		right.handshake.catch(() => { })
		const { encodeTransportV2BinaryFrame, TransportV2BinaryKind } = await import('../../../../src/bridge/v2')
		right.sendBinary(
			encodeTransportV2BinaryFrame(TransportV2BinaryKind.WsData, 1, 0, 0, new Uint8Array([1, 2, 3]))
		)
		await Promise.resolve()
		await Promise.resolve()
		expect(seen).toHaveLength(1)
		expect(seen[0]!.kind).toBe(TransportV2BinaryKind.WsData)
		expect([...seen[0]!.payload]).toEqual([1, 2, 3])
		left.close()
		right.close()
	})
})

describe('TransportV2Codec — B5-frame: out-of-band wire error', () => {
	test('sendWireError on one side fires onWireError on the other', async () => {
		const { a, b } = createTransportV2Pair()
		const seen: import('../../../../src/bridge/v2').TransportV2WireError[] = []
		const left = new TransportV2Codec(a, { onWireError: (e) => seen.push(e) })
		const right = new TransportV2Codec(b)
		left.handshake.catch(() => { })
		right.handshake.catch(() => { })
		right.sendWireError({
			scope: 'stream',
			error: { code: 'EBADCHUNK', message: 'malformed body chunk', details: { sid: 7 } },
			refId: 7
		})
		await Promise.resolve()
		await Promise.resolve()
		expect(seen).toHaveLength(1)
		expect(seen[0]!.t).toBe('error')
		expect(seen[0]!.scope).toBe('stream')
		expect(seen[0]!.error.code).toBe('EBADCHUNK')
		expect(seen[0]!.error.message).toBe('malformed body chunk')
		expect(seen[0]!.refId).toBe(7)
		left.close()
		right.close()
	})

	test('malformed error frames fall through to onUnknownControl', async () => {
		const { a, b } = createTransportV2Pair()
		const unknown: string[] = []
		const left = new TransportV2Codec(a, { onUnknownControl: (m) => unknown.push(m) })
		const right = new TransportV2Codec(b)
		left.handshake.catch(() => { })
		right.handshake.catch(() => { })
		// scope missing — must not be parsed as a wire error.
		right.sendText('{"t":"error","error":{"code":"X","message":"y"}}')
		await Promise.resolve()
		await Promise.resolve()
		expect(unknown).toHaveLength(1)
		left.close()
		right.close()
	})
})

