import { getWorkerVersionDetail } from './account-workers'
import type { APIClientOptions } from './api'
import type { WorkerVersionInfo } from './types'

export async function getVersionInfoById(
	accountId: string,
	workerName: string,
	versionId: string,
	versionMap: Map<string, WorkerVersionInfo>,
	apiOptions?: APIClientOptions
): Promise<WorkerVersionInfo | undefined> {
	const existing = versionMap.get(versionId)
	if (existing) {
		return existing
	}

	try {
		const version = await getWorkerVersionDetail(accountId, workerName, versionId, apiOptions)
		versionMap.set(versionId, version)
		return version
	} catch {
		return undefined
	}
}
