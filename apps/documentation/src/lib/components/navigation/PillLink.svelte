<script lang="ts">
import type { Snippet } from 'svelte'
import InlineText from '../content/InlineText.svelte'

type PillLinkVariant = 'chip' | 'nav' | 'primary' | 'secondary'

let {
	href,
	label = '',
	variant = 'chip',
	active = false,
	class: className = '',
	children
}: {
	href: string
	label?: string
	variant?: PillLinkVariant
	active?: boolean
	class?: string
	children?: Snippet
} = $props()

const variantClasses: Record<PillLinkVariant, string> = {
	primary:
		'docs-primary-button px-5 py-3 font-semibold',
	secondary:
		'docs-secondary-button px-5 py-3 font-semibold',
	nav:
		'docs-nav-link px-3 py-2 font-medium',
	chip:
		'docs-chip-button px-3 py-2 font-medium'
}

const activeClasses =
	'docs-nav-link-active px-3 py-2'
</script>

<a
	href={href}
	class={`docs-focus-ring docs-surface-transition inline-flex items-center justify-center rounded-full text-[0.95rem] leading-6 transition ${active ? activeClasses : variantClasses[variant]} ${className}`}
>
	{#if children}
		{@render children()}
	{:else}
		<InlineText text={label} />
	{/if}
</a>
