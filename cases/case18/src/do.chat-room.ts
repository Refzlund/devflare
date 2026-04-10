// =============================================================================
// Case 18: ChatRoom Durable Object
// =============================================================================
// WebSocket-based chat room with hibernation support for cost savings.
// Demonstrates:
// - WebSocket hibernation API
// - serializeAttachment/deserializeAttachment for state persistence
// - Multi-client coordination
// =============================================================================

import { DurableObject } from 'cloudflare:workers'
import type { DurableObjectNamespace } from '@cloudflare/workers-types'
import { ChatMessage, UserPresence, type ChatMessageData, type UserPresenceData } from '$lib/models'

interface WebSocketData {
	userId: string
	username: string
	joinedAt: number
}

interface StoredMessage {
	id: string
	userId: string
	username: string
	content: string
	timestamp: number
}

interface Env {
	CHAT_ROOM: DurableObjectNamespace
}

export class ChatRoom extends DurableObject<Env> {
	private roomId: string = ''

	/**
	 * Handle HTTP requests (including WebSocket upgrades)
	 */
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)

		// WebSocket upgrade request
		if (request.headers.get('Upgrade') === 'websocket') {
			return this.handleWebSocketUpgrade(request, url)
		}

		// Get room info
		if (url.pathname === '/info') {
			return this.handleGetInfo()
		}

		// Get message history
		if (url.pathname === '/history') {
			return this.handleGetHistory()
		}

		// Get online users
		if (url.pathname === '/users') {
			return this.handleGetUsers()
		}

		return new Response('Not found', { status: 404 })
	}

	/**
	 * Handle WebSocket upgrade
	 */
	private async handleWebSocketUpgrade(
		request: Request,
		url: URL
	): Promise<Response> {
		const username = url.searchParams.get('username')
		const userId = url.searchParams.get('userId') || crypto.randomUUID()

		if (!username) {
			return new Response('Missing username parameter', { status: 400 })
		}

		this.roomId = url.searchParams.get('roomId') || 'default'

		// Create WebSocket pair
		const pair = new WebSocketPair()
		const [client, server] = Object.values(pair)

		// Accept with hibernation support
		this.ctx.acceptWebSocket(server)

		// Attach user data for hibernation persistence
		const wsData: WebSocketData = {
			userId,
			username,
			joinedAt: Date.now()
		}
		server.serializeAttachment(wsData)

		// Broadcast join message
		const joinMessage = new ChatMessage({
			userId: 'system',
			username: 'System',
			content: `${username} joined the chat`,
			roomId: this.roomId
		})
		this.broadcast(JSON.stringify({
			type: 'message',
			data: this.serializeMessage(joinMessage)
		}), server)

		// Send welcome message to new user
		const welcomeMessage = {
			type: 'welcome',
			userId,
			roomId: this.roomId,
			onlineCount: this.ctx.getWebSockets().length
		}
		server.send(JSON.stringify(welcomeMessage))

		return new Response(null, { status: 101, webSocket: client })
	}

	/**
	 * Handle incoming WebSocket message (hibernation API)
	 */
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== 'string') {
			ws.send(JSON.stringify({ error: 'Binary messages not supported' }))
			return
		}

		const data = ws.deserializeAttachment() as WebSocketData
		if (!data) {
			ws.send(JSON.stringify({ error: 'Session not found' }))
			return
		}

		try {
			const parsed = JSON.parse(message)

			if (parsed.type === 'message') {
				// Create and store chat message
				const chatMessage = new ChatMessage({
					userId: data.userId,
					username: data.username,
					content: parsed.content,
					roomId: this.roomId
				})

				// Store in durable storage (keep last 100 messages)
				await this.storeMessage(chatMessage)

				// Broadcast to all clients
				const outgoing = {
					type: 'message',
					data: this.serializeMessage(chatMessage)
				}
				this.broadcast(JSON.stringify(outgoing))
			} else if (parsed.type === 'typing') {
				// Broadcast typing indicator
				const typing = {
					type: 'typing',
					userId: data.userId,
					username: data.username
				}
				this.broadcast(JSON.stringify(typing), ws)
			}
		} catch {
			ws.send(JSON.stringify({ error: 'Invalid message format' }))
		}
	}

	/**
	 * Handle WebSocket close (hibernation API)
	 */
	async webSocketClose(ws: WebSocket, code: number, reason: string) {
		const data = ws.deserializeAttachment() as WebSocketData
		if (!data) return

		// Broadcast leave message
		const leaveMessage = new ChatMessage({
			userId: 'system',
			username: 'System',
			content: `${data.username} left the chat`,
			roomId: this.roomId
		})
		this.broadcast(JSON.stringify({
			type: 'message',
			data: this.serializeMessage(leaveMessage)
		}))
	}

	/**
	 * Handle WebSocket error
	 */
	async webSocketError(ws: WebSocket, error: unknown) {
		const data = ws.deserializeAttachment() as WebSocketData
		console.error(`WebSocket error for user ${data?.username}:`, error)
	}

	/**
	 * Broadcast message to all connected WebSockets
	 */
	private broadcast(message: string, exclude?: WebSocket) {
		const sockets = this.ctx.getWebSockets()
		for (const socket of sockets) {
			if (socket !== exclude && socket.readyState === WebSocket.OPEN) {
				socket.send(message)
			}
		}
	}

	/**
	 * Serialize ChatMessage for WebSocket transmission
	 */
	private serializeMessage(msg: ChatMessage): ChatMessageData {
		return {
			id: msg.id,
			userId: msg.userId,
			username: msg.username,
			content: msg.content,
			timestamp: msg.timestamp,
			roomId: msg.roomId
		}
	}

	/**
	 * Serialize UserPresence for WebSocket transmission
	 */
	private serializePresence(user: UserPresence): UserPresenceData {
		return {
			id: user.id,
			username: user.username,
			status: user.status,
			lastSeen: user.lastSeen
		}
	}

	/**
	 * Store message in durable storage
	 */
	private async storeMessage(message: ChatMessage): Promise<void> {
		const key = `msg:${message.timestamp}:${message.id}`
		const stored: StoredMessage = {
			id: message.id,
			userId: message.userId,
			username: message.username,
			content: message.content,
			timestamp: message.timestamp
		}
		await this.ctx.storage.put(key, stored)

		// Cleanup old messages (keep last 100)
		const messages = await this.ctx.storage.list({ prefix: 'msg:' })
		if (messages.size > 100) {
			const sortedKeys = [...messages.keys()].sort()
			const toDelete = sortedKeys.slice(0, messages.size - 100)
			await this.ctx.storage.delete(toDelete)
		}
	}

	/**
	 * Get room info
	 */
	private async handleGetInfo(): Promise<Response> {
		const messageCount = (await this.ctx.storage.list({ prefix: 'msg:' })).size
		const onlineCount = this.ctx.getWebSockets().length

		return Response.json({
			roomId: this.roomId,
			messageCount,
			onlineCount
		})
	}

	/**
	 * Get message history
	 */
	private async handleGetHistory(): Promise<Response> {
		const messages = await this.ctx.storage.list<StoredMessage>({
			prefix: 'msg:',
			limit: 50
		})

		const history: ChatMessageData[] = [...messages.values()].map((msg) => ({
			id: msg.id,
			userId: msg.userId,
			username: msg.username,
			content: msg.content,
			timestamp: msg.timestamp,
			roomId: this.roomId
		}))

		return Response.json({ messages: history })
	}

	/**
	 * Get online users
	 */
	private handleGetUsers(): Response {
		const sockets = this.ctx.getWebSockets()
		const users: UserPresenceData[] = []

		for (const socket of sockets) {
			const data = socket.deserializeAttachment() as WebSocketData | null
			if (data) {
				const presence = new UserPresence({
					id: data.userId,
					username: data.username,
					status: 'online',
					lastSeen: Date.now()
				})
				users.push(this.serializePresence(presence))
			}
		}

		return Response.json({ users })
	}

	// ==========================================================================
	// RPC Methods (direct method invocation)
	// ==========================================================================

	/**
	 * RPC: Get online user count
	 */
	getOnlineCount(): number {
		return this.ctx.getWebSockets().length
	}

	/**
	 * RPC: Broadcast a system message
	 */
	async broadcastSystemMessage(content: string): Promise<void> {
		const message = new ChatMessage({
			userId: 'system',
			username: 'System',
			content,
			roomId: this.roomId
		})
		await this.storeMessage(message)
		this.broadcast(
			JSON.stringify({
				type: 'message',
				data: this.serializeMessage(message)
			})
		)
	}
}
