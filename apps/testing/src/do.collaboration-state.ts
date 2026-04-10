import { DurableObject } from 'cloudflare:workers'

interface CollaborationEvent {
	actor: string
	kind: string
	target: string
	at: string
}

interface CollaborationSnapshot {
	events: CollaborationEvent[]
	updatedAt: string
}

export class CollaborationState extends DurableObject<DevflareEnv> {
	private async readState(): Promise<CollaborationSnapshot> {
		return (await this.ctx.storage.get<CollaborationSnapshot>('collaboration-state')) ?? {
			events: [],
			updatedAt: new Date(0).toISOString()
		}
	}

	async recordChange(change: Pick<CollaborationEvent, 'actor' | 'kind' | 'target'>): Promise<CollaborationSnapshot> {
		const current = await this.readState()
		const nextEvent: CollaborationEvent = {
			...change,
			at: new Date().toISOString()
		}

		const nextState: CollaborationSnapshot = {
			events: [...current.events, nextEvent].slice(-10),
			updatedAt: nextEvent.at
		}

		await this.ctx.storage.put('collaboration-state', nextState)
		return nextState
	}

	async getSummary(): Promise<CollaborationSnapshot & { eventCount: number }> {
		const current = await this.readState()
		return {
			...current,
			eventCount: current.events.length
		}
	}
}
