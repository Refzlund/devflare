<script lang="ts">
	import { onMount, tick } from 'svelte'
	import floatingUI from '../../vendor/floating-runes'
	import { loadPretext, type PretextModule } from '../../vendor/pretext'
	import InlineText from '../content/InlineText.svelte'

	type TocItem = {
		id: string
		indexLabel: string
		title: string
	}

	const COLLAPSED_WIDTH = 56
	const MIN_COMPACT_TITLE_WIDTH = 112
	const MIN_DESKTOP_TITLE_WIDTH = 168
	const MAX_TITLE_WIDTH = 440
	const VIEWPORT_PADDING = 32
	const COMPACT_MEDIA_QUERY = '(max-width: 72rem)'

	let {
		items,
		activeId,
		ariaLabel
	}: {
		items: TocItem[]
		activeId: string
		ariaLabel: string
	} = $props()

	const tocFloat = floatingUI({
		placement: 'left-start',
		strategy: 'fixed'
	})

	let hasMounted = false
	let compactMediaQueryList: MediaQueryList | undefined
	let pretextModule: PretextModule | undefined
	let tocElement = $state<HTMLElement | null>(null)
	let titleWidth = $state(MIN_DESKTOP_TITLE_WIDTH)
	let isCompact = $state(false)
	let isPinnedOpen = $state(false)
	let widthAnimationFrameId: number | undefined

	const panelStyle = $derived(
		[
			`--docs-toc-collapsed-width: ${COLLAPSED_WIDTH}px`,
			`--docs-toc-title-width: ${titleWidth}px`,
			`--docs-toc-expanded-width: ${COLLAPSED_WIDTH + titleWidth}px`
		].join('; ')
	)

	function getMinTitleWidth(): number {
		return isCompact ? MIN_COMPACT_TITLE_WIDTH : MIN_DESKTOP_TITLE_WIDTH
	}

	function handleCompactChange(query: MediaQueryList | MediaQueryListEvent): void {
		isCompact = query.matches

		if (!isCompact) {
			isPinnedOpen = false
		}
	}

	function scheduleTitleWidthUpdate(): void {
		if (!hasMounted || widthAnimationFrameId !== undefined) {
			return
		}

		widthAnimationFrameId = window.requestAnimationFrame(() => {
			widthAnimationFrameId = undefined
			void updateTitleWidth()
		})
	}

	async function getPretextModule(): Promise<PretextModule> {
		if (!pretextModule) {
			pretextModule = await loadPretext()
		}

		return pretextModule
	}

	async function updateTitleWidth(): Promise<void> {
		if (!tocElement) {
			return
		}

		const styleSource = tocElement.querySelector<HTMLElement>('[data-docs-toc-title]')
		if (!styleSource) {
			return
		}

		const titleTexts = Array.from(
			tocElement.querySelectorAll<HTMLElement>('[data-docs-toc-title]')
		)
			.map((element) => element.textContent?.trim() ?? '')
			.filter((title) => title.length > 0)

		if (titleTexts.length === 0) {
			return
		}

		const computedStyle = window.getComputedStyle(styleSource)
		const font = computedStyle.font || `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`
		if (!font) {
			return
		}

		const documentWithFonts = document as Document & { fonts?: FontFaceSet }
		if (documentWithFonts.fonts) {
			await documentWithFonts.fonts.ready
		}

		const { measureNaturalWidth, prepareWithSegments } = await getPretextModule()
		const minTitleWidth = getMinTitleWidth()
		let nextTitleWidth = minTitleWidth

		for (const titleText of titleTexts) {
			const prepared = prepareWithSegments(titleText, font)
			nextTitleWidth = Math.max(nextTitleWidth, Math.ceil(measureNaturalWidth(prepared) + 18))
		}

		const maxViewportWidth = Math.max(minTitleWidth, window.innerWidth - COLLAPSED_WIDTH - VIEWPORT_PADDING)
		titleWidth = Math.max(
			minTitleWidth,
			Math.min(nextTitleWidth, Math.min(MAX_TITLE_WIDTH, maxViewportWidth))
		)
	}

	function handleLinkClick(event: MouseEvent): void {
		const triggeredByKeyboard = event.detail === 0
		const expandedByHover = tocElement?.matches(':hover') ?? false

		if (!isCompact || isPinnedOpen || expandedByHover || triggeredByKeyboard) {
			return
		}

		event.preventDefault()
		isPinnedOpen = true
	}

	onMount(() => {
		hasMounted = true
		compactMediaQueryList = window.matchMedia(COMPACT_MEDIA_QUERY)

		handleCompactChange(compactMediaQueryList)

		const handleCompactQueryChange = (event: MediaQueryListEvent) => {
			handleCompactChange(event)
			scheduleTitleWidthUpdate()
		}
		const handleResize = () => scheduleTitleWidthUpdate()
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || !isCompact) {
				return
			}

			isPinnedOpen = false
		}
		const handleDocumentPointerDown = (event: PointerEvent) => {
			if (!isCompact || !isPinnedOpen || !tocElement) {
				return
			}

			const target = event.target
			if (target instanceof Node && tocElement.contains(target)) {
				return
			}

			isPinnedOpen = false
		}

		compactMediaQueryList.addEventListener('change', handleCompactQueryChange)
		window.addEventListener('resize', handleResize)
		document.addEventListener('keydown', handleKeyDown)
		document.addEventListener('pointerdown', handleDocumentPointerDown)

		void tick().then(() => updateTitleWidth())

		return () => {
			if (widthAnimationFrameId !== undefined) {
				window.cancelAnimationFrame(widthAnimationFrameId)
			}

			compactMediaQueryList?.removeEventListener('change', handleCompactQueryChange)
			window.removeEventListener('resize', handleResize)
			document.removeEventListener('keydown', handleKeyDown)
			document.removeEventListener('pointerdown', handleDocumentPointerDown)
		}
	})

	$effect(() => {
		items

		if (!hasMounted) {
			return
		}

		void tick().then(() => updateTitleWidth())
	})
</script>

<div class="docs-floating-toc-anchor" use:tocFloat.ref aria-hidden="true"></div>


<div
	bind:this={tocElement}
	use:tocFloat
	class={`docs-floating-toc ${isCompact ? 'docs-floating-toc-compact' : 'docs-floating-toc-wide'} ${isPinnedOpen ? 'docs-floating-toc-pinned' : ''}`}
	style={panelStyle}
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
