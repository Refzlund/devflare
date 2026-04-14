<script lang="ts">
import InlineText from '../content/InlineText.svelte'
import { m } from '$lib/paraglide/messages'

let {
	href,
	eyebrow,
	title,
	description,
	meta,
	highlights = [],
	class: className = ''
}: {
	href: string
	eyebrow?: string
	title: string
	description: string
	meta?: string
	highlights?: string[]
	class?: string
} = $props()
</script>

<a
	href={href}
	class={`docs-hover-strong docs-surface-panel docs-surface-transition group block overflow-hidden rounded-xl p-6 transition duration-200 ${className}`}
>
	<div>
		<div class="flex items-start justify-between gap-3">
			<div>
				<p class="docs-kicker docs-text-muted"><InlineText text={eyebrow ?? m.cta_default_eyebrow()} /></p>
			</div>
			{#if meta}
				<p class="docs-meta docs-text-accent"><InlineText text={meta} /></p>
			{/if}
		</div>

		<h2 class="docs-title-lg docs-measure-tight docs-text-strong mt-3">
			<InlineText text={title} />
		</h2>
		<p class="docs-copy docs-text-body mt-3">
			<InlineText text={description} />
		</p>

		{#if highlights.length > 0}
			<div class="docs-text-body mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[0.95rem] leading-7">
				{#each highlights as highlight}
					<span class="inline-flex items-center gap-2">
						<span class="docs-accent-dot h-1.5 w-1.5 rounded-full"></span>
						<InlineText text={highlight} />
					</span>
				{/each}
			</div>
		{/if}

		<div class="docs-meta docs-text-accent mt-5 inline-flex items-center gap-3 font-semibold">
			<span>
				{m.cta_open_guide()}
			</span>
			<span class="text-lg transition duration-200 group-hover:translate-x-1">
				→
			</span>
		</div>
	</div>
</a>
