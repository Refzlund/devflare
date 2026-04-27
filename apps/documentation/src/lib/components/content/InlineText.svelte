<script lang="ts">
import { localizeHref } from '$lib/paraglide/runtime'
import Inline from '../code/Inline.svelte'
import { parseInlineText } from './inline'

const { text = '' }: { text?: string } = $props()

const segments = $derived(parseInlineText(text))

function isExternalHref(href: string): boolean {
	return /^[a-z]+:/i.test(href) || href.startsWith('//')
}

function resolveHref(href: string): string {
	return isExternalHref(href) ? href : localizeHref(href)
}
</script>

{#each segments as segment}
	{#if segment.kind === 'code'}
		<Inline text={segment.value}>{segment.value}</Inline>
	{:else if segment.kind === 'link'}
		<a
			href={resolveHref(segment.href)}
			target="_blank"
			rel="noopener noreferrer"
			class="docs-focus-ring docs-text-accent inline-flex items-baseline gap-1 rounded-sm font-medium underline underline-offset-4 transition"
		>
			<span>{segment.value}</span>
			<span
				aria-hidden="true"
				class="iconify fluent--open-16-regular size-3.5 shrink-0 translate-y-[0.12em]"
			></span>
			<span class="sr-only">(opens in a new tab)</span>
		</a>
	{:else}
		{segment.value}
	{/if}
{/each}
