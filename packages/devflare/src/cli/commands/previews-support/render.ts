import type { ConsolaInstance } from 'consola'
import type { WorkerInfo } from '../../../cloudflare'
import { inspectBindingAssociations, type BindingAssociationRow } from '../../preview-bindings'
import {
	buildPreviewScopeRowsFromLiveWorkers,
	buildStableWorkerRowsFromLiveWorkers,
} from './family'
import {
	bold,
	cyanBold,
	dim,
	formatOverviewStatus,
	formatRecordDate,
	formatTableLine,
	green,
	logLine,
	whiteDim,
	yellowBold
} from './theme'
import type {
	ConfiguredWorkerFamilyMember,
	PreviewOutputTheme,
	PreviewScopeRow,
	StableWorkerRow,
	TableColumn
} from './types'

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
	const coloredTitle = title === 'Preview scopes'
		? cyanBold(title, theme)
		: title === 'Stable workers'
			? bold(title, theme)
			: yellowBold(title, theme)
	return [
		`${coloredTitle} ${dim(`(${records.length})`, theme)}`,
		formatTableLine(columns.map((column) => dim(column.label, theme)), widths),
		...records.map((record) => formatTableLine(columns.map((column) => column.value(record)), widths))
	]
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
	logLine(logger, dim('Preview scopes are derived from live dedicated preview Worker names and the current config family.', theme))
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
	logLine(logger, dim('Preview scopes are derived from live dedicated preview Worker names and each discovered config family.', theme))
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
