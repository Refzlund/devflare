<script lang="ts">
import type { Snippet } from 'svelte'

type SurfaceElement = 'article' | 'aside' | 'div' | 'header' | 'nav' | 'section'
type SurfaceTone = 'glass' | 'nav' | 'panel'
type SurfacePadding = 'lg' | 'md' | 'none' | 'sm'

let {
	as = 'section',
	tone = 'panel',
	padding = 'md',
	id,
	ariaLabel,
	class: className = '',
	children
}: {
	as?: SurfaceElement
	tone?: SurfaceTone
	padding?: SurfacePadding
	id?: string
	ariaLabel?: string
	class?: string
	children?: Snippet
} = $props()

const toneClasses: Record<SurfaceTone, string> = {
	panel:
		'docs-surface-panel',
	glass:
		'docs-surface-glass',
	nav:
		'docs-surface-nav'
}

const paddingClasses: Record<SurfacePadding, string> = {
	none: '',
	sm: 'p-4 md:p-5',
	md: 'p-5 md:p-6',
	lg: 'p-6 md:p-7'
}
</script>

<svelte:element
	this={as}
	id={id}
	aria-label={ariaLabel}
	class={`docs-surface-transition rounded-xl ${toneClasses[tone]} ${paddingClasses[padding]} ${className}`}
>
	{@render children?.()}
</svelte:element>
