// =============================================================================
// Reload Queue — coalesces concurrent reload requests
// =============================================================================
// Runs at most one reload at a time. Requests made while a reload is in flight
// are coalesced into a single trailing reload. Errors are surfaced through the
// supplied logger instead of being dropped silently.
// =============================================================================

import type { ConsolaInstance } from 'consola'

export interface ReloadQueueOptions {
	reload: () => Promise<void>
	logger?: ConsolaInstance
}

export interface ReloadQueue {
	/** Request a reload. Returns a promise that resolves when this request's reload finishes. */
	schedule(): Promise<void>
	/** Wait until there is no running or pending reload. */
	drain(): Promise<void>
	/**
	 * Whether a reload is running.
	 *
	 * Read by the runtime-status channel to tell an app "the runtime is coming back,
	 * keep waiting" from "nothing is going to fix this". A trailing request needs no
	 * term of its own: one only exists while a reload is running, and the handover
	 * between them is a single microtask — no observer can be inside it.
	 */
	readonly busy: boolean
}

export function createReloadQueue({ reload, logger }: ReloadQueueOptions): ReloadQueue {
	let running: Promise<void> | null = null
	let pending: Promise<void> | null = null

	async function runOnce(): Promise<void> {
		try {
			await reload()
		} catch (error) {
			logger?.error('[devflare dev] reload failed:', error)
		}
	}

	function schedule(): Promise<void> {
		if (!running) {
			running = runOnce().finally(() => {
				running = null
			})
			return running
		}

		if (!pending) {
			const runningSnapshot = running
			pending = runningSnapshot.then(() => {
				pending = null
				running = runOnce().finally(() => {
					running = null
				})
				return running
			})
		}

		return pending
	}

	async function drain(): Promise<void> {
		while (running || pending) {
			if (pending) {
				await pending
			} else if (running) {
				await running
			}
		}
	}

	return {
		schedule,
		drain,
		get busy() {
			return running !== null
		}
	}
}
