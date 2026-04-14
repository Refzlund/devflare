import { createSingleton, flip, offset, shift } from '$lib/vendor/floating-runes'
import type { IntellisenseEntry } from './types'

export const intellisense = createSingleton<IntellisenseEntry>({
	placement: 'top-start',
	strategy: 'fixed',
	middleware: [
		offset(12),
		flip({ padding: 12 }),
		shift({ padding: 12 })
	],
	showDelay: 0,
	hideDelay: 0,
	showOn: [],
	hideOn: []
})

let hideHandle: ReturnType<typeof setTimeout> | undefined
let tooltipHovered = false

export function cancelHideIntellisense(): void {
	if (hideHandle) {
		clearTimeout(hideHandle)
		hideHandle = undefined
	}
}

export function showIntellisense(entry: IntellisenseEntry, anchor: HTMLElement): void {
	cancelHideIntellisense()
	intellisense.show(entry, anchor)
}

export function scheduleHideIntellisense(delay = 220): void {
	cancelHideIntellisense()

	if (tooltipHovered) {
		return
	}

	hideHandle = setTimeout(() => {
		if (!tooltipHovered) {
			intellisense.hide()
		}
	}, delay)
}

export function hideIntellisense(): void {
	cancelHideIntellisense()
	intellisense.hide()
}

export function setIntellisenseTooltipHovered(next: boolean): void {
	tooltipHovered = next

	if (next) {
		cancelHideIntellisense()
		return
	}

	scheduleHideIntellisense(140)
}
