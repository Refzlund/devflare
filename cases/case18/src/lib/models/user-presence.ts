// =============================================================================
// UserPresence — Transportable class for user presence info
// =============================================================================

export interface UserPresenceData {
	id: string
	username: string
	status?: 'online' | 'away' | 'offline'
	lastSeen?: number
}

export class UserPresence {
	readonly id: string
	readonly username: string
	readonly status: 'online' | 'away' | 'offline'
	readonly lastSeen: number

	constructor(data: UserPresenceData) {
		this.id = data.id
		this.username = data.username
		this.status = data.status ?? 'online'
		this.lastSeen = data.lastSeen ?? Date.now()
	}

	/** Check if user is currently online */
	get isOnline(): boolean {
		return this.status === 'online'
	}
}
