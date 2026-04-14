import { runPreviewsCommand } from '../../../src/cli/commands/previews'
import { createD1ResultsResponse, jsonResponse } from '../../helpers/cloudflare-api'
import { createLogger, renderMessages, stripAnsi, type TestLogger } from '../../helpers/mock-logger'

export type { TestLogger }
export { createLogger, renderMessages, stripAnsi }
export { createD1ResultsResponse, jsonResponse }

export interface PreviewTestEnvironmentSnapshot {
	fetch: typeof fetch
	token?: string
	cacheDir?: string
}

export function capturePreviewTestEnvironmentSnapshot(): PreviewTestEnvironmentSnapshot {
	return {
		fetch: globalThis.fetch,
		token: process.env.CLOUDFLARE_API_TOKEN,
		cacheDir: process.env.DEVFLARE_CACHE_DIR
	}
}

function restoreOptionalEnvironmentVariable(name: string, value: string | undefined): void {
	if (typeof value === 'undefined') {
		delete process.env[name]
		return
	}

	process.env[name] = value
}

export function restorePreviewTestEnvironmentSnapshot(snapshot: PreviewTestEnvironmentSnapshot): void {
	globalThis.fetch = snapshot.fetch
	restoreOptionalEnvironmentVariable('CLOUDFLARE_API_TOKEN', snapshot.token)
	restoreOptionalEnvironmentVariable('DEVFLARE_CACHE_DIR', snapshot.cacheDir)
}

export function createRegistryDatabaseListResponse(databases: Array<Record<string, unknown>>): Response {
	return jsonResponse(databases, {
		page: 1,
		per_page: 50,
		total_pages: 1,
		count: databases.length,
		total_count: databases.length
	})
}

export function createRegistryDatabaseRecord(options: {
	uuid?: string
	name?: string
	version?: string
	numTables?: number
	fileSize?: number
} = {}): Record<string, unknown> {
	return {
		uuid: options.uuid ?? 'db_123',
		name: options.name ?? 'devflare-registry',
		version: options.version ?? 'alpha',
		num_tables: options.numTables ?? 3,
		file_size: options.fileSize ?? 1024
	}
}

export function createSerializedRegistryRecord(record: Record<string, unknown>): {
	payload_json: string
} {
	return {
		payload_json: JSON.stringify(record)
	}
}

interface PreviewRegistryFetchOptions {
	databases?: Array<Record<string, unknown>>
	previewRecords?: Array<Record<string, unknown>>
	deploymentRecords?: Array<Record<string, unknown>>
	onRequest?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined
	onQuery?: (sql: string, url: string, init?: RequestInit) => Response | Promise<Response> | undefined
}

export function createPreviewRegistryFetch(
	options: PreviewRegistryFetchOptions = {}
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
	const databases = options.databases ?? [createRegistryDatabaseRecord()]
	const previewRecords = options.previewRecords ?? []
	const deploymentRecords = options.deploymentRecords ?? []

	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = String(input)
		const requestResponse = await options.onRequest?.(url, init)
		if (requestResponse) {
			return requestResponse
		}

		if (url.includes('/accounts/acc_123/d1/database?page=1&per_page=50')) {
			return createRegistryDatabaseListResponse(databases)
		}

		if (url.endsWith('/accounts/acc_123/d1/database/db_123/query')) {
			const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
			const sql = String(body.sql ?? '')
			const queryResponse = await options.onQuery?.(sql, url, init)
			if (queryResponse) {
				return queryResponse
			}

			if (sql.startsWith('SELECT payload_json FROM devflare_preview_records')) {
				return createD1ResultsResponse(previewRecords.map(createSerializedRegistryRecord))
			}

			if (sql.startsWith('SELECT payload_json FROM devflare_deployment_records')) {
				return createD1ResultsResponse(deploymentRecords.map(createSerializedRegistryRecord))
			}

			return createD1ResultsResponse()
		}

		throw new Error(`Unexpected fetch URL: ${url}`)
	}
}

export async function runTrackedPreviewsCommand(options: {
	args?: string[]
	account?: string
	cwd?: string
} = {}): Promise<{
	logger: TestLogger
	result: Awaited<ReturnType<typeof runPreviewsCommand>>
	renderedMessages: string[]
}> {
	const logger = createLogger()
	const result = await runPreviewsCommand(
		{
			command: 'previews',
			args: options.args ?? [],
			options: {
				account: options.account ?? 'acc_123'
			}
		},
		logger as any,
		options.cwd ? { cwd: options.cwd } : {}
	)

	return {
		logger,
		result,
		renderedMessages: renderMessages(logger)
	}
}

interface PreviewRecordFixtureOptions {
	accountId?: string
	workerName: string
	versionId: string
	previewUrl?: string
	alias?: string
	aliasPreviewUrl?: string
	branchName?: string
	source?: string
	status?: string
	createdAt?: string
	updatedAt?: string
	createdBy?: string
	id?: string
}

export function createPreviewRecordFixture(
	options: PreviewRecordFixtureOptions
): Record<string, unknown> {
	const id = options.id ?? `preview:${options.workerName}:${options.versionId}`
	return {
		id,
		kind: 'preview',
		ver: 1,
		createdAt: options.createdAt ?? '2025-01-01T00:00:00.000Z',
		updatedAt: options.updatedAt ?? '2025-01-02T00:00:00.000Z',
		createdBy: options.createdBy ?? 'user_123',
		accountId: options.accountId ?? 'acc_123',
		workerName: options.workerName,
		versionId: options.versionId,
		...(options.previewUrl ? { previewUrl: options.previewUrl } : {}),
		...(options.alias ? { alias: options.alias } : {}),
		...(options.aliasPreviewUrl ? { aliasPreviewUrl: options.aliasPreviewUrl } : {}),
		...(options.branchName ? { branchName: options.branchName } : {}),
		source: options.source ?? 'cli',
		status: options.status ?? 'active'
	}
}

interface PreviewAliasFixtureOptions {
	accountId?: string
	workerName: string
	alias: string
	versionId: string
	previewId?: string
	aliasPreviewUrl?: string
	branchName?: string
	source?: string
	status?: string
	createdAt?: string
	updatedAt?: string
	createdBy?: string
	id?: string
}

export function createPreviewAliasRecordFixture(
	options: PreviewAliasFixtureOptions
): Record<string, unknown> {
	return {
		id: options.id ?? `previewAlias:${options.workerName}:${options.alias}`,
		kind: 'previewAlias',
		ver: 1,
		createdAt: options.createdAt ?? '2025-01-01T00:00:00.000Z',
		updatedAt: options.updatedAt ?? '2025-01-02T00:00:00.000Z',
		createdBy: options.createdBy ?? 'user_123',
		accountId: options.accountId ?? 'acc_123',
		workerName: options.workerName,
		alias: options.alias,
		...(options.aliasPreviewUrl ? { aliasPreviewUrl: options.aliasPreviewUrl } : {}),
		versionId: options.versionId,
		previewId: options.previewId ?? `preview:${options.workerName}:${options.versionId}`,
		...(options.branchName ? { branchName: options.branchName } : {}),
		source: options.source ?? 'cli',
		status: options.status ?? 'active'
	}
}

interface DeploymentRecordFixtureOptions {
	accountId?: string
	workerName: string
	deploymentId: string
	channel: string
	versionId: string
	previewId?: string
	environment?: string
	url?: string
	source?: string
	status?: string
	createdAt?: string
	updatedAt?: string
	createdBy?: string
	id?: string
}

export function createDeploymentRecordFixture(
	options: DeploymentRecordFixtureOptions
): Record<string, unknown> {
	const id = options.id ?? `deployment:${options.workerName}:${options.deploymentId}`
	return {
		id,
		kind: 'deployment',
		ver: 1,
		createdAt: options.createdAt ?? '2025-01-01T00:00:00.000Z',
		updatedAt: options.updatedAt ?? '2025-01-02T00:00:00.000Z',
		createdBy: options.createdBy ?? 'user_123',
		accountId: options.accountId ?? 'acc_123',
		workerName: options.workerName,
		deploymentId: options.deploymentId,
		channel: options.channel,
		status: options.status ?? 'active',
		versionId: options.versionId,
		...(options.previewId ? { previewId: options.previewId } : {}),
		...(options.environment ? { environment: options.environment } : {}),
		...(options.url ? { url: options.url } : {}),
		source: options.source ?? 'cli'
	}
}
