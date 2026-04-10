// =============================================================================
// Case18 Bridge Integration Test
// =============================================================================
// Tests the bridge with case18's ChatRoom DO class
// This validates DO RPC patterns work with real SvelteKit app structures
// =============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import type { Miniflare } from 'miniflare'
import { BridgeClient } from '../../../src/bridge/client'
import { createEnvProxy, setBindingHints } from '../../../src/bridge/proxy'
import { PORTS, createGatewayScript } from './_fixtures'

// =============================================================================
// Helper Types - RPC stubs return `any` for dynamic method access
// =============================================================================

/**
 * RPC-enabled DurableObjectStub that allows calling any method.
 * Used when testing RPC patterns where methods are dynamically invoked.
 */
type RpcStub = DurableObjectStub & Record<string, (...args: unknown[]) => Promise<unknown>>

/**
 * DurableObjectNamespace with RPC-enabled getByName
 */
type RpcNamespace = Omit<DurableObjectNamespace, 'getByName'> & {
	getByName(name: string): RpcStub
}

// =============================================================================
// ChatRoom DO Class Definition
// =============================================================================

const chatRoomDoClass = `
	export class ChatRoom {
		constructor(state, env) {
			this.ctx = state
			this.env = env
			this.roomId = ''
		}

		async fetch(request) {
			const url = new URL(request.url)

			// RPC endpoint
			if (url.pathname === '/_rpc' && request.method === 'POST') {
				try {
					const { method, params } = await request.json()
					const fn = this[method]
					if (typeof fn !== 'function') {
						return Response.json({ ok: false, error: { message: 'Method not found: ' + method } })
					}
					const result = await fn.apply(this, params)
					return Response.json({ ok: true, result })
				} catch (error) {
					return Response.json({ ok: false, error: { message: error.message } })
				}
			}

			// Get room info
			if (url.pathname === '/info') {
				const messageCount = (await this.ctx.storage.list({ prefix: 'msg:' })).size
				return Response.json({
					roomId: this.roomId || 'default',
					messageCount,
					onlineCount: this.ctx.getWebSockets?.()?.length || 0
				})
			}

			// Get message history
			if (url.pathname === '/history') {
				const messages = await this.ctx.storage.list({ prefix: 'msg:' })
				const history = [...messages.values()]
				return Response.json({ messages: history })
			}

			return new Response('ChatRoom DO')
		}

		// RPC: Get online count (returns 0 in test since no WebSockets)
		getOnlineCount() {
			return this.ctx.getWebSockets?.()?.length || 0
		}

		// RPC: Broadcast a system message
		async broadcastSystemMessage(content) {
			const id = crypto.randomUUID()
			const timestamp = Date.now()
			const key = 'msg:' + timestamp + ':' + id
			
			const message = {
				id,
				userId: 'system',
				username: 'System',
				content,
				timestamp,
				roomId: this.roomId || 'default'
			}
			
			await this.ctx.storage.put(key, message)
			return { success: true, messageId: id }
		}

		// RPC: Get message count
		async getMessageCount() {
			const messages = await this.ctx.storage.list({ prefix: 'msg:' })
			return messages.size
		}

		// RPC: Clear all messages
		async clearMessages() {
			const messages = await this.ctx.storage.list({ prefix: 'msg:' })
			if (messages.size > 0) {
				await this.ctx.storage.delete([...messages.keys()])
			}
			return { cleared: messages.size }
		}
	}
`

// Use shared gateway generator - eliminates ~60 lines of duplicate code
const chatRoomWorkerScript = createGatewayScript(chatRoomDoClass, 'Case18 Test Gateway')

// =============================================================================
// Tests
// =============================================================================

describe('Case18 Bridge Integration', () => {
	let miniflare: Miniflare
	let client: BridgeClient
	let env: Record<string, unknown>

	const BRIDGE_PORT = PORTS.case18Do

	beforeAll(async () => {
		// Start Miniflare with case18-like configuration
		const { Miniflare } = await import('miniflare')

		miniflare = new Miniflare({
			modules: true,
			script: chatRoomWorkerScript,
			durableObjects: {
				CHAT_ROOM: 'ChatRoom'
			},
			kvNamespaces: ['CACHE'],
			port: BRIDGE_PORT
		})

		await miniflare.ready

		// Create bridge client
		client = new BridgeClient({
			url: `ws://localhost:${BRIDGE_PORT}`
		})
		await client.connect()

		// Set up binding hints (like devflare config would)
		setBindingHints({
			CHAT_ROOM: 'do',
			CACHE: 'kv'
		})

		// Create env proxy
		env = createEnvProxy({ client })
	})

	afterAll(async () => {
		await client.disconnect()
		await miniflare.dispose()
	})

	describe('ChatRoom DO via Bridge', () => {
		test('can access CHAT_ROOM namespace', () => {
			const chatRoom = env.CHAT_ROOM as RpcNamespace
			expect(chatRoom).toBeDefined()
			expect(typeof chatRoom.idFromName).toBe('function')
			expect(typeof chatRoom.getByName).toBe('function')
		})

		test('can create room via getByName', () => {
			const chatRoom = env.CHAT_ROOM as RpcNamespace
			const room = chatRoom.getByName('test-room')
			expect(room).toBeDefined()
		})

		test('can call getOnlineCount RPC method', async () => {
			const chatRoom = env.CHAT_ROOM as RpcNamespace
			const room = chatRoom.getByName('rpc-count-room')
			
			const count = await room.getOnlineCount()
			expect(count).toBe(0)
		})

		test('can call broadcastSystemMessage RPC method', async () => {
			const chatRoom = env.CHAT_ROOM as RpcNamespace
			const room = chatRoom.getByName('broadcast-room')
			
			// Clear any existing messages first
			await room.clearMessages()
			
			// Broadcast a system message
			const result = await room.broadcastSystemMessage('Hello from test!') as { success: boolean; messageId: string }
			expect(result).toBeDefined()
			expect(result.success).toBe(true)
			expect(result.messageId).toBeDefined()
		})

		test('can call getMessageCount RPC method', async () => {
			const chatRoom = env.CHAT_ROOM as RpcNamespace
			const room = chatRoom.getByName('count-room')
			
			// Clear first
			await room.clearMessages()
			expect(await room.getMessageCount()).toBe(0)
			
			// Add messages
			await room.broadcastSystemMessage('Message 1')
			await room.broadcastSystemMessage('Message 2')
			
			// Count should be 2
			const count = await room.getMessageCount()
			expect(count).toBe(2)
		})

		test('multiple rooms have separate state', async () => {
			const chatRoom = env.CHAT_ROOM as RpcNamespace
			
			const roomA = chatRoom.getByName('separate-a')
			const roomB = chatRoom.getByName('separate-b')
			
			// Clear both
			await roomA.clearMessages()
			await roomB.clearMessages()
			
			// Add different counts
			await roomA.broadcastSystemMessage('A1')
			await roomA.broadcastSystemMessage('A2')
			await roomA.broadcastSystemMessage('A3')
			
			await roomB.broadcastSystemMessage('B1')
			
			// Verify separate state
			expect(await roomA.getMessageCount()).toBe(3)
			expect(await roomB.getMessageCount()).toBe(1)
		})
	})

	describe('KV via Bridge', () => {
		test('can put and get values', async () => {
			const cache = env.CACHE as KVNamespace
			await cache.put('test-key', 'test-value')
			const value = await cache.get('test-key')
			expect(value).toBe('test-value')
		})
	})

	describe('Real-world Usage Pattern', () => {
		test('simulates SvelteKit route handler pattern', async () => {
			// This simulates what a SvelteKit route would do:
			// const { CHAT_ROOM } = platform.env
			// const id = CHAT_ROOM.idFromName(roomId)
			// const stub = CHAT_ROOM.get(id)
			// const response = await stub.fetch(request)
			
			const chatRoom = env.CHAT_ROOM as RpcNamespace
			const room = chatRoom.getByName('sveltekit-pattern-room')
			
			// Clear room
			await room.clearMessages()
			
			// Simulate user actions
			await room.broadcastSystemMessage('User joined')
			await room.broadcastSystemMessage('User sent a message')
			await room.broadcastSystemMessage('User left')
			
			// Check final state
			const count = await room.getMessageCount()
			expect(count).toBe(3)
		})
	})
})
