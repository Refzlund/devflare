<script lang="ts">
	import { tooltip } from '$lib/components/layout/Tooltip.svelte'
import InlineText from '../content/InlineText.svelte'
import Badge from './Badge.svelte'

type LinkCardVariant = 'compact' | 'default'
type HeadingTag = 'h2' | 'h3' | 'p'
type LabelTone = 'cyan' | 'slate'
type LinkCardTone = 'muted' | 'soft'

let {
	href,
	title,
	description,
	label,
	labelTooltip,
	meta,
	active = false,
	variant = 'default',
	tone,
	labelTone = 'cyan',
	titleTag = 'h3',
	class: className = ''
}: {
	href: string
	title: string
	description?: string
	label?: string
	labelTooltip?: string
	meta?: string
	active?: boolean
	variant?: LinkCardVariant
	tone?: LinkCardTone
	labelTone?: LabelTone
	titleTag?: HeadingTag
	class?: string
} = $props()

const variantClasses: Record<LinkCardVariant, string> = {
	default:
		'rounded-xl px-5 py-5',
	compact:
		'rounded-lg px-3 py-3'
}

const toneClasses: Record<LinkCardTone, string> = {
	soft: 'docs-hover-strong docs-surface-glass',
	muted: 'docs-hover-strong docs-surface-nav'
}

const labelToneClasses: Record<LabelTone, string> = {
	cyan: 'docs-text-accent',
	slate: 'docs-text-muted'
}

const activeClasses =
	'docs-active-card'

function getResolvedTone(
	selectedVariant: LinkCardVariant,
	selectedTone?: LinkCardTone
): LinkCardTone {
	return selectedTone ?? (selectedVariant === 'compact' ? 'muted' : 'soft')
}

function getTitleClass(selectedVariant: LinkCardVariant): string {
	if (selectedVariant === 'compact') {
		return active ? 'docs-title-sm docs-text-accent' : 'docs-title-sm docs-text-strong'
	}

	return active ? 'docs-title-md docs-text-accent' : 'docs-title-md docs-text-strong'
}

function getDescriptionClass(selectedVariant: LinkCardVariant): string {
	if (selectedVariant === 'compact') {
		return active
			? 'docs-copy-sm mt-2 docs-text-body'
			: 'docs-copy-sm mt-2 docs-text-muted'
	}

	return active ? 'docs-copy-sm mt-3 docs-text-body' : 'docs-copy-sm mt-3 docs-text-body'
}
</script>

<a href={href} class={`docs-focus-ring docs-surface-transition block transition duration-200 ${variantClasses[variant]} ${active ? activeClasses : toneClasses[getResolvedTone(variant, tone)]} ${className}`}>
	{#if label}
		<p class={`docs-label ${labelToneClasses[labelTone]}`}>
			{#if labelTooltip}
				<span use:tooltip={labelTooltip} class="inline-flex items-center">
					<InlineText text={label} />
				</span>
			{:else}
				<InlineText text={label} />
			{/if}
		</p>
	{/if}

	<div class={`flex items-center justify-between gap-3 ${label ? 'mt-2' : ''}`}>
		<svelte:element this={titleTag} class={getTitleClass(variant)}><InlineText text={title} /></svelte:element>
		{#if meta}
			<Badge label={meta} />
		{/if}
	</div>

	{#if description}
		<p class={getDescriptionClass(variant)}><InlineText text={description} /></p>
	{/if}
</a>
