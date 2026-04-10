<script lang="ts">
	import { browser } from '$app/environment'
	import type { ChatMessageData } from '$lib/models'

	interface Message {
		id: string
		userId: string
		username: string
		content: string
		timestamp: number
		isSystem: boolean
	}

	let username = $state('')
	let roomId = $state('lobby')
	let userId = $state('')
	let connected = $state(false)
	let connecting = $state(false)
	let messages = $state<Message[]>([])
	let inputMessage = $state('')
	let onlineCount = $state(0)
	let ws: WebSocket | null = $state(null)
	let typingUsers = $state<Set<string>>(new Set())
	let messagesContainer: HTMLDivElement | null = $state(null)

	// Generate user ID on mount
	$effect(() => {
		if (browser && !userId) {
			userId = localStorage.getItem('chat-user-id') || crypto.randomUUID()
			localStorage.setItem('chat-user-id', userId)
			
			const savedUsername = localStorage.getItem('chat-username')
			if (savedUsername) {
				username = savedUsername
			}
		}
	})

	// Auto-scroll on new messages
	$effect(() => {
		if (messagesContainer && messages.length > 0) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight
		}
	})

	function connect() {
		if (!username.trim()) {
			alert('Please enter a username')
			return
		}

		localStorage.setItem('chat-username', username)
		connecting = true

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
		const wsUrl = `${protocol}//${window.location.host}/chat/api?roomId=${encodeURIComponent(roomId)}&username=${encodeURIComponent(username)}&userId=${encodeURIComponent(userId)}`

		ws = new WebSocket(wsUrl)

		ws.onopen = () => {
			connecting = false
			connected = true
		}

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data)

				if (data.type === 'welcome') {
					onlineCount = data.onlineCount
				} else if (data.type === 'message') {
					const msg = data.data as ChatMessageData
					messages = [
						...messages,
						{
							id: msg.id,
							userId: msg.userId,
							username: msg.username,
							content: msg.content,
							timestamp: msg.timestamp,
							isSystem: msg.userId === 'system'
						}
					]
					// Clear typing indicator for this user
					typingUsers.delete(msg.userId)
					typingUsers = new Set(typingUsers)
				} else if (data.type === 'typing') {
					typingUsers.add(data.username)
					typingUsers = new Set(typingUsers)
					// Clear after 3 seconds
					setTimeout(() => {
						typingUsers.delete(data.username)
						typingUsers = new Set(typingUsers)
					}, 3000)
				} else if (data.error) {
					console.error('WebSocket error:', data.error)
				}
			} catch (e) {
				console.error('Failed to parse message:', e)
			}
		}

		ws.onclose = () => {
			connected = false
			connecting = false
			ws = null
		}

		ws.onerror = (error) => {
			console.error('WebSocket error:', error)
			connecting = false
		}
	}

	function disconnect() {
		if (ws) {
			ws.close()
		}
	}

	function sendMessage() {
		if (!ws || !inputMessage.trim()) return

		ws.send(JSON.stringify({
			type: 'message',
			content: inputMessage.trim()
		}))

		inputMessage = ''
	}

	function sendTyping() {
		if (ws && connected) {
			ws.send(JSON.stringify({ type: 'typing' }))
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			sendMessage()
		}
	}

	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		})
	}
</script>

<div class="chat-page">
	<h2>💬 Real-time Chat (WebSocket DO)</h2>
	<p class="description">
		WebSocket-based chat using Durable Objects with hibernation.
	</p>

	{#if !connected}
		<div class="join-form">
			<h3>Join Chat Room</h3>
			<div class="form-group">
				<label for="username">Username</label>
				<input
					id="username"
					type="text"
					bind:value={username}
					placeholder="Enter your username"
					maxlength="30"
				/>
			</div>
			<div class="form-group">
				<label for="roomId">Room</label>
				<input
					id="roomId"
					type="text"
					bind:value={roomId}
					placeholder="Room name"
					maxlength="50"
				/>
			</div>
			<button
				class="connect-btn"
				onclick={connect}
				disabled={connecting || !username.trim()}
			>
				{connecting ? 'Connecting...' : 'Join Room'}
			</button>
		</div>
	{:else}
		<div class="chat-container">
			<div class="chat-header">
				<div class="room-info">
					<span class="room-name">📍 {roomId}</span>
					<span class="online-count">👥 {onlineCount} online</span>
				</div>
				<button class="disconnect-btn" onclick={disconnect}>
					Leave
				</button>
			</div>

			<div class="messages" bind:this={messagesContainer}>
				{#if messages.length === 0}
					<div class="empty-messages">
						<p>No messages yet. Say something!</p>
					</div>
				{:else}
					{#each messages as message}
						<div
							class="message"
							class:own={message.userId === userId}
							class:system={message.isSystem}
						>
							{#if !message.isSystem}
								<div class="message-header">
									<span class="author">{message.username}</span>
									<span class="time">{formatTime(message.timestamp)}</span>
								</div>
							{/if}
							<div class="message-content">
								{message.content}
							</div>
						</div>
					{/each}
				{/if}

				{#if typingUsers.size > 0}
					<div class="typing-indicator">
						{[...typingUsers].join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
					</div>
				{/if}
			</div>

			<div class="message-input">
				<input
					type="text"
					bind:value={inputMessage}
					placeholder="Type a message..."
					onkeydown={handleKeyDown}
					oninput={sendTyping}
				/>
				<button onclick={sendMessage} disabled={!inputMessage.trim()}>
					Send
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.chat-page {
		max-width: 700px;
		margin: 0 auto;
	}

	h2 {
		color: #333;
		margin-bottom: 0.5rem;
	}

	.description {
		color: #666;
		margin-bottom: 1.5rem;
	}

	.join-form {
		background: white;
		padding: 2rem;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		max-width: 400px;
		margin: 0 auto;
	}

	.join-form h3 {
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.25rem;
		font-weight: 500;
		font-size: 0.9rem;
	}

	.form-group input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}

	.connect-btn {
		width: 100%;
		padding: 0.75rem;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		margin-top: 0.5rem;
	}

	.connect-btn:disabled {
		background: #ccc;
	}

	.chat-container {
		background: white;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		height: 600px;
	}

	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid #eee;
	}

	.room-info {
		display: flex;
		gap: 1rem;
	}

	.room-name {
		font-weight: 600;
	}

	.online-count {
		color: #4caf50;
		font-size: 0.9rem;
	}

	.disconnect-btn {
		padding: 0.5rem 1rem;
		background: #ff5722;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.empty-messages {
		text-align: center;
		color: #999;
		margin-top: 2rem;
	}

	.message {
		max-width: 80%;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		background: #f0f0f0;
	}

	.message.own {
		align-self: flex-end;
		background: #e3f2fd;
	}

	.message.system {
		align-self: center;
		background: #fff3e0;
		font-style: italic;
		font-size: 0.85rem;
		max-width: 90%;
	}

	.message-header {
		display: flex;
		gap: 0.5rem;
		font-size: 0.75rem;
		margin-bottom: 0.25rem;
	}

	.message-header .author {
		font-weight: 600;
		color: #333;
	}

	.message-header .time {
		color: #999;
	}

	.message-content {
		word-break: break-word;
	}

	.typing-indicator {
		font-size: 0.85rem;
		color: #999;
		font-style: italic;
	}

	.message-input {
		display: flex;
		gap: 0.5rem;
		padding: 1rem;
		border-top: 1px solid #eee;
	}

	.message-input input {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}

	.message-input button {
		padding: 0.75rem 1.5rem;
		background: #f48225;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.message-input button:disabled {
		background: #ccc;
	}
</style>
