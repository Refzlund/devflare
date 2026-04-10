import type { ConsolaInstance } from 'consola'
import { BOLD, CYAN, CYAN_BOLD, DIM, GREEN, RED, RESET, WHITE, YELLOW } from './colors'

const ANSI_REGEX = /\x1b\[[0-9;]*m/g

export interface CliTheme {
	useColor: boolean
}

export type CliAccent = 'cyan' | 'yellow' | 'green' | 'red' | 'dim' | 'bold' | 'white-dim'

export interface CliTableColumn<Row> {
	label: string
	width?: number
	value: (row: Row) => string
}

export function createCliTheme(options: Record<string, string | boolean> = {}): CliTheme {
	if (options['no-color'] === true) {
		return { useColor: false }
	}

	if (process.env.NO_COLOR?.trim()) {
		return { useColor: false }
	}

	if (process.env.TERM === 'dumb') {
		return { useColor: false }
	}

	return {
		useColor: process.stdout?.isTTY === true
	}
}

export function paint(value: string, code: string, theme: CliTheme): string {
	return theme.useColor ? `${code}${value}${RESET}` : value
}

export function dim(value: string, theme: CliTheme): string {
	return paint(value, DIM, theme)
}

export function bold(value: string, theme: CliTheme): string {
	return paint(value, BOLD, theme)
}

export function cyan(value: string, theme: CliTheme): string {
	return paint(value, CYAN, theme)
}

export function cyanBold(value: string, theme: CliTheme): string {
	return paint(value, CYAN_BOLD, theme)
}

export function green(value: string, theme: CliTheme): string {
	return paint(value, GREEN, theme)
}

export function yellow(value: string, theme: CliTheme): string {
	return paint(value, YELLOW, theme)
}

export function yellowBold(value: string, theme: CliTheme): string {
	return paint(value, `${BOLD}${YELLOW}`, theme)
}

export function red(value: string, theme: CliTheme): string {
	return paint(value, RED, theme)
}

export function whiteDim(value: string, theme: CliTheme): string {
	return paint(value, `${DIM}${WHITE}`, theme)
}

export function accent(value: string, theme: CliTheme, kind: CliAccent = 'cyan'): string {
	switch (kind) {
		case 'yellow':
			return yellowBold(value, theme)
		case 'green':
			return green(value, theme)
		case 'red':
			return red(value, theme)
		case 'dim':
			return dim(value, theme)
		case 'bold':
			return bold(value, theme)
		case 'white-dim':
			return whiteDim(value, theme)
		case 'cyan':
		default:
			return cyanBold(value, theme)
	}
}

export function logLine(logger: ConsolaInstance, message: string = ''): void {
	logger.log(message)
}

export function stripAnsi(value: string): string {
	return value.replace(ANSI_REGEX, '')
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

function truncateStyledCell(value: string, width: number): string {
	const plainValue = stripAnsi(value)
	if (plainValue.length <= width) {
		return value
	}

	const truncatedPlainValue = truncateCell(plainValue, width)
	const prefixMatch = value.match(/^((?:\x1b\[[0-9;]*m)+)/)
	const suffixMatch = value.match(/((?:\x1b\[[0-9;]*m)+)$/)
	const prefix = prefixMatch?.[1] ?? ''
	const suffix = prefix ? RESET : suffixMatch?.[1] ?? ''

	return `${prefix}${truncatedPlainValue}${suffix}`
}

function padStyledCell(value: string, width: number): string {
	const truncatedValue = truncateStyledCell(value, width)
	const visibleLength = stripAnsi(truncatedValue).length
	return `${truncatedValue}${' '.repeat(Math.max(width - visibleLength, 0))}`
}

export function formatTableLine(values: string[], widths: Array<number | undefined>): string {
	return values.map((value, index) => {
		const width = widths[index]
		if (width === undefined || index === values.length - 1) {
			return value
		}

		return padStyledCell(value, width)
	}).join('  ')
}

export function renderTable<Row>(
	rows: Row[],
	columns: CliTableColumn<Row>[],
	theme: CliTheme
): string[] {
	if (rows.length === 0) {
		return []
	}

	const widths = columns.map((column) => column.width)
	return [
		formatTableLine(columns.map((column) => dim(column.label, theme)), widths),
		...rows.map((row) => formatTableLine(columns.map((column) => column.value(row)), widths))
	]
}

export function logTable<Row>(
	logger: ConsolaInstance,
	options: {
		title: string
		rows: Row[]
		columns: CliTableColumn<Row>[]
		theme: CliTheme
		titleAccent?: CliAccent
	}
): void {
	if (options.rows.length === 0) {
		return
	}

	logLine(logger, `${accent(options.title, options.theme, options.titleAccent)} ${dim(`(${options.rows.length})`, options.theme)}`)
	for (const line of renderTable(options.rows, options.columns, options.theme)) {
		logLine(logger, line)
	}
}

export function formatLabelValue(
	label: string,
	value: string,
	theme: CliTheme,
	labelWidth: number = 12
): string {
	return `${dim(label.padEnd(labelWidth), theme)} ${value}`
}

export function formatCommand(command: string, description: string, theme: CliTheme): string {
	return `  ${cyan(command, theme)}${dim(' — ', theme)}${description}`
}

export function formatBullet(text: string, theme: CliTheme, bullet: string = '•'): string {
	return `  ${dim(bullet, theme)} ${text}`
}
