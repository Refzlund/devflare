<script lang="ts">
	import { onMount, tick } from 'svelte'
	import { loadPretext, type PretextModule } from '../../vendor/pretext'
	import InlineText from '../content/InlineText.svelte'

	type TocItem = {
		id: string
		indexLabel: string
		title: string
	}

	type TocMode = 'full' | 'narrow' | 'numbers' | 'hidden'

	const COLLAPSED_WIDTH = 56
	const MIN_NARROW_TITLE_WIDTH = 112
	const MIN_DESKTOP_TITLE_WIDTH = 168
	const MIN_HOVER_TITLE_WIDTH = 104
	const MIN_RAIL_HOVER_TITLE_WIDTH = 48
	const MAX_TITLE_WIDTH = 440
	const SAFE_GAP = 24
	const MIN_CONTENT_LEFT = 24
	const SIDEBAR_SAFE_GAP = 32
	const MAX_CONTENT_OFFSET = 260
	const MIN_TOC_VIEWPORT_WIDTH = 760

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

	function getBaseContentRect(): DOMRect | null {
		if (!contentElement) {
			return null
		}

		const rect = contentElement.getBoundingClientRect()
		return new DOMRect(
			rect.left - contentOffset,
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

	function getMaxContentOffset(contentRect: DOMRect): number {
		return Math.max(
			0,
			Math.min(MAX_CONTENT_OFFSET, contentRect.left - getMinContentLeft())
		)
	}

	function getAvailableSpace(tocRightX: number, contentRight: number, nextContentOffset: number): number {
		return tocRightX - SAFE_GAP - (contentRight + nextContentOffset)
	}

	function resolveOffsetForWidth(
		tocRightX: number,
		contentRect: DOMRect,
		requiredWidth: number
	): number | null {
		const availableSpace = getAvailableSpace(tocRightX, contentRect.right, 0)
		if (availableSpace >= requiredWidth) {
			return 0
		}

		const neededOffset = requiredWidth - availableSpace
		const maxOffset = getMaxContentOffset(contentRect)
		if (neededOffset <= maxOffset) {
			return -neededOffset
		}

		return null
	}

	function resolveOffsetForPreferredWidth(
		tocRightX: number,
		contentRect: DOMRect,
		requiredWidth: number,
		preferredWidth: number
	): number | null {
		const availableSpace = getAvailableSpace(tocRightX, contentRect.right, 0)
		const maxOffset = getMaxContentOffset(contentRect)
		if (availableSpace + maxOffset < requiredWidth) {
			return null
		}

		const desiredOffset = Math.max(0, preferredWidth - availableSpace)
		return -Math.min(maxOffset, desiredOffset)
	}

	async function measureNaturalTitleWidth(): Promise<number> {
		if (!tocElement) {
			return MIN_DESKTOP_TITLE_WIDTH
		}

		const styleSource = tocElement.querySelector<HTMLElement>('[data-docs-toc-title]')
		if (!styleSource) {
			return MIN_DESKTOP_TITLE_WIDTH
		}

		const titleTexts = Array.from(
			tocElement.querySelectorAll<HTMLElement>('[data-docs-toc-title]')
		)
			.map((element) => element.textContent?.trim() ?? '')
			.filter((title) => title.length > 0)

		if (titleTexts.length === 0) {
			return MIN_DESKTOP_TITLE_WIDTH
		}

		const computedStyle = window.getComputedStyle(styleSource)
		const font = computedStyle.font || `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`
		if (!font) {
			return MIN_DESKTOP_TITLE_WIDTH
		}

		const documentWithFonts = document as Document & { fonts?: FontFaceSet }
		if (documentWithFonts.fonts) {
			await documentWithFonts.fonts.ready
		}

		const { measureNaturalWidth, prepareWithSegments } = await getPretextModule()
		let nextTitleWidth = MIN_DESKTOP_TITLE_WIDTH

		for (const titleText of titleTexts) {
			const prepared = prepareWithSegments(titleText, font)
			nextTitleWidth = Math.max(nextTitleWidth, Math.ceil(measureNaturalWidth(prepared) + 18))
		}

		return Math.min(nextTitleWidth, MAX_TITLE_WIDTH)
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
		const naturalTitleWidth = await measureNaturalTitleWidth()
		const fullTitleWidth = Math.max(MIN_DESKTOP_TITLE_WIDTH, naturalTitleWidth)
		const fullWidth = COLLAPSED_WIDTH + fullTitleWidth

		const fullOffset = resolveOffsetForWidth(tocRightX, contentRect, fullWidth)
		if (fullOffset !== null) {
			applyLayout('full', fullTitleWidth, fullOffset)
			return
		}

		const minNarrowWidth = COLLAPSED_WIDTH + MIN_NARROW_TITLE_WIDTH
		const narrowOffset = resolveOffsetForWidth(tocRightX, contentRect, minNarrowWidth)
		if (narrowOffset !== null) {
			const availableSpace = getAvailableSpace(tocRightX, contentRect.right, narrowOffset)
			const nextTitleWidth = Math.min(
				fullTitleWidth,
				Math.max(MIN_NARROW_TITLE_WIDTH, availableSpace - COLLAPSED_WIDTH)
			)
			applyLayout('narrow', nextTitleWidth, narrowOffset)
			return
		}

		const preferredRailWidth = Math.min(fullWidth, COLLAPSED_WIDTH + MIN_HOVER_TITLE_WIDTH)
		const railOffset = resolveOffsetForPreferredWidth(
			tocRightX,
			contentRect,
			COLLAPSED_WIDTH,
			preferredRailWidth
		)
		if (railOffset !== null) {
			const availableSpace = getAvailableSpace(tocRightX, contentRect.right, railOffset)
			const hoverTitleWidth = Math.min(
				fullTitleWidth,
				Math.max(0, availableSpace - COLLAPSED_WIDTH)
			)
			applyLayout(
				hoverTitleWidth >= MIN_RAIL_HOVER_TITLE_WIDTH ? 'numbers' : 'hidden',
				hoverTitleWidth,
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

	$effect(() => {
		if (!hasMounted) {
			return
		}

		const resizeObserver = new ResizeObserver(() => scheduleLayoutUpdate())
		if (contentElement) {
			resizeObserver.observe(contentElement)
		}
		if (tocElement) {
			resizeObserver.observe(tocElement)
		}
		resizeObserver.observe(document.documentElement)

		return () => {
			resizeObserver.disconnect()
		}
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
