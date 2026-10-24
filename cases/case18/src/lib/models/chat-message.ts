// =============================================================================
// ChatMessage — Transportable class for chat messages
// =============================================================================

export interface ChatMessageData {
	id?: string
	userId: string
	username: string
	content: string
	timestamp?: number
	roomId: string
}

export class ChatMessage {
	readonly id: string
	readonly userId: string
	readonly username: string
	readonly content: string
	readonly timestamp: number
	readonly roomId: string

	constructor(data: ChatMessageData) {
		this.id = data.id ?? crypto.randomUUID()
		this.userId = data.userId
		this.username = data.username
		this.content = data.content
		this.timestamp = data.timestamp ?? Date.now()
		this.roomId = data.roomId
	}

	/** Check if message is from system */
	get isSystem(): boolean {
		return this.userId === 'system'
	}

	/** Format timestamp as readable string */
	get formattedTime(): string {
		return new Date(this.timestamp).toLocaleTimeString()
	}
}
