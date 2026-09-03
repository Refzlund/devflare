<script lang="ts">
import LinkCard from '$lib/components/cards/LinkCard.svelte'
import InlineText from '$lib/components/content/InlineText.svelte'
import SectionHeading from '$lib/components/content/SectionHeading.svelte'
import HomeNext from '$lib/components/home/HomeNext.svelte'
import MiniSnippet from '$lib/components/home/MiniSnippet.svelte'
import Surface from '$lib/components/layout/Surface.svelte'
import PillLink from '$lib/components/navigation/PillLink.svelte'
import { docPath } from '$lib/docs/content'
import { m } from '$lib/paraglide/messages'
import { localizeHref } from '$lib/paraglide/runtime'

const heroHighlights = [
	m.home_cta_highlight_no_framework(),
	m.home_cta_highlight_typed_env(),
	m.home_cta_highlight_real_flow()
]

const libraryFeatures = [
	{
		label: m.home_feature_config_label(),
		title: m.home_feature_config_title(),
		description: m.home_feature_config_description(),
		href: localizeHref(docPath('config-basics'))
	},
	{
		label: m.home_feature_bindings_label(),
		title: m.home_feature_bindings_title(),
		description: m.home_feature_bindings_description(),
		href: localizeHref(docPath('storage-bindings'))
	},
	{
		label: m.home_feature_testing_label(),
		title: m.home_feature_testing_title(),
		description: m.home_feature_testing_description(),
		href: localizeHref(docPath('testing-overview'))
	},
	{
		label: m.home_feature_previews_label(),
		title: m.home_feature_previews_title(),
		description: m.home_feature_previews_description(),
		href: localizeHref(docPath('preview-strategies'))
	},
	{
		label: m.home_feature_composition_label(),
		title: m.home_feature_composition_title(),
		description: m.home_feature_composition_description(),
		href: localizeHref(docPath('multi-workers'))
	},
	{
		label: m.home_feature_frameworks_label(),
		title: m.home_feature_frameworks_title(),
		description: m.home_feature_frameworks_description(),
		href: localizeHref(docPath('sveltekit-with-devflare'))
	}
]

const starterSnippet = {
	label: m.home_starter_snippet_label(),
	title: m.home_starter_snippet_title(),
	accent: 'cyan' as const,
	lines: ['bun add -d devflare', 'bunx --bun devflare types', 'bunx --bun devflare dev']
}

const firstWorkerHref = localizeHref(docPath('first-worker'))
const whyDevflareHref = localizeHref(docPath('what-devflare-is'))
</script>

<div class="space-y-12">
	<Surface as="header" padding="lg">
		<div class="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:items-start">
			<div class="space-y-6">
				<SectionHeading
					eyebrow={m.home_hero_eyebrow()}
					eyebrowTone="cyan"
					title={m.home_hero_title()}
					description={m.home_hero_description()}
					titleTag="h1"
					class="space-y-4"
					titleClass="docs-display docs-text-strong"
					descriptionClass="docs-copy-lg docs-text-body"
				/>

				<div class="flex flex-wrap gap-3">
					<PillLink href={firstWorkerHref} label={m.home_primary_cta()} variant="primary" />
				</div>

				<p class="docs-copy-sm docs-text-body max-w-2xl">
					<InlineText text={m.home_hero_support()} />
					<a
						href={whyDevflareHref}
						class="docs-focus-ring docs-surface-transition docs-text-accent ml-2 inline-flex items-center gap-1 rounded-md font-medium underline-offset-4 hover:underline"
					>
						{m.home_hero_support_link()}
					</a>
				</p>

				<div class="docs-copy-sm docs-text-body flex flex-wrap gap-x-5 gap-y-2">
					{#each heroHighlights as highlight}
						<span class="inline-flex items-center gap-2">
							<span class="docs-accent-dot h-1.5 w-1.5 rounded-full"></span>
							<InlineText text={highlight} />
						</span>
					{/each}
				</div>
			</div>

			<div class="space-y-4">
				<MiniSnippet {...starterSnippet} />
				<p class="docs-copy-sm docs-text-body">
					<InlineText text={m.home_starter_body()} />
				</p>
			</div>
		</div>
	</Surface>

	<section class="space-y-5">
		<SectionHeading
			eyebrow={m.home_library_eyebrow()}
			title={m.home_library_title()}
			description={m.home_library_description()}
		/>

		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each libraryFeatures as feature}
				<LinkCard
					href={feature.href}
					label={feature.label}
					title={feature.title}
					description={feature.description}
					tone="soft"
				/>
			{/each}
		</div>
	</section>

	<HomeNext />
</div>
