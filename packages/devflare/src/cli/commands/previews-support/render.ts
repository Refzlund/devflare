import type { ConsolaInstance } from 'consola'
import { listTrackedRegistryState, type PreviewRegistryContext, type WorkerInfo } from '../../../cloudflare'
import { inspectBindingAssociations, type BindingAssociationRow } from '../../preview-bindings'
import {
	buildPreviewScopeRows,
	buildPreviewScopeRowsFromLiveWorkers,
	buildStableWorkerRows,
	buildStableWorkerRowsFromLiveWorkers,
	buildWorkerGroupMap,
	buildWorkerGroups,
	filterFamilyRecords,
	filterRecordsForScope,
	getPreviewDisplayLabel,
	isVisibleScopeRecord,
	isVisibleDeploymentRecord,
	isVisiblePreviewRecord
} from './family'
import {
	bold,
	cyanBold,
	dim,
	formatChannel,
	formatOverviewStatus,
	formatRecordDate,
	formatStatus,
	formatTableLine,
	green,
	logLine,
	shortenVersionId,
	whiteDim,
	yellow,
	yellowBold
} from './theme'
import type {
	ConfiguredWorkerFamilyMember,
	PreviewOutputTheme,
	PreviewScopeRow,
	PreviewStateScope,
	StableWorkerRow,
	TableColumn,
	WorkerDisplayGroup
} from './types'

function appendStatusColumn<Row extends { status: string }>(
	records: Row[],
	columns: TableColumn<Row>[],
	theme: PreviewOutputTheme
): void {
	if (!records.some((record) => record.status !== 'active')) {
		return
	}

	columns.push({
		label: 'Status',
		width: 11,
		value: (record) => formatStatus(record.status, theme)
	})
}

function logWorkerFamilyHeader(
	logger: ConsolaInstance,
	families: ConfiguredWorkerFamilyMember[],
	theme: PreviewOutputTheme
): void {
	const primaryFamily = families.find((family) => family.role === 'primary') ?? families[0]
	const relatedFamilies = families.filter((family) => family.role !== 'primary')

	logLine(logger, `${dim('worker family', theme)} ${green(primaryFamily?.baseName ?? 'unknown', theme)}`)
	if (relatedFamilies.length > 0) {
		logLine(logger, `${dim('related workers', theme)} ${whiteDim(String(relatedFamilies.length), theme)}`)
	}
	logLine(logger)
}

function logSection<Row>(
	logger: ConsolaInstance,
	title: string,
	records: Row[],
	columns: TableColumn<Row>[],
	theme: PreviewOutputTheme
): void {
	for (const line of buildSectionLines(title, records, columns, theme)) {
		logLine(logger, line)
	}
}

function logLiveWorkerFamilyOverview(
	logger: ConsolaInstance,
	families: ConfiguredWorkerFamilyMember[],
	workers: WorkerInfo[],
	workersSubdomain: string | null | undefined,
	theme: PreviewOutputTheme
): void {
	const stableRows = buildStableWorkerRowsFromLiveWorkers(families, workers, workersSubdomain)
	const previewScopeRows = buildPreviewScopeRowsFromLiveWorkers(families, workers, workersSubdomain)

	logWorkerFamilyHeader(logger, families, theme)
	logSection(logger, 'Stable workers', stableRows, buildStableWorkerColumns(theme), theme)

	logLine(logger)
	if (previewScopeRows.length === 0) {
		logLine(logger, dim('No dedicated preview scopes found for this worker family.', theme))
	} else {
		logSection(logger, 'Preview scopes', previewScopeRows, buildPreviewScopeColumns(theme), theme)
	}
}

function buildPreviewColumns(
	records: WorkerDisplayGroup['previews'],
	theme: PreviewOutputTheme
): TableColumn<WorkerDisplayGroup['previews'][number]>[] {
	const columns: TableColumn<WorkerDisplayGroup['previews'][number]>[] = []

	columns.push({
		label: 'Scope / Version',
		width: 24,
		value: (record) => getPreviewDisplayLabel(record)
	})

	appendStatusColumn(records, columns, theme)

	columns.push({
		label: 'Updated',
		width: 19,
		value: (record) => whiteDim(formatRecordDate(record.updatedAt ?? record.createdAt), theme)
	})
	columns.push({
		label: 'URL',
		value: (record) => record.scopeUrl ?? record.previewUrl
	})

	return columns
}

function buildScopeColumns(
	records: WorkerDisplayGroup['scopes'],
	theme: PreviewOutputTheme
): TableColumn<WorkerDisplayGroup['scopes'][number]>[] {
	const columns: TableColumn<WorkerDisplayGroup['scopes'][number]>[] = []

	columns.push({
		label: 'Scope',
		width: 24,
		value: (record) => record.scope
	})

	appendStatusColumn(records, columns, theme)

	columns.push({
		label: 'Version',
		width: 13,
		value: (record) => shortenVersionId(record.versionId)
	})
	columns.push({
		label: 'URL',
		value: (record) => record.scopeUrl
	})

	return columns
}

function buildDeploymentColumns(
	records: WorkerDisplayGroup['deployments'],
	includeAll: boolean,
	theme: PreviewOutputTheme
): TableColumn<WorkerDisplayGroup['deployments'][number]>[] {
	const showStatus = records.some((record) => record.status !== 'active')
	const showVersion = includeAll || showStatus
	const columns: TableColumn<WorkerDisplayGroup['deployments'][number]>[] = []

	columns.push({
		label: 'Channel',
		width: 10,
		value: (record) => formatChannel(record.channel, theme)
	})

	appendStatusColumn(records, columns, theme)

	columns.push({
		label: 'Deployed',
		width: 19,
		value: (record) => whiteDim(formatRecordDate(record.createdAt), theme)
	})

	if (showVersion) {
		columns.push({
			label: 'Version',
			width: 13,
			value: (record) => shortenVersionId(record.versionId)
		})
	}

	columns.push({
		label: 'URL',
		value: (record) => record.url ?? 'N/A'
	})

	return columns
}

function buildStableWorkerColumns(theme: PreviewOutputTheme): TableColumn<StableWorkerRow>[] {
	return [
		{
			label: 'Worker',
			width: 34,
			value: (row) => row.workerName
		},
		{
			label: 'Role',
			width: 20,
			value: (row) => row.role
		},
		{
			label: 'Status',
			width: 8,
			value: (row) => formatOverviewStatus(row.status, theme)
		},
		{
			label: 'Updated',
			width: 19,
			value: (row) => whiteDim(formatRecordDate(row.updatedAt), theme)
		},
		{
			label: 'URL',
			value: (row) => row.url ?? 'N/A'
		}
	]
}

function buildPreviewScopeColumns(theme: PreviewOutputTheme): TableColumn<PreviewScopeRow>[] {
	return [
		{
			label: 'Scope',
			width: 18,
			value: (row) => row.scope
		},
		{
			label: 'Strategy',
			width: 18,
			value: (row) => row.strategy
		},
		{
			label: 'Workers',
			width: 7,
			value: (row) => row.workersLabel
		},
		{
			label: 'Status',
			width: 10,
			value: (row) => formatOverviewStatus(row.status, theme)
		},
		{
			label: 'Updated',
			width: 19,
			value: (row) => whiteDim(formatRecordDate(row.updatedAt), theme)
		},
		{
			label: 'Notes',
			width: 30,
			value: (row) => row.notes ?? dim('—', theme)
		},
		{
			label: 'Entry URL',
			value: (row) => row.entryUrl ?? 'N/A'
		}
	]
}

function buildSectionLines<Row>(
	title: string,
	records: Row[],
	columns: TableColumn<Row>[],
	theme: PreviewOutputTheme
): string[] {
	if (records.length === 0) {
		return []
	}

	const widths = columns.map((column) => column.width)
	const coloredTitle = title === 'Previews' || title === 'Preview scopes'
		? cyanBold(title, theme)
		: title === 'Scopes' || title === 'Stable workers'
			? bold(title, theme)
			: yellowBold(title, theme)
	return [
		`${coloredTitle} ${dim(`(${records.length})`, theme)}`,
		formatTableLine(columns.map((column) => dim(column.label, theme)), widths),
		...records.map((record) => formatTableLine(columns.map((column) => column.value(record)), widths))
	]
}

function shouldShowScopeSection(
	previews: WorkerDisplayGroup['previews'],
	scopes: WorkerDisplayGroup['scopes'],
	includeAll: boolean
): boolean {
	if (scopes.length === 0) {
		return false
	}

	if (includeAll || previews.length === 0) {
		return true
	}

	const previewScopeKeys = new Set(
		previews
			.filter((record) => record.scope && record.scopeUrl)
			.map((record) => `${record.workerName}\u0000${record.scope}\u0000${record.versionId}\u0000${record.scopeUrl}`)
	)

	return scopes.some((record) => !previewScopeKeys.has(
		`${record.workerName}\u0000${record.scope}\u0000${record.versionId}\u0000${record.scopeUrl}`
	))
}

function logWorkerGroup(
	logger: ConsolaInstance,
	group: WorkerDisplayGroup,
	includeAll: boolean,
	theme: PreviewOutputTheme
): void {
	const showScopes = shouldShowScopeSection(group.previews, group.scopes, includeAll)
	const lines: string[] = []
	const previewLines = buildSectionLines('Previews', group.previews, buildPreviewColumns(group.previews, theme), theme)
	const scopeLines = showScopes
		? buildSectionLines('Scopes', group.scopes, buildScopeColumns(group.scopes, theme), theme)
		: []
	const deploymentLines = buildSectionLines(
		'Deployments',
		group.deployments,
		buildDeploymentColumns(group.deployments, includeAll, theme),
		theme
	)

	for (const sectionLines of [previewLines, scopeLines, deploymentLines]) {
		if (sectionLines.length === 0) {
			continue
		}

		if (lines.length > 0) {
			lines.push('')
		}

		lines.push(...sectionLines)
	}

	if (lines.length === 0) {
		return
	}

	logLine(logger, `${dim('┌', theme)} ${dim('worker', theme)} ${green(group.workerName, theme)}`)

	for (const [index, line] of lines.entries()) {
		const isLastLine = index === lines.length - 1
		const connector = isLastLine ? '└' : '│'
		if (!line) {
			logLine(logger, dim(connector, theme))
			continue
		}

		logLine(logger, `${dim(connector, theme)}  ${line}`)
	}
}

export async function showTrackedState(
	registry: PreviewRegistryContext,
	scope: PreviewStateScope,
	logger: ConsolaInstance,
	includeAll: boolean,
	theme: PreviewOutputTheme,
	apiOptions?: { timeout?: number }
): Promise<void> {
	const { previews, scopes, deployments } = await listTrackedRegistryState({
		registry,
		workerName: scope.workerFamilyName ? undefined : scope.workerName,
		apiOptions
	})
	const scopedPreviews = filterRecordsForScope(previews, scope)
	const scopedScopes = filterRecordsForScope(scopes, scope)
	const scopedDeployments = filterRecordsForScope(deployments, scope)
	const filteredPreviews = scopedPreviews.filter((record) => isVisiblePreviewRecord(record, includeAll))
	const filteredScopes = scopedScopes.filter((record) => isVisibleScopeRecord(record, includeAll))
	const filteredDeployments = scopedDeployments.filter((record) => isVisibleDeploymentRecord(record, includeAll))
	const workerGroups = buildWorkerGroups(filteredPreviews, filteredScopes, filteredDeployments)
	const scopeLabel = scope.workerFamilyName ? `${scope.workerFamilyName}*` : scope.workerName
	const hasHistoricalRecords = !includeAll
		&& (
			filteredPreviews.length < scopedPreviews.length
			|| filteredScopes.length < scopedScopes.length
			|| filteredDeployments.length < scopedDeployments.length
		)

	if (filteredPreviews.length === 0 && filteredScopes.length === 0 && filteredDeployments.length === 0) {
		logLine(logger)
		if (hasHistoricalRecords) {
			logLine(
				logger,
				`${yellow(`No active preview records found${scopeLabel ? ` for ${scopeLabel}` : ''}.`, theme)} ${dim('Use --all to include historical records.', theme)}`
			)
		} else {
			logLine(logger, dim(`No tracked preview records found${scopeLabel ? ` for ${scopeLabel}` : ''}.`, theme))
		}
		logLine(logger)
		return
	}

	logLine(logger)
	for (const [index, group] of workerGroups.entries()) {
		if (index > 0) {
			logLine(logger)
		}

		logWorkerGroup(logger, group, includeAll, theme)
	}

	logLine(logger)
}

export async function showWorkerFamilyOverview(
	registry: PreviewRegistryContext,
	families: ConfiguredWorkerFamilyMember[],
	logger: ConsolaInstance,
	includeAll: boolean,
	theme: PreviewOutputTheme,
	apiOptions?: { timeout?: number }
): Promise<void> {
	const { previews, scopes, deployments } = await listTrackedRegistryState({
		registry,
		workerName: undefined,
		apiOptions
	})
	const filteredPreviews = filterFamilyRecords(previews, families)
		.filter((record) => isVisiblePreviewRecord(record, includeAll))
	const filteredScopes = filterFamilyRecords(scopes, families)
		.filter((record) => isVisibleScopeRecord(record, includeAll))
	const filteredDeployments = filterFamilyRecords(deployments, families)
		.filter((record) => isVisibleDeploymentRecord(record, includeAll))
	const workerGroups = buildWorkerGroups(filteredPreviews, filteredScopes, filteredDeployments)
	const groupsByWorker = buildWorkerGroupMap(workerGroups)
	const stableRows = buildStableWorkerRows(families, groupsByWorker)
	const previewScopeRows = buildPreviewScopeRows(families, groupsByWorker)

	logLine(logger)
	logWorkerFamilyHeader(logger, families, theme)
	logSection(logger, 'Stable workers', stableRows, buildStableWorkerColumns(theme), theme)

	logLine(logger)
	if (previewScopeRows.length === 0) {
		logLine(logger, dim('No dedicated preview scopes found for this worker family.', theme))
	} else {
		logSection(logger, 'Preview scopes', previewScopeRows, buildPreviewScopeColumns(theme), theme)
	}

	logLine(logger)
	logLine(logger, dim('Preview scopes are derived from live worker names and the current config family.', theme))
	logLine(logger, dim('Use `devflare previews cleanup --scope <name>` to delete one scope or `--all` to clean every discovered scope.', theme))
	logLine(logger)
}

export function showWorkerFamilyOverviewFromLiveWorkers(
	families: ConfiguredWorkerFamilyMember[],
	workers: WorkerInfo[],
	workersSubdomain: string | null | undefined,
	logger: ConsolaInstance,
	theme: PreviewOutputTheme
): void {
	logLine(logger)
	logLiveWorkerFamilyOverview(logger, families, workers, workersSubdomain, theme)
	logLine(logger)
	logLine(logger, dim('Preview scopes are derived from live worker names and the current config family.', theme))
	logLine(logger, dim('Use `devflare previews cleanup --scope <name>` to delete one scope or `--all` to clean every discovered scope.', theme))
	logLine(logger)
}

export function showWorkspaceWorkerFamilyOverviewFromLiveWorkers(
	familyGroups: ConfiguredWorkerFamilyMember[][],
	workers: WorkerInfo[],
	workersSubdomain: string | null | undefined,
	logger: ConsolaInstance,
	theme: PreviewOutputTheme
): void {
	logLine(logger)
	logLine(logger, `${dim('configured worker families', theme)} ${whiteDim(String(familyGroups.length), theme)}`)
	logLine(logger)

	for (const [index, families] of familyGroups.entries()) {
		if (index > 0) {
			logLine(logger)
		}

		logLiveWorkerFamilyOverview(logger, families, workers, workersSubdomain, theme)
	}

	logLine(logger)
	logLine(logger, dim('Preview scopes are derived from live worker names and each discovered config family.', theme))
	logLine(logger, dim('Run inside a configured package or pass `--config <path>` to narrow the summary or clean one family.', theme))
	logLine(logger)
}

function buildBindingAssociationColumns(theme: PreviewOutputTheme): TableColumn<BindingAssociationRow>[] {
	return [
		{
			label: 'Reference',
			width: 24,
			value: (row) => row.reference
		},
		{
			label: 'Type',
			width: 24,
			value: (row) => row.type
		},
		{
			label: 'Resource',
			width: 36,
			value: (row) => row.resource
		},
		{
			label: 'Workers',
			width: 7,
			value: (row) => String(row.workerCount)
		},
		{
			label: 'Notes',
			width: 28,
			value: (row) => row.notes.length > 0 ? row.notes.join(' · ') : dim('—', theme)
		},
		{
			label: 'Connected workers',
			value: (row) => row.connectedWorkers.length > 0
				? row.connectedWorkers.join(', ')
				: dim('—', theme)
		}
	]
}

export function showBindingAssociations(
	logger: ConsolaInstance,
	inspection: Awaited<ReturnType<typeof inspectBindingAssociations>>,
	theme: PreviewOutputTheme
): void {
	logLine(logger)
	logLine(logger, `${dim('worker family', theme)} ${green(inspection.workerName, theme)}`)
	logLine(logger, `${dim('resolved targets', theme)} ${whiteDim(String(inspection.targets), theme)}`)
	logLine(logger, `${dim('active deployments scanned', theme)} ${whiteDim(String(inspection.scannedWorkers.length), theme)}`)

	if (inspection.rows.length === 0) {
		logLine(logger)
		logLine(logger, dim('No binding or resource targets were resolved from the current config.', theme))
		logLine(logger)
		return
	}

	logLine(logger)
	logSection(logger, 'Bindings', inspection.rows, buildBindingAssociationColumns(theme), theme)

	if (inspection.warnings.length > 0) {
		logLine(logger)
		for (const warning of inspection.warnings) {
			logger.warn(warning)
		}
	}

	logLine(logger)
}
