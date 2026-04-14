import {
	bold,
	cyan,
	cyanBold,
	createCliTheme,
	dim,
	formatTableLine,
	green,
	logLine,
	red,
	whiteDim,
	yellow,
	yellowBold
} from '../../ui'
import type {
	PreviewOutputTheme,
	StableWorkerRow,
	PreviewScopeRow
} from './types'

export {
	bold,
	cyan,
	cyanBold,
	dim,
	formatTableLine,
	green,
	logLine,
	red,
	whiteDim,
	yellow,
	yellowBold
}

export function shouldUseColor(options: Record<string, string | boolean>): boolean {
	return createCliTheme(options).useColor
}

export function formatRecordDate(date: Date | undefined): string {
	return date ? date.toISOString().slice(0, 19).replace('T', ' ') : 'N/A'
}

export function formatStatus(value: string, theme: PreviewOutputTheme): string {
	switch (value) {
		case 'active':
			return green(value, theme)
		case 'superseded':
		case 'reassigned':
		case 'orphaned':
			return yellow(value, theme)
		case 'deleted':
		case 'rolled_back':
			return red(value, theme)
		default:
			return value
	}
}

export function formatChannel(value: string, theme: PreviewOutputTheme): string {
	switch (value) {
		case 'preview':
			return cyan(value, theme)
		case 'production':
			return green(value, theme)
		default:
			return value
	}
}

export function formatOverviewStatus(
	value: StableWorkerRow['status'] | PreviewScopeRow['status'],
	theme: PreviewOutputTheme
): string {
	switch (value) {
		case 'ready':
			return green(value, theme)
		case 'partial':
			return yellow(value, theme)
		case 'missing':
			return red(value, theme)
		default:
			return formatStatus(value, theme)
	}
}

function truncateCell(value: string, width: number): string {
	if (value.length <= width) {
		return value
	}

	if (width <= 1) {
		return '…'
	}

	return `${value.slice(0, width - 1)}…`
}

export function shortenVersionId(versionId: string, length: number = 12): string {
	return versionId.length <= length
		? versionId
		: `${versionId.slice(0, length)}…`
}
