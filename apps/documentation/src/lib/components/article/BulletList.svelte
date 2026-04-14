<script lang="ts">
import InlineText from '../content/InlineText.svelte'

let {
	items,
	class: className = 'docs-list space-y-3 docs-text-body',
	markerClass = 'docs-accent-dot docs-bullet-marker h-2 w-2 shrink-0 rounded-full',
	textClass = ''
}: {
	items: string[]
	class?: string
	markerClass?: string
	textClass?: string
} = $props()
</script>

<ul class={className}>
	{#each items as item}
		<li class="docs-bullet-item">
			<span class={markerClass}></span>
			<span class={`min-w-0 ${textClass}`.trim()}><InlineText text={item} /></span>
		</li>
	{/each}
</ul>
