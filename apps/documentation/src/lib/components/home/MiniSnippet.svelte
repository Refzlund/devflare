<script lang="ts">
import InlineText from '../content/InlineText.svelte'

type SnippetAccent = 'amber' | 'cyan' | 'violet'

let {
	label,
	title,
	lines,
	accent = 'cyan',
	class: className = ''
}: {
	label?: string
	title?: string
	lines: string[]
	accent?: SnippetAccent
	class?: string
} = $props()

const accentClasses: Record<SnippetAccent, string> = {
	cyan: 'docs-text-accent',
	violet: 'docs-text-muted',
	amber: 'docs-text-accent-hover'
}
</script>

<section
	class={`docs-surface-code docs-surface-transition overflow-hidden rounded-xl p-4 ${className}`}
>
	{#if label}
		<div class="flex items-center justify-between gap-3">
			<p class="docs-label docs-text-muted"><InlineText text={label} /></p>
		</div>
	{/if}

	{#if title}
		<p class="docs-title-sm docs-text-strong mt-3"><InlineText text={title} /></p>
	{/if}

	<div class="docs-text-body mt-3 space-y-2 overflow-x-auto font-mono text-[13px] leading-6 md:text-[13.5px]">
		{#each lines as line, index}
			<div class="grid min-w-max grid-cols-[auto_1fr] gap-3">
				<span class="docs-text-subtle select-none">{index + 1}</span>
				<span class={index === 0 ? accentClasses[accent] : 'docs-text-body'}>{line || ' '}</span>
			</div>
		{/each}
	</div>
</section>
