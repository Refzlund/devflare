export const stateKeys = {
	smokeResult: 'testing:smoke:last-result',
	queueJobs: 'testing:queue:jobs:last',
	queueEmails: 'testing:queue:emails:last',
	scheduled: 'testing:scheduled:last-run'
} as const

export async function readJson<T>(namespace: KVNamespace, key: string): Promise<T | null> {
	const stored = await namespace.get(key)
	if (!stored) return null

	try {
		return JSON.parse(stored) as T
	} catch {
		return null
	}
}

export function writeJson(namespace: KVNamespace, key: string, value: unknown): Promise<void> {
	return namespace.put(key, JSON.stringify(value))
}
