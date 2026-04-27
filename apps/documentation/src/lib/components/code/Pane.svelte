<script lang="ts">
import { tooltip } from '$lib/components/layout/Tooltip.svelte'
import {
	cancelHideIntellisense,
	hideIntellisense,
	intellisense,
	scheduleHideIntellisense,
	showIntellisense
} from '$lib/intellisense/controller'
import { getIntellisenseEntryById } from '$lib/intellisense/registry'
import { m } from '$lib/paraglide/messages'
import { onDestroy, onMount, tick } from 'svelte'
import { type PreparedText, type PretextModule, loadPretext } from '../../vendor/pretext'
import type { NormalizedCodeFile, NormalizedCodeLine } from './block'

const COPIED_TOOLTIP = 'Copied!'
const CODE_SCROLL_MAX_HEIGHT_FALLBACK = 32 * 16
const CODE_TAB_SIZE = 4

const {
	file,
	files,
	copied,
	onCopy
}: {
	file: NormalizedCodeFile
	files: NormalizedCodeFile[]
	copied: boolean
	onCopy: () => void
} = $props()
// biome-ignore lint/style/useConst: Svelte bind:this assigns the element after mount.
let scroller = $state<HTMLDivElement | undefined>(undefined)
let lineCopyResetHandle: ReturnType<typeof setTimeout> | undefined
let activeIntellisenseAnchor = $state<HTMLElement | undefined>(undefined)
let pretextModule: PretextModule | undefined
let resizeObserver: ResizeObserver | undefined
let preparedFont = ''
let measurementFrameId: number | undefined
let stableScrollHeight = $state<number | undefined>(undefined)
const preparedFileCache = new Map<string, PreparedText>()

const scrollerStyle = $derived(stableScrollHeight ? `height: ${stableScrollHeight}px;` : undefined)

function getElementFromEventTarget(target: EventTarget | null): Element | undefined {
	if (typeof Node === 'undefined' || !(target instanceof Node)) {
		return undefined
	}

	if (typeof Element !== 'undefined' && target instanceof Element) {
		return target
	}

	return target.parentElement ?? undefined
}

function isHtmlElement(value: unknown): value is HTMLElement {
	return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
}

$effect(() => {
	const focusLine = file.firstFocusLine
	const filePath = file.path

	void tick().then(() => {
		if (!scroller || !filePath) {
			return
		}

		if (!focusLine) {
			scroller.scrollTop = 0
			return
		}

		const target = scroller.querySelector<HTMLElement>(`[data-line-index="${focusLine}"]`)
		if (!target) {
			return
		}

		const centeredTop = Math.max(
			0,
			target.offsetTop - Math.max(0, (scroller.clientHeight - target.offsetHeight) / 2)
		)

		scroller.scrollTop = centeredTop
	})
})

$effect(() => {
	if (!intellisense.visible) {
		activeIntellisenseAnchor = undefined
	}
})

$effect(() => {
	file.path

	hideIntellisense()
	activeIntellisenseAnchor = undefined

	if (scroller && tooltip.anchor instanceof HTMLElement && scroller.contains(tooltip.anchor)) {
		tooltip.hide()
	}
})

$effect(() => {
	files

	if (typeof window === 'undefined') {
		return
	}

	void tick().then(() => {
		scheduleStableHeightUpdate()
	})
})

function getIntellisenseTarget(target: EventTarget | null): HTMLElement | undefined {
	const element = getElementFromEventTarget(target)
	if (!element) {
		return undefined
	}

	return element.closest<HTMLElement>('[data-intellisense-id]') ?? undefined
}

function revealIntellisense(target: HTMLElement): void {
	const id = target.dataset.intellisenseId
	if (!id) {
		return
	}

	const entry = getIntellisenseEntryById(id)
	if (!entry) {
		return
	}

	activeIntellisenseAnchor = target
	showIntellisense(entry, target)
}

function handleIntellisensePointerOver(event: PointerEvent): void {
	const target = getIntellisenseTarget(event.target)
	if (!target) {
		return
	}

	cancelHideIntellisense()

	if (activeIntellisenseAnchor === target && intellisense.visible) {
		return
	}

	revealIntellisense(target)
}

function handleIntellisensePointerOut(event: PointerEvent): void {
	const currentTarget = getIntellisenseTarget(event.target)
	if (!currentTarget) {
		return
	}

	const nextTarget = getIntellisenseTarget(event.relatedTarget)
	if (nextTarget === currentTarget) {
		return
	}

	if (nextTarget) {
		revealIntellisense(nextTarget)
		return
	}

	if (activeIntellisenseAnchor === currentTarget) {
		scheduleHideIntellisense()
	}
}

async function copyLine(line: NormalizedCodeLine, target: EventTarget | null): Promise<void> {
	if (typeof navigator === 'undefined' || !navigator.clipboard || !isHtmlElement(target)) {
		return
	}

	await navigator.clipboard.writeText(line.text)
	tooltip.show(COPIED_TOOLTIP, target)

	if (lineCopyResetHandle) {
		clearTimeout(lineCopyResetHandle)
	}

	hideIntellisense()
	activeIntellisenseAnchor = undefined

	lineCopyResetHandle = setTimeout(() => {
		if (tooltip.anchor === target) {
			tooltip.hide()
		}
	}, 1500)
}

function parsePx(value: string): number | undefined {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : undefined
}

function getFontShorthand(style: CSSStyleDeclaration): string {
	return (
		style.font ||
		`${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
	)
}

async function getPretextModule(): Promise<PretextModule> {
	if (!pretextModule) {
		pretextModule = await loadPretext()
	}

	return pretextModule
}

function expandTabs(line: string): string {
	let column = 0
	let expanded = ''

	for (const character of line) {
		if (character === '\t') {
			const spacesToNextTabStop = CODE_TAB_SIZE - (column % CODE_TAB_SIZE)
			expanded += ' '.repeat(spacesToNextTabStop)
			column += spacesToNextTabStop
			continue
		}

		expanded += character
		column += 1
	}

	return expanded
}

function getMeasurementCode(file: NormalizedCodeFile): string {
	return file.code
		.split('\n')
		.map((line) => expandTabs(line))
		.join('\n')
}

function getPreparedFile(
	candidate: NormalizedCodeFile,
	font: string,
	prepare: PretextModule['prepare']
): PreparedText {
	if (preparedFont !== font) {
		preparedFont = font
		preparedFileCache.clear()
	}

	const cached = preparedFileCache.get(candidate.path)
	if (cached) {
		return cached
	}

	const prepared = prepare(getMeasurementCode(candidate), font, {
		whiteSpace: 'pre-wrap'
	})
	preparedFileCache.set(candidate.path, prepared)
	return prepared
}

async function updateStableHeight(): Promise<void> {
	if (!scroller) {
		return
	}

	const lineContent = scroller.querySelector<HTMLElement>('.docs-code-line-content')
	const lineSet = scroller.querySelector<HTMLElement>('.docs-code-line-set')
	if (!lineContent || !lineSet) {
		return
	}

	const lineContentStyle = window.getComputedStyle(lineContent)
	const lineSetStyle = window.getComputedStyle(lineSet)
	const scrollerComputedStyle = window.getComputedStyle(scroller)
	const lineHeight = parsePx(lineContentStyle.lineHeight)
	const linePaddingTop = parsePx(lineContentStyle.paddingTop) ?? 0
	const linePaddingBottom = parsePx(lineContentStyle.paddingBottom) ?? 0
	const linePaddingLeft = parsePx(lineContentStyle.paddingLeft) ?? 0
	const linePaddingRight = parsePx(lineContentStyle.paddingRight) ?? 0
	const lineSetPaddingTop = parsePx(lineSetStyle.paddingTop) ?? 0
	const lineSetPaddingBottom = parsePx(lineSetStyle.paddingBottom) ?? 0
	const maxHeight = parsePx(scrollerComputedStyle.maxHeight) ?? CODE_SCROLL_MAX_HEIGHT_FALLBACK
	const textWidth = lineContent.getBoundingClientRect().width - linePaddingLeft - linePaddingRight
	const font = getFontShorthand(lineContentStyle)

	if (!font || !lineHeight || textWidth <= 0) {
		return
	}

	const documentWithFonts = document as Document & { fonts?: FontFaceSet }
	if (documentWithFonts.fonts) {
		await documentWithFonts.fonts.ready
	}

	const { layout, prepare } = await getPretextModule()
	const logicalLinePaddingY = linePaddingTop + linePaddingBottom
	const lineSetPaddingY = lineSetPaddingTop + lineSetPaddingBottom
	let tallestHeight = 0

	for (const candidate of files) {
		const measurementCode = getMeasurementCode(candidate)
		const contentHeight =
			measurementCode.length > 0
				? layout(getPreparedFile(candidate, font, prepare), textWidth, lineHeight).height
				: lineHeight
		const candidateHeight = Math.ceil(
			contentHeight + candidate.lines.length * logicalLinePaddingY + lineSetPaddingY
		)

		tallestHeight = Math.max(tallestHeight, candidateHeight)
	}

	stableScrollHeight = Math.max(0, Math.min(tallestHeight, maxHeight))
}

function scheduleStableHeightUpdate(): void {
	if (typeof window === 'undefined' || measurementFrameId !== undefined) {
		return
	}

	measurementFrameId = window.requestAnimationFrame(() => {
		measurementFrameId = undefined
		void updateStableHeight()
	})
}

onMount(() => {
	if (typeof ResizeObserver !== 'undefined' && scroller) {
		resizeObserver = new ResizeObserver(() => {
			scheduleStableHeightUpdate()
		})
		resizeObserver.observe(scroller)
	}

	void tick().then(() => {
		scheduleStableHeightUpdate()
	})

	return () => {
		resizeObserver?.disconnect()

		if (measurementFrameId !== undefined) {
			window.cancelAnimationFrame(measurementFrameId)
		}
	}
})

onDestroy(() => {
	if (lineCopyResetHandle) {
		clearTimeout(lineCopyResetHandle)
	}

	hideIntellisense()

	if (isHtmlElement(tooltip.anchor) && scroller?.contains(tooltip.anchor)) {
		tooltip.hide()
	}
})
</script>

<div class="docs-code-pane group relative min-w-0">
	<button
		type="button"
		onclick={onCopy}
		class="docs-code-copy-button docs-focus-ring absolute top-3 right-3 z-10 inline-flex items-center gap-2 px-3 py-1.5 text-[0.76rem] font-medium tracking-[0.03em] transition"
	>
		<span aria-hidden="true" class={`iconify size-4 shrink-0 ${copied ? 'fluent--clipboard-checkmark-16-regular' : 'fluent--clipboard-code-16-regular'}`}></span>
		<span>{copied ? m.code_copied() : m.code_copy()}</span>
	</button>

	<div
		bind:this={scroller}
		class="docs-code-scroll overflow-y-auto overflow-x-hidden px-0 py-0"
		style={scrollerStyle}
		onscroll={() => {
			hideIntellisense()
			activeIntellisenseAnchor = undefined
		}}
	>
		<div class="docs-code-pre" aria-label={`Code sample for ${file.displayPath ?? file.label}`}>
			<div
				class={`docs-code-content language-${file.language}`}
				role="presentation"
				onpointerover={handleIntellisensePointerOver}
				onpointerout={handleIntellisensePointerOut}
			>
				<div class="docs-code-line-set">
					{#each file.lines as line (line.index)}
						<div
							class={`docs-code-line ${line.state === 'focus' ? 'docs-code-line-focus' : ''} ${line.state === 'dim' ? 'docs-code-line-dim' : ''}`}
							data-line-index={line.index}
						>
							<button
								type="button"
								class="docs-code-gutter-button docs-focus-ring"
								onclick={(event) => copyLine(line, event.currentTarget)}
								aria-label={`Copy line ${line.number}`}
							>
								<span class="docs-code-gutter select-none">{line.number}</span>
							</button>
							<span class="docs-code-line-content">{#if line.html}{@html line.html}{:else}&nbsp;{/if}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
