import { DurableObject } from 'cloudflare:workers'

interface LockSnapshot {
	owner: string
	expiresAt: number
}

export class CrossWorkerLock extends DurableObject<DevflareEnv> {
	async acquire(owner: string, ttlMs = 60_000): Promise<LockSnapshot & { acquired: boolean }> {
		const now = Date.now()
		const current = await this.ctx.storage.get<LockSnapshot>('cross-worker-lock')

		if (!current || current.expiresAt <= now || current.owner === owner) {
			const nextState: LockSnapshot = {
				owner,
				expiresAt: now + ttlMs
			}

			await this.ctx.storage.put('cross-worker-lock', nextState)
			return {
				acquired: true,
				...nextState
			}
		}

		return {
			acquired: false,
			...current
		}
	}

	async status(): Promise<LockSnapshot | null> {
		return (await this.ctx.storage.get<LockSnapshot>('cross-worker-lock')) ?? null
	}

	async release(owner: string): Promise<boolean> {
		const current = await this.ctx.storage.get<LockSnapshot>('cross-worker-lock')
		if (!current || current.owner !== owner) {
			return false
		}

		await this.ctx.storage.delete('cross-worker-lock')
		return true
	}
}
