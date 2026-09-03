<script lang="ts">
import InlineText from '../content/InlineText.svelte'
import SectionHeading from '../content/SectionHeading.svelte'
import Surface from '../layout/Surface.svelte'
import MiniSnippet from './MiniSnippet.svelte'
import { m } from '$lib/paraglide/messages'

const outcomeCards = [
	{
		label: m.platform_typed_label(),
		title: m.platform_typed_title(),
		description: m.platform_typed_desc()
	},
	{
		label: m.platform_dev_label(),
		title: m.platform_dev_title(),
		description: m.platform_dev_desc()
	},
	{
		label: m.platform_ship_label(),
		title: m.platform_ship_title(),
		description: m.platform_ship_desc()
	}
]

const connectionLine = m.platform_connection_line()
</script>

<Surface>
	<div class="space-y-8">
		<div class="grid gap-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:items-start">
			<div class="space-y-5">
				<SectionHeading
					eyebrow={m.platform_eyebrow()}
					eyebrowTone="cyan"
					title={m.platform_title()}
					description={m.platform_description()}
					titleClass="docs-title-lg docs-text-strong"
					descriptionClass="docs-copy docs-text-body"
				/>

				<MiniSnippet
					label={m.platform_snippet_label()}
					title={m.platform_snippet_title()}
					accent="cyan"
					lines={[
						'src/fetch.ts',
						'devflare.config.ts',
						'bunx --bun devflare dev'
					]}
				/>

				<p class="docs-copy-sm docs-text-body">
					<span class="docs-text-strong font-semibold"><InlineText text={m.platform_readable_flow()} /></span> <InlineText text={connectionLine} />
				</p>
			</div>

			<div class="space-y-5">
				{#each outcomeCards as outcome}
					<section class="docs-border-strong space-y-2 border-l pl-4">
						<p class="docs-label docs-text-muted"><InlineText text={outcome.label} /></p>
						<h2 class="docs-title-md docs-text-strong mt-2"><InlineText text={outcome.title} /></h2>
						<p class="docs-copy-sm docs-text-body mt-2"><InlineText text={outcome.description} /></p>
					</section>
				{/each}
			</div>
		</div>
	</div>
</Surface>
