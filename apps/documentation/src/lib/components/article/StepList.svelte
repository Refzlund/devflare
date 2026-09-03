<script lang="ts">
import InlineText from '../content/InlineText.svelte'

let {
	items,
	class: className = 'docs-divide',
	itemClass = 'py-4',
	textClass = 'docs-list docs-text-body'
}: {
	items: string[]
	class?: string
	itemClass?: string
	textClass?: string
} = $props()
</script>

<ol class={className}>
	{#each items as item, index}
		<li class={`docs-step-item grid items-start gap-4 sm:grid-cols-[2.25rem_minmax(0,1fr)] ${itemClass}`}>
			<div class="docs-step-index flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">{index + 1}</div>
			<p class={textClass}><InlineText text={item} /></p>
		</li>
	{/each}
</ol>
