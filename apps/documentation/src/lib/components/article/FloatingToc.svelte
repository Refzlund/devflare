<script lang="ts">
	import { onMount, tick } from 'svelte'
	import { loadPretext, type PreparedText, type PretextModule } from '../../vendor/pretext'
	import InlineText from '../content/InlineText.svelte'

	type TocItem = {
		id: string
		indexLabel: string
		title: string
	}

	type TocMode = 'full' | 'narrow' | 'numbers' | 'hidden'

	const COLLAPSED_WIDTH = 48
	const MIN_DESKTOP_TITLE_WIDTH = 168
	const MIN_READABLE_TITLE_WIDTH = 220
	const PREFERRED_TEXT_TITLE_WIDTH = 320
	const HOVER_TITLE_WIDTH = 320
	const MAX_TITLE_WIDTH = 440
	const MAX_READABLE_TITLE_LINES = 2
	const SAFE_GAP = 24
	const MIN_CONTENT_LEFT = 24
	const SIDEBAR_SAFE_GAP = 32
	const MIN_TOC_VIEWPORT_WIDTH = 760

	type TitleMetrics = {
		naturalWidth: number
		readableWidth: number
		lineCountAt: (width: number) => number
	}

	let {
		items,
		activeId,
		ariaLabel,
		contentElement,
		onContentOffsetChange
	}: {
		items: TocItem[]
		activeId: string
		ariaLabel: string
		contentElement: HTMLElement | null
		onContentOffsetChange?: (offset: number) => void
	} = $props()

	let hasMounted = false
	let pretextModule: PretextModule | undefined
	let tocElement = $state<HTMLElement | null>(null)
	let titleWidth = $state(MIN_DESKTOP_TITLE_WIDTH)
	let tocMode = $state<TocMode>('full')
	let isPinnedOpen = $state(false)
	let tocLayoutReady = $state(false)
	let contentOffset = $state(0)
	let layoutAnimationFrameId: number | undefined

	const isRailMode = $derived(tocMode === 'numbers')
	const panelStyle = $derived(
		[
			`--docs-toc-collapsed-width: ${COLLAPSED_WIDTH}px`,
			`--docs-toc-title-width: ${titleWidth}px`,
			`--docs-toc-expanded-width: ${COLLAPSED_WIDTH + titleWidth}px`
		].join('; ')
	)

	async function getPretextModule(): Promise<PretextModule> {
		if (!pretextModule) {
			pretextModule = await loadPretext()
		}

		return pretextModule
	}

	function setContentOffset(nextOffset: number): void {
		const roundedOffset = Math.round(nextOffset)
		if (Math.abs(contentOffset - roundedOffset) < 1) {
			return
		}

		contentOffset = roundedOffset
		onContentOffsetChange?.(roundedOffset)
	}

	function applyLayout(nextMode: TocMode, nextTitleWidth: number, nextContentOffset: number): void {
		tocMode = nextMode
		titleWidth = Math.max(0, Math.round(nextTitleWidth))
		setContentOffset(nextMode === 'hidden' ? 0 : nextContentOffset)
		tocLayoutReady = nextMode === 'hidden' || !tocElement || window.getComputedStyle(tocElement).position !== 'static'

		if (nextMode !== 'numbers') {
			isPinnedOpen = false
		}

		if (!tocLayoutReady) {
			window.setTimeout(() => scheduleLayoutUpdate(), 50)
		}
	}

	function getTocRightX(): number {
		if (tocElement) {
			const rect = tocElement.getBoundingClientRect()
			if (rect.right > 0) {
				return rect.right
			}
		}

		return window.innerWidth - 16
	}

	function getElementTranslateX(element: HTMLElement): number {
		const transform = window.getComputedStyle(element).transform
		if (!transform || transform === 'none') {
			return 0
		}

		try {
			return new DOMMatrixReadOnly(transform).m41
		} catch {
			return 0
		}
	}

	function getBaseContentRect(): DOMRect | null {
		if (!contentElement) {
			return null
		}

		const rect = contentElement.getBoundingClientRect()
		const translateX = getElementTranslateX(contentElement)
		return new DOMRect(
			rect.left - translateX,
			rect.top,
			rect.width,
			rect.height
		)
	}

	function getMinContentLeft(): number {
		if (window.innerWidth < 1024) {
			return MIN_CONTENT_LEFT
		}

		const sidebarElement = document.querySelector<HTMLElement>('.docs-sidebar-panel')
		if (!sidebarElement) {
			return MIN_CONTENT_LEFT
		}

		const sidebarRect = sidebarElement.getBoundingClientRect()
		if (sidebarRect.width <= 0 || sidebarRect.right <= 0) {
			return MIN_CONTENT_LEFT
		}

		return Math.max(MIN_CONTENT_LEFT, sidebarRect.right + SIDEBAR_SAFE_GAP)
	}

	function getCenteredContentOffset(tocRightX: number, contentRect: DOMRect, tocWidth: number): number | null {
		const railLeft = tocRightX - tocWidth
		const laneLeft = getMinContentLeft()
		const laneRight = railLeft - SAFE_GAP
		const laneWidth = laneRight - laneLeft
		if (laneWidth < contentRect.width) {
			return null
		}

		const targetLeft = laneLeft + ((laneWidth - contentRect.width) / 2)
		return Math.round(targetLeft - contentRect.left)
	}

	async function measureTitleMetrics(): Promise<TitleMetrics> {
		if (!tocElement) {
			return {
				naturalWidth: MIN_DESKTOP_TITLE_WIDTH,
				readableWidth: MIN_READABLE_TITLE_WIDTH,
				lineCountAt: () => 1
			}
		}

		const styleSource = tocElement.querySelector<HTMLElement>('[data-docs-toc-title]')
		if (!styleSource) {
			return {
				naturalWidth: MIN_DESKTOP_TITLE_WIDTH,
				readableWidth: MIN_READABLE_TITLE_WIDTH,
				lineCountAt: () => 1
			}
		}

		const titleTexts = Array.from(
			tocElement.querySelectorAll<HTMLElement>('[data-docs-toc-title]')
		)
			.map((element) => element.textContent?.trim() ?? '')
			.filter((title) => title.length > 0)

		if (titleTexts.length === 0) {
			return {
				naturalWidth: MIN_DESKTOP_TITLE_WIDTH,
				readableWidth: MIN_READABLE_TITLE_WIDTH,
				lineCountAt: () => 1
			}
		}

		const computedStyle = window.getComputedStyle(styleSource)
		const font = computedStyle.font || `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`
		if (!font) {
			return {
				naturalWidth: MIN_DESKTOP_TITLE_WIDTH,
				readableWidth: MIN_READABLE_TITLE_WIDTH,
				lineCountAt: () => 1
			}
		}

		const documentWithFonts = document as Document & { fonts?: FontFaceSet }
		if (documentWithFonts.fonts) {
			await documentWithFonts.fonts.ready
		}

		const lineHeight = Number.parseFloat(computedStyle.lineHeight)
			|| Number.parseFloat(computedStyle.fontSize) * 1.55
		const { layout, measureNaturalWidth, prepare, prepareWithSegments } = await getPretextModule()
		const preparedTitles: PreparedText[] = []
		let nextTitleWidth = MIN_DESKTOP_TITLE_WIDTH

		for (const titleText of titleTexts) {
			preparedTitles.push(prepare(titleText, font))
			const prepared = prepareWithSegments(titleText, font)
			nextTitleWidth = Math.max(nextTitleWidth, Math.ceil(measureNaturalWidth(prepared) + 18))
		}

		const naturalWidth = Math.min(nextTitleWidth, MAX_TITLE_WIDTH)
		const lineCountAt = (width: number) => Math.max(
			1,
			...preparedTitles.map((prepared) => layout(prepared, Math.max(1, width), lineHeight).lineCount)
		)
		let readableWidth = Math.min(naturalWidth, PREFERRED_TEXT_TITLE_WIDTH)

		for (let width = MIN_READABLE_TITLE_WIDTH; width <= naturalWidth; width += 8) {
			if (lineCountAt(width) <= MAX_READABLE_TITLE_LINES) {
				readableWidth = width
				break
			}
		}

		return {
			naturalWidth,
			readableWidth,
			lineCountAt
		}
	}

	async function updateResponsiveLayout(): Promise<void> {
		if (!hasMounted || !contentElement) {
			return
		}

		const contentRect = getBaseContentRect()
		if (!contentRect || window.innerWidth < MIN_TOC_VIEWPORT_WIDTH) {
			applyLayout('hidden', 0, 0)
			return
		}

		const tocRightX = getTocRightX()
		const titleMetrics = await measureTitleMetrics()
		const fullTitleWidth = Math.max(MIN_DESKTOP_TITLE_WIDTH, titleMetrics.naturalWidth)
		const preferredTitleWidth = Math.min(
			fullTitleWidth,
			Math.max(titleMetrics.readableWidth, PREFERRED_TEXT_TITLE_WIDTH)
		)

		for (let nextTitleWidth = preferredTitleWidth; nextTitleWidth >= titleMetrics.readableWidth; nextTitleWidth -= 8) {
			if (titleMetrics.lineCountAt(nextTitleWidth) > MAX_READABLE_TITLE_LINES) {
				continue
			}

			const nextContentOffset = getCenteredContentOffset(
				tocRightX,
				contentRect,
				COLLAPSED_WIDTH + nextTitleWidth
			)
			if (nextContentOffset !== null) {
				applyLayout(
					Math.abs(nextTitleWidth - fullTitleWidth) <= 2 ? 'full' : 'narrow',
					nextTitleWidth,
					nextContentOffset
				)
				return
			}
		}

		const railOffset = getCenteredContentOffset(tocRightX, contentRect, COLLAPSED_WIDTH)
		if (railOffset !== null) {
			applyLayout(
				'numbers',
				Math.min(fullTitleWidth, HOVER_TITLE_WIDTH),
				railOffset
			)
			return
		}

		applyLayout('hidden', 0, 0)
	}

	function scheduleLayoutUpdate(): void {
		if (!hasMounted || layoutAnimationFrameId !== undefined) {
			return
		}

		layoutAnimationFrameId = window.requestAnimationFrame(() => {
			layoutAnimationFrameId = undefined
			void updateResponsiveLayout()
		})
	}

	function handleLinkClick(event: MouseEvent): void {
		const triggeredByKeyboard = event.detail === 0
		const expandedByHover = tocElement?.matches(':hover') ?? false

		if (!isRailMode || isPinnedOpen || expandedByHover || triggeredByKeyboard) {
			return
		}

		event.preventDefault()
		isPinnedOpen = true
	}

	onMount(() => {
		hasMounted = true

		const handleViewportResize = () => scheduleLayoutUpdate()
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || !isRailMode) {
				return
			}

			isPinnedOpen = false
		}
		const handleDocumentPointerDown = (event: PointerEvent) => {
			if (!isRailMode || !isPinnedOpen || !tocElement) {
				return
			}

			const target = event.target
			if (target instanceof Node && tocElement.contains(target)) {
				return
			}

			isPinnedOpen = false
		}

		window.addEventListener('resize', handleViewportResize)
		window.visualViewport?.addEventListener('resize', handleViewportResize)
		document.addEventListener('keydown', handleKeyDown)
		document.addEventListener('pointerdown', handleDocumentPointerDown)

		void tick().then(() => updateResponsiveLayout())

		return () => {
			if (layoutAnimationFrameId !== undefined) {
				window.cancelAnimationFrame(layoutAnimationFrameId)
			}

			setContentOffset(0)
			window.removeEventListener('resize', handleViewportResize)
			window.visualViewport?.removeEventListener('resize', handleViewportResize)
			document.removeEventListener('keydown', handleKeyDown)
			document.removeEventListener('pointerdown', handleDocumentPointerDown)
		}
	})

	$effect(() => {
		items
		contentElement

		if (!hasMounted) {
			return
		}

		void tick().then(() => updateResponsiveLayout())
	})
</script>

<div
	bind:this={tocElement}
	class={`docs-floating-toc docs-floating-toc-${tocMode} ${isPinnedOpen ? 'docs-floating-toc-pinned' : ''}`}
	style={panelStyle}
	hidden={tocMode === 'hidden'}
	data-docs-floating-toc
	data-ready={tocLayoutReady ? 'true' : 'false'}
>
	<nav aria-label={ariaLabel}>
		<p class="sr-only">{ariaLabel}</p>

		<ol class="docs-floating-toc-list">
			{#each items as item}
				{@const active = activeId === item.id}
				<li>
					<a
						href={`#${item.id}`}
						aria-current={active ? 'location' : undefined}
						class={`docs-floating-toc-link ${active ? 'docs-floating-toc-link-active' : ''}`}
						onclick={handleLinkClick}
					>
						<span class="docs-floating-toc-index docs-label">{item.indexLabel}</span>
						<span class="docs-floating-toc-title-shell">
							<span class="docs-floating-toc-title docs-meta" data-docs-toc-title>
								<InlineText text={item.title} />
							</span>
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</nav>
</div>
