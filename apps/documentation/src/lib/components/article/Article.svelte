<script lang="ts">
import { docPath } from '$lib/docs/content'
import type { DocPage } from '$lib/docs/types'
import { m } from '$lib/paraglide/messages'
import { localizeHref } from '$lib/paraglide/runtime'
import { onMount, tick } from 'svelte'
import FeatureCard from '../cards/FeatureCard.svelte'
import LinkCard from '../cards/LinkCard.svelte'
import Block from '../code/Block.svelte'
import InlineText from '../content/InlineText.svelte'
import SectionHeading from '../content/SectionHeading.svelte'
import Surface from '../layout/Surface.svelte'
import { tooltip } from '../layout/Tooltip.svelte'
import BulletList from './BulletList.svelte'
import Callout from './Callout.svelte'
import FloatingToc from './FloatingToc.svelte'
import StepList from './StepList.svelte'

const {
	doc,
	previous,
	next
}: {
	doc: DocPage
	previous?: DocPage
	next?: DocPage
} = $props()

const pageTopId = 'page-top'

type TocItem = {
	id: string
	indexLabel: string
	title: string
}

let activeTocId = $state(pageTopId)
let hasMounted = false
let animationFrameId: number | undefined

const tocItems = $derived<TocItem[]>([
	{
		id: pageTopId,
		indexLabel: '00',
		title: doc.title
	},
	...doc.sections.map((section, index) => ({
		id: section.id,
		indexLabel: String(index + 1).padStart(2, '0'),
		title: section.title
	}))
])

function isExternalHref(href: string): boolean {
	return /^[a-z]+:/i.test(href) || href.startsWith('//')
}

function resolveHref(href: string): string {
	return isExternalHref(href) ? href : localizeHref(href)
}

function isTocItemActive(id: string): boolean {
	return activeTocId === id
}

function updateActiveToc(): void {
	const threshold = 152
	let currentId = pageTopId

	for (const item of tocItems) {
		const element = document.getElementById(item.id)

		if (!element) {
			continue
		}

		if (element.getBoundingClientRect().top <= threshold) {
			currentId = item.id
			continue
		}

		break
	}

	activeTocId = currentId
}

function scheduleActiveTocUpdate(): void {
	if (animationFrameId !== undefined) {
		return
	}

	animationFrameId = window.requestAnimationFrame(() => {
		animationFrameId = undefined
		updateActiveToc()
	})
}

onMount(() => {
	hasMounted = true

	const handleViewportChange = () => scheduleActiveTocUpdate()

	window.addEventListener('scroll', handleViewportChange, { passive: true })
	window.addEventListener('resize', handleViewportChange)

	void tick().then(() => updateActiveToc())

	return () => {
		if (animationFrameId !== undefined) {
			window.cancelAnimationFrame(animationFrameId)
		}

		window.removeEventListener('scroll', handleViewportChange)
		window.removeEventListener('resize', handleViewportChange)
	}
})

$effect(() => {
	doc.slug

	if (!hasMounted) {
		return
	}

	void tick().then(() => updateActiveToc())
})
</script>

<svelte:head>
	<title>{m.article_page_title({ title: doc.title })}</title>
	<meta name="description" content={doc.description} />
</svelte:head>


<article class="space-y-12">
	<div class="space-y-12">
	<Surface as="header" id={pageTopId} padding="lg" class="scroll-mt-24 space-y-7">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div class="space-y-3">
				<div class="docs-meta docs-text-muted flex flex-wrap items-center gap-3">
					<span><InlineText text={doc.eyebrow} /></span>
					<span class="docs-accent-dot h-1 w-1 rounded-full"></span>
					<span><InlineText text={doc.group} /></span>
				</div>
			</div>

			{#if doc.headerSupport || doc.headerCloudflareDocs}
				<div class="flex flex-wrap items-center gap-2">
					{#if doc.headerSupport}
						<button
							type="button"
							use:tooltip={doc.headerSupport.tooltip}
							aria-label={`Support: ${doc.headerSupport.label}. ${doc.headerSupport.tooltip}`}
							class="docs-border docs-surface-nav docs-text-accent inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-2 text-sm font-medium"
						>
							<InlineText text={doc.headerSupport.label} />
						</button>
					{/if}

					{#if doc.headerCloudflareDocs}
						<a
							href={resolveHref(doc.headerCloudflareDocs.href)}
							target="_blank"
							rel="noopener noreferrer"
							title={doc.headerCloudflareDocs.title}
							aria-label={`Open ${doc.headerCloudflareDocs.title}`}
							class="docs-focus-ring docs-border docs-hover-strong docs-surface-nav docs-text-strong inline-flex w-fit shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition"
						>
							<span>{doc.headerCloudflareDocs.label ?? 'Cloudflare Documentation'}</span>
							<span aria-hidden="true" class="iconify fluent--open-16-regular size-4 shrink-0"></span>
						</a>
					{/if}
				</div>
			{/if}
		</div>

		<div class="space-y-4">
			<h1 class="docs-title-xl docs-article-title docs-text-strong"><InlineText text={doc.title} /></h1>
			{#if doc.headerCloudflareDocs}
				<p class="docs-copy-sm docs-text-muted max-w-3xl">
					<InlineText text={doc.headerCloudflareDocs.summary} />
				</p>
			{/if}
			{#if !doc.summaryHidden}
				<p class="docs-copy-lg docs-text-strong"><InlineText text={doc.summary} /></p>
			{/if}
			{#if !doc.descriptionHidden}
				<p class="docs-copy docs-text-body"><InlineText text={doc.description} /></p>
			{/if}
		</div>

		<dl class="grid gap-5 md:grid-cols-3">
			{#each doc.facts as fact}
				<div class="docs-border space-y-2 border-l pl-4">
					<dt class="docs-label docs-text-muted"><InlineText text={fact.label} /></dt>
					<dd class="docs-copy-sm docs-text-strong mt-2"><InlineText text={fact.value} /></dd>
				</div>
			{/each}
		</dl>
	</Surface>

	{#each doc.sections as section, index}
		<section id={section.id} class={`scroll-mt-24 space-y-6 ${index === 0 ? '' : 'docs-border border-t pt-8'}`}>
			<SectionHeading
				title={section.title}
				label={section.label}
				labelTooltip={section.labelTooltip}
				description={section.description}
				class="space-y-3"
				titleClass="docs-title-md docs-text-strong"
				descriptionClass="docs-copy-sm docs-text-muted"
			/>

			{#if section.paragraphs}
				<div class="docs-prose docs-copy docs-text-body space-y-5">
					{#each section.paragraphs as paragraph}
						<p><InlineText text={paragraph} /></p>
					{/each}
				</div>
			{/if}

			{#if section.cards}
				<div class="grid gap-4 lg:grid-cols-2">
					{#each section.cards as card}
						{#if card.href}
							<LinkCard
								href={resolveHref(card.href)}
								label={card.label}
								labelTooltip={card.labelTooltip}
								meta={card.meta}
								title={card.title}
								description={card.body}
								variant="compact"
								tone="muted"
							/>
						{:else}
							<FeatureCard title={card.title} description={card.body} titleClass="docs-title-sm docs-text-strong" />
						{/if}
					{/each}
				</div>
			{/if}

			{#if section.bullets}
				<BulletList items={section.bullets} />
			{/if}

			{#if section.steps}
				<StepList items={section.steps} />
			{/if}

			{#if section.table}
				<div
					class={`docs-table-shell docs-surface-glass rounded-xl ${section.table.layout === 'wide' ? 'docs-table-shell-wide' : ''}`}
				>
					<div
						class="docs-table-scroll"
						role="region"
						aria-label={`${section.title} table`}
					>
						<table
							class={`docs-table docs-divide ${section.table.layout === 'wide' ? 'docs-table-wide' : ''}`}
						>
							<thead class="docs-table-head">
								<tr>
									{#each section.table.headers as header}
										<th class="docs-table-heading docs-label docs-text-muted px-4 py-3 text-left"><InlineText text={header} /></th>
									{/each}
								</tr>
							</thead>
							<tbody class="docs-divide">
								{#each section.table.rows as row}
									<tr>
										{#each row as cell}
											<td class="docs-table-cell docs-copy-sm docs-text-body px-4 py-4"><InlineText text={cell} /></td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			{#if section.callouts}
				<div class="space-y-4">
					{#each section.callouts as callout}
						<Callout {...callout} />
					{/each}
				</div>
			{/if}

			{#if section.snippets}
				<div class="space-y-4">
					{#each section.snippets as snippet}
						<Block {...snippet} />
					{/each}
				</div>
			{/if}
		</section>
	{/each}

	{#if !doc.articleNavigationHidden && (previous || next)}
		<section class="grid gap-4 md:grid-cols-2">
			{#if previous}
				<LinkCard
					href={localizeHref(docPath(previous.slug))}
					label={m.article_previous()}
					labelTone="slate"
					title={previous.navTitle}
					description={previous.summary}
				/>
			{/if}

			{#if next}
				<LinkCard
					href={localizeHref(docPath(next.slug))}
					label={m.article_next()}
					labelTone="slate"
					title={next.navTitle}
					description={next.summary}
					class={previous ? '' : 'md:col-start-2'}
				/>
			{/if}
		</section>
	{/if}
	</div>

	<FloatingToc items={tocItems} activeId={activeTocId} ariaLabel={m.article_on_this_page()} />
</article>
