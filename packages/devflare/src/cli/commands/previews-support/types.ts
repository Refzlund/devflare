import type { PreviewIdentifierSource } from '../../../config'
import type { cleanupPreviewScopedResources } from '../../../config/preview-resources'

export const PREVIEW_SUBCOMMANDS = ['list', 'bindings', 'cleanup'] as const

export type PreviewSubcommand = (typeof PREVIEW_SUBCOMMANDS)[number]
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
	listDiscovery?: PreviewListDiscovery
}

export interface PreviewOutputTheme {
	useColor: boolean
}

export interface TableColumn<Row> {
	label: string
	width?: number
	value: (row: Row) => string
}

export interface ConfiguredWorkerFamilyMember {
	baseName: string
	roleLabel: string
	role: 'primary' | 'service'
}

export interface PreviewConfiguredFamilyGroup {
	accountId?: string
	configPath?: string
	families: ConfiguredWorkerFamilyMember[]
}

export interface PreviewListDiscovery {
	accountIds: string[]
	familyGroups: PreviewConfiguredFamilyGroup[]
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
	strategy: 'dedicated workers'
	workersLabel: string
	status: 'ready' | 'partial'
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
