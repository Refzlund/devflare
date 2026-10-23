<script lang="ts">
import InlineText from '../content/InlineText.svelte'

type HeadingTag = 'h2' | 'h3' | 'p'
type LabelTone = 'cyan' | 'slate'

let {
	label,
	title,
	description,
	labelTone = 'cyan',
	titleTag = 'h3',
	class: className = '',
	titleClass = 'docs-title-md docs-text-strong',
	descriptionClass = 'docs-copy-sm mt-3 docs-text-body'
}: {
	label?: string
	title: string
	description?: string
	labelTone?: LabelTone
	titleTag?: HeadingTag
	class?: string
	titleClass?: string
	descriptionClass?: string
} = $props()

const labelToneClasses: Record<LabelTone, string> = {
	cyan: 'docs-text-accent',
	slate: 'docs-text-muted'
}
</script>

<section class={`docs-border-strong space-y-2 border-l pl-4 ${className}`}>
	{#if label}
		<p class={`docs-label ${labelToneClasses[labelTone]}`}><InlineText text={label} /></p>
	{/if}
	<svelte:element this={titleTag} class={`${label ? 'mt-2 ' : ''}${titleClass}`}><InlineText text={title} /></svelte:element>
	{#if description}
		<p class={descriptionClass}><InlineText text={description} /></p>
	{/if}
</section>
