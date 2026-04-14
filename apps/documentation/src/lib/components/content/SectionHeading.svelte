<script lang="ts">
import type { Snippet } from 'svelte'
import InlineText from './InlineText.svelte'

type HeadingTag = 'h1' | 'h2' | 'h3'
type EyebrowTone = 'cyan' | 'slate'

let {
	eyebrow,
	title,
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
	<svelte:element this={titleTag} class={titleClass}><InlineText text={title} /></svelte:element>
	{#if description}
		<p class={descriptionClass}><InlineText text={description} /></p>
	{/if}
	{@render children?.()}
</div>
