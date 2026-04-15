import type { ConsolaInstance } from 'consola'
import type { APIClientOptions } from './api'
import type {
	DevflareDeploymentRecord,
	DevflarePreviewScopeRecord,
	DevflarePreviewRecord,
	DevflareRecordSource
} from './registry-schema'

export const DEVFLARE_PREVIEW_REGISTRY_DATABASE = 'devflare-registry'

export interface StoredRecordRow {
	payload_json: string
}

export interface PreviewRegistryCacheEntry {
	accountId: string
	databaseId: string
	databaseName: string
	updatedAt: string
}

export interface PreviewRegistryCacheFile {
	registries?: Record<string, PreviewRegistryCacheEntry>
}

export interface PreviewRegistryContext {
	accountId: string
	databaseId: string
	databaseName: string
	created: boolean
}

export interface ListTrackedRecordsOptions {
	accountId: string
	workerName?: string
	databaseName?: string
	apiOptions?: APIClientOptions
}

export interface ListTrackedRegistryStateOptions {
	registry: PreviewRegistryContext
	workerName?: string
	apiOptions?: APIClientOptions
}

export interface ReconcilePreviewRegistryOptions {
	accountId: string
	workerName: string
	databaseName?: string
	apiOptions?: APIClientOptions
	previewScope?: string
	previewUrl?: string
	previewScopeUrl?: string
	branchName?: string
	commitSha?: string
	versionId?: string
	source?: DevflareRecordSource
	deploymentMessage?: string
	logger?: ConsolaInstance
	now?: Date
}

export interface ReconcilePreviewRegistryResult {
	registry: PreviewRegistryContext
	previews: DevflarePreviewRecord[]
	previewScopes: DevflarePreviewScopeRecord[]
	deployments: DevflareDeploymentRecord[]
}

export interface CleanupPreviewRegistryOptions {
	accountId: string
	workerName?: string
	databaseName?: string
	apiOptions?: APIClientOptions
	days?: number
	apply?: boolean
	logger?: ConsolaInstance
	now?: Date
}

export interface CleanupPreviewRegistryResult {
	registry: PreviewRegistryContext
	previews: DevflarePreviewRecord[]
	scopes: DevflarePreviewScopeRecord[]
	deployments: DevflareDeploymentRecord[]
	candidates: {
		previews: DevflarePreviewRecord[]
		scopes: DevflarePreviewScopeRecord[]
		deployments: DevflareDeploymentRecord[]
	}
	applied: boolean
}

export interface RetirePreviewRegistryOptions {
	accountId: string
	workerName: string
	databaseName?: string
	apiOptions?: APIClientOptions
	branchName?: string
	previewScope?: string
	versionId?: string
	commitSha?: string
	apply?: boolean
	logger?: ConsolaInstance
	now?: Date
}

export interface RetirePreviewRegistryResult {
	registry: PreviewRegistryContext
	previews: DevflarePreviewRecord[]
	scopes: DevflarePreviewScopeRecord[]
	deployments: DevflareDeploymentRecord[]
	candidates: {
		previews: DevflarePreviewRecord[]
		scopes: DevflarePreviewScopeRecord[]
		deployments: DevflareDeploymentRecord[]
	}
	applied: boolean
}
