<script lang="ts">
	import type { DocCallout, DocCalloutTone } from '$lib/docs/types'
	import { localizeHref } from '$lib/paraglide/runtime'
	import InlineText from '../content/InlineText.svelte'
	import PillLink from '../navigation/PillLink.svelte'

	let { tone = 'info', title, body, cta }: DocCallout = $props()

	function isExternalHref(href: string): boolean {
		return /^[a-z]+:/i.test(href) || href.startsWith('//')
	}

	function resolveHref(href: string): string {
		return isExternalHref(href) ? href : localizeHref(href)
	}

	const toneClasses: Record<DocCalloutTone, string> = {
		info: 'border border-(--docs-accent-soft-strong) bg-(--docs-accent-soft) text-(--docs-text-strong)',
		success: 'border border-emerald-500/20 bg-emerald-500/10 text-(--docs-text-strong)',
		warning: 'border border-amber-500/25 bg-amber-500/12 text-(--docs-text-strong)',
		accent: 'docs-surface-glass text-(--docs-text-strong)'
	}

	const barClasses: Record<DocCalloutTone, string> = {
		info: 'bg-(--docs-accent)',
		success: 'bg-emerald-300/80',
		warning: 'bg-amber-300/80',
		accent: 'bg-(--docs-text-subtle)'
	}

	const iconClasses: Record<DocCalloutTone, string> = {
		info: 'fluent--info-20-regular text-(--docs-accent)',
		success: 'fluent--checkmark-circle-20-regular text-emerald-300/90',
		warning: 'fluent--warning-20-regular text-amber-300/90',
		accent: 'fluent--lightbulb-20-regular text-(--docs-text-subtle)'
	}
</script>

<div class={`docs-surface-transition grid grid-cols-[0.35rem_minmax(0,1fr)] gap-4 rounded-lg px-4 py-4 ${toneClasses[tone]}`}>
	<span class={`rounded-full ${barClasses[tone]}`}></span>
	<div>
		<div class="docs-callout-header">
			<span aria-hidden="true" class={`iconify docs-callout-icon size-5 shrink-0 ${iconClasses[tone]}`}></span>
			<p class="docs-kicker opacity-85"><InlineText text={title} /></p>
		</div>
		<div class="docs-copy-sm mt-3 space-y-2 opacity-95">
			{#each body as paragraph}
				<p><InlineText text={paragraph} /></p>
			{/each}
		</div>
		{#if cta}
			<div class="docs-callout-cta mt-5">
				<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div class="min-w-0 space-y-1.5">
						<p class="docs-callout-cta-kicker">Next step</p>
						{#if cta.description}
							<p class="docs-callout-cta-copy max-w-2xl">
								<InlineText text={cta.description} />
							</p>
						{/if}
					</div>
					<PillLink
						href={resolveHref(cta.href)}
						label={cta.label}
						variant="primary"
						class="w-fit shrink-0"
					/>
				</div>
			</div>
		{/if}
	</div>
</div>
