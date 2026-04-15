import { apiDelete, apiGet, apiGetAll, apiPatch, type APIClientOptions } from './api'
import type {
	WorkerDeploymentInfo,
	WorkerInfo,
	WorkerScript,
	WorkerVersionInfo
} from './types'

interface WorkersSubdomainResponse {
	subdomain: string
}

interface WorkerVersionsListResult {
	items?: Array<{
		id?: string
		number?: number
		metadata?: {
			author_email?: string
			author_id?: string
			created_on?: string
			modified_on?: string
			has_preview?: boolean
			hasPreview?: boolean
			source?: string
		}
	}>
}

interface WorkerVersionDetailResult {
	id?: string
	number?: number
	metadata?: {
		author_email?: string
		author_id?: string
		created_on?: string
		modified_on?: string
		has_preview?: boolean
		hasPreview?: boolean
		source?: string
	}
}

interface WorkerDeploymentsListResult {
	deployments?: Array<{
		id: string
		created_on: string
		source: string
		strategy: string
		versions: Array<{
			percentage: number
			version_id: string
		}>
		annotations?: {
			'workers/message'?: string
			'workers/triggered_by'?: string
		}
		author_email?: string
	}>
}

interface EditWorkerResult {
	id: string
	name: string
}

export interface RenamedWorkerInfo {
	id: string
	name: string
}

export async function listWorkers(
	accountId: string,
	options?: APIClientOptions
): Promise<WorkerInfo[]> {
	const scripts = await apiGetAll<WorkerScript>(
		`/accounts/${accountId}/workers/scripts`,
		options
	)

	return scripts.map((script) => ({
		name: script.name ?? script.id,
		createdOn: new Date(script.created_on),
		modifiedOn: new Date(script.modified_on)
	}))
}

export async function renameWorker(
	accountId: string,
	workerId: string,
	newName: string,
	options?: APIClientOptions
): Promise<RenamedWorkerInfo> {
	const encodedWorkerId = encodeURIComponent(workerId)
	const result = await apiPatch<EditWorkerResult>(
		`/accounts/${accountId}/workers/workers/${encodedWorkerId}`,
		{ name: newName },
		options
	)

	return {
		id: result.id,
		name: result.name
	}
}

export async function deleteWorker(
	accountId: string,
	scriptName: string,
	options?: APIClientOptions
): Promise<void> {
	const encodedScriptName = encodeURIComponent(scriptName)
	await apiDelete<unknown>(
		`/accounts/${accountId}/workers/scripts/${encodedScriptName}`,
		options
	)
}

function mapWorkerVersionInfo(
	version: NonNullable<WorkerVersionsListResult['items']>[number] | WorkerVersionDetailResult
): WorkerVersionInfo {
	return {
		id: version.id ?? '',
		number: version.number,
		metadata: {
			authorEmail: version.metadata?.author_email,
			authorId: version.metadata?.author_id,
			createdOn: version.metadata?.created_on ? new Date(version.metadata.created_on) : undefined,
			modifiedOn: version.metadata?.modified_on ? new Date(version.metadata.modified_on) : undefined,
			hasPreview: version.metadata?.has_preview === true || version.metadata?.hasPreview === true,
			source: version.metadata?.source
		}
	}
}

export async function listWorkerVersions(
	accountId: string,
	scriptName: string,
	options?: APIClientOptions
): Promise<WorkerVersionInfo[]> {
	const versions: WorkerVersionInfo[] = []
	const encodedScriptName = encodeURIComponent(scriptName)

	for (let page = 1;page <= 100;page++) {
		const result = await apiGet<WorkerVersionsListResult>(
			`/accounts/${accountId}/workers/scripts/${encodedScriptName}/versions?page=${page}&per_page=100`,
			options
		)

		const items = result.items ?? []
		versions.push(...items.map((item) => mapWorkerVersionInfo(item)))

		if (items.length < 100) {
			break
		}
	}

	return versions
}

export async function getWorkerVersionDetail(
	accountId: string,
	scriptName: string,
	versionId: string,
	options?: APIClientOptions
): Promise<WorkerVersionInfo> {
	const encodedScriptName = encodeURIComponent(scriptName)
	const result = await apiGet<WorkerVersionDetailResult>(
		`/accounts/${accountId}/workers/scripts/${encodedScriptName}/versions/${versionId}`,
		options
	)

	return mapWorkerVersionInfo(result)
}

export async function listWorkerDeployments(
	accountId: string,
	scriptName: string,
	options?: APIClientOptions
): Promise<WorkerDeploymentInfo[]> {
	const encodedScriptName = encodeURIComponent(scriptName)
	const result = await apiGet<WorkerDeploymentsListResult>(
		`/accounts/${accountId}/workers/scripts/${encodedScriptName}/deployments`,
		options
	)

	return (result.deployments ?? []).map((deployment) => ({
		id: deployment.id,
		createdOn: new Date(deployment.created_on),
		source: deployment.source,
		strategy: deployment.strategy,
		versions: deployment.versions.map((version) => ({
			percentage: version.percentage,
			versionId: version.version_id
		})),
		message: deployment.annotations?.['workers/message'],
		triggeredBy: deployment.annotations?.['workers/triggered_by'],
		authorEmail: deployment.author_email
	}))
}

export async function getWorkersSubdomain(
	accountId: string,
	options?: APIClientOptions
): Promise<string | null> {
	try {
		const result = await apiGet<WorkersSubdomainResponse>(
			`/accounts/${accountId}/workers/subdomain`,
			options
		)

		return result.subdomain || null
	} catch {
		return null
	}
}
