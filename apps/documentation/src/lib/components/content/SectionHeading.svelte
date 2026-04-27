<script lang="ts">
import type { Snippet } from 'svelte'
import { tooltip } from '../layout/Tooltip.svelte'
import InlineText from './InlineText.svelte'

type HeadingTag = 'h1' | 'h2' | 'h3'
type EyebrowTone = 'cyan' | 'slate'

let {
	eyebrow,
	title,
	label,
	labelTooltip,
	description,
	titleTag = 'h2',
	eyebrowTone = 'slate',
	class: className = 'space-y-3',
	titleClass = 'docs-title-lg docs-text-strong',
	descriptionClass = 'docs-copy docs-text-body',
	children
}: {
	eyebrow?: string
	title: string
	label?: string
	labelTooltip?: string
	description?: string
	titleTag?: HeadingTag
	eyebrowTone?: EyebrowTone
	class?: string
	titleClass?: string
	descriptionClass?: string
	children?: Snippet
} = $props()

const eyebrowToneClasses: Record<EyebrowTone, string> = {
	cyan: 'docs-text-accent',
	slate: 'docs-text-muted'
}
</script>

<div class={className}>
	{#if eyebrow}
		<p class={`docs-kicker ${eyebrowToneClasses[eyebrowTone]}`}><InlineText text={eyebrow} /></p>
	{/if}
	<div class="flex flex-wrap items-center gap-3">
		<svelte:element this={titleTag} class={titleClass}><InlineText text={title} /></svelte:element>
		{#if label}
			{#if labelTooltip}
				<button
					type="button"
					use:tooltip={labelTooltip}
					aria-label={`Support: ${label}. ${labelTooltip}`}
					class="docs-border docs-surface-nav docs-text-accent inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium"
				>
					<InlineText text={label} />
				</button>
			{:else}
				<span class="docs-border docs-surface-nav docs-text-accent inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium">
					<InlineText text={label} />
				</span>
			{/if}
		{/if}
	</div>
	{#if description}
		<p class={descriptionClass}><InlineText text={description} /></p>
	{/if}
	{@render children?.()}
</div>
