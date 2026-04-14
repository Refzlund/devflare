import type { PreviewIdentifierSource } from '../../../config'
import { cleanupPreviewScopedResources } from '../../../config/preview-resources'
import type {
	DevflareDeploymentRecord,
	DevflarePreviewAliasRecord,
	DevflarePreviewRecord,
	PreviewRegistryContext
} from '../../../cloudflare'

export const PREVIEW_SUBCOMMANDS = ['list', 'bindings', 'provision', 'reconcile', 'cleanup', 'retire', 'cleanup-resources'] as const

export type PreviewSubcommand = typeof PREVIEW_SUBCOMMANDS[number]
export type WorkerNameSource = 'option' | 'arg' | 'config' | 'none'
export type PreviewScopeSource = PreviewIdentifierSource | 'scope-option'

export interface PreviewScopeSelection {
	identifier?: string
	source: PreviewScopeSource
}

export interface PreviewConfigSummary {
	accountId?: string
	name?: string
}

export interface PreviewCommandContext {
	accountId: string
	workerName?: string
	workerNameSource: WorkerNameSource
	config?: PreviewConfigSummary
}

export interface PreviewOutputTheme {
	useColor: boolean
}

export interface TableColumn<Row> {
	label: string
	width?: number
	value: (row: Row) => string
}

export interface WorkerDisplayGroup {
	workerName: string
	previews: DevflarePreviewRecord[]
	aliases: DevflarePreviewAliasRecord[]
	deployments: DevflareDeploymentRecord[]
	latestTimestamp: number
}

export interface ConfiguredWorkerFamilyMember {
	baseName: string
	roleLabel: string
	role: 'primary' | 'service'
}

export interface StableWorkerRow {
	workerName: string
	role: string
	status: 'active' | 'missing'
	updatedAt?: Date
	url?: string
}

export interface PreviewScopeRow {
	scope: string
	strategy: 'dedicated workers' | 'preview alias'
	workersLabel: string
	status: 'ready' | 'partial' | 'active' | 'deleted' | 'superseded' | 'reassigned' | 'orphaned' | 'rolled_back'
	updatedAt?: Date
	notes?: string
	entryUrl?: string
}

export type PreviewCleanupStrategy = PreviewScopeRow['strategy'] | 'default preview scope'

export interface PreviewCleanupTarget {
	scope: string
	strategies: PreviewCleanupStrategy[]
	workerNames: string[]
}

export interface PreviewCleanupExecution {
	target?: PreviewCleanupTarget
	result: Awaited<ReturnType<typeof cleanupPreviewScopedResources>>
}

export interface PreviewStateScope {
	workerFamilyName?: string
	workerName?: string
}

export interface PreviewRegistryRows {
	previews: DevflarePreviewRecord[]
	aliases: DevflarePreviewAliasRecord[]
	deployments: DevflareDeploymentRecord[]
}

export interface PreviewRegistryDisplayOptions {
	registry: PreviewRegistryContext
	includeAll: boolean
	theme: PreviewOutputTheme
}
