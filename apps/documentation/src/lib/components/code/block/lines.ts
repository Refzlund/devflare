import type { DocCodeLineRange } from '$lib/docs/types'
import type { LineState } from './types'

export function extendFocusLines(
	code: string,
	ranges: DocCodeLineRange[] | undefined
): DocCodeLineRange[] | undefined {
	if (!ranges?.length) {
		return undefined
	}

	const codeLines = code.split('\n')

	return ranges.map((range) => {
		if (!Array.isArray(range)) {
			return range
		}

		let [start, end] = range

		while (end < codeLines.length && isTrailingClosureLine(codeLines[end])) {
			end += 1
		}

		return [start, end]
	})
}

export function getLineState(
	lineIndex: number,
	focusLines: DocCodeLineRange[] | undefined,
	dimLines: DocCodeLineRange[] | undefined
): LineState {
	if (isLineInRanges(lineIndex, focusLines)) {
		return 'focus'
	}

	if (focusLines?.length) {
		return 'dim'
	}

	if (isLineInRanges(lineIndex, dimLines)) {
		return 'dim'
	}

	return 'normal'
}

export function getFirstLine(ranges: DocCodeLineRange[] | undefined): number | undefined {
	if (!ranges?.length) {
		return undefined
	}

	return ranges.reduce<number | undefined>((current, range) => {
		const value = Array.isArray(range) ? range[0] : range
		if (!current) {
			return value
		}

		return Math.min(current, value)
	}, undefined)
}

function isLineInRanges(lineIndex: number, ranges: DocCodeLineRange[] | undefined): boolean {
	if (!ranges?.length) {
		return false
	}

	return ranges.some((range) => {
		if (Array.isArray(range)) {
			return lineIndex >= range[0] && lineIndex <= range[1]
		}

		return lineIndex === range
	})
}

function isTrailingClosureLine(line: string): boolean {
	const trimmed = line.trim()

	if (!trimmed) {
		return false
	}

	return /^[\]\)\}]+[,;\]\)\}]*$/.test(trimmed) || /^<\/[a-z][\w:-]*>$/.test(trimmed)
}
