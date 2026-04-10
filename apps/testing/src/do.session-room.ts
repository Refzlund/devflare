import { DurableObject } from 'cloudflare:workers'

interface SessionRoomState {
	activeMembers: string[]
	updatedAt: string
}

export class SessionRoom extends DurableObject<DevflareEnv> {
	private async readState(): Promise<SessionRoomState> {
		return (await this.ctx.storage.get<SessionRoomState>('session-room')) ?? {
			activeMembers: [],
			updatedAt: new Date(0).toISOString()
		}
	}

	async touchMember(memberId: string): Promise<SessionRoomState> {
		const current = await this.readState()
		const nextMembers = new Set(current.activeMembers)
		nextMembers.add(memberId)

		const nextState: SessionRoomState = {
			activeMembers: [...nextMembers].sort(),
			updatedAt: new Date().toISOString()
		}

		await this.ctx.storage.put('session-room', nextState)
		return nextState
	}

	async getSummary(): Promise<SessionRoomState & { memberCount: number }> {
		const current = await this.readState()
		return {
			...current,
			memberCount: current.activeMembers.length
		}
	}
}
