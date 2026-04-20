export interface TrackedTimeoutState {
	scheduledTimeoutIds: number[]
	clearedTimeoutIds: number[]
}

export function installTrackedTimeouts(): TrackedTimeoutState {
	const scheduledTimeoutIds: number[] = []
	const clearedTimeoutIds: number[] = []
	let nextTimeoutId = 0

	globalThis.setTimeout = (((_handler: Parameters<typeof setTimeout>[0], _timeout?: number, ..._args: unknown[]) => {
		const timeoutId = ++nextTimeoutId
		scheduledTimeoutIds.push(timeoutId)
		return timeoutId as unknown as ReturnType<typeof setTimeout>
	}) as typeof setTimeout)
	globalThis.clearTimeout = (((timeoutId?: ReturnType<typeof setTimeout>) => {
		if (typeof timeoutId === 'number') {
			clearedTimeoutIds.push(timeoutId)
		}
	}) as typeof clearTimeout)

	return {
		scheduledTimeoutIds,
		clearedTimeoutIds
	}
}
