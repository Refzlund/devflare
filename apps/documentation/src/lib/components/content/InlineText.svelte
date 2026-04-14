<script lang="ts">
	import Inline from '../code/Inline.svelte'
	import { parseInlineText } from './inline'

	let { text = '' }: { text?: string } = $props()

	const segments = $derived(parseInlineText(text))
</script>

{#each segments as segment}
	{#if segment.kind === 'code'}
		<Inline text={segment.value}>{segment.value}</Inline>
	{:else}
		{segment.value}
	{/if}
{/each}
