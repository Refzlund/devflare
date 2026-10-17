<script lang="ts">
import { docPath } from '#lib/docs/content.js'
import type { DocCategory } from '#lib/docs/types.js'
import { m } from '#lib/paraglide/messages.js'
import { localizeHref } from '#lib/paraglide/runtime.js'
import InlineText from '../content/InlineText.svelte'
import LinkCard from './LinkCard.svelte'

let { category }: { category: DocCategory } = $props()
</script>

<section class="docs-border space-y-4 border-t pt-5">
	<div>
		<p class="docs-label docs-text-muted">{m.category_label()}</p>
		<h3 class="docs-title-md docs-text-strong mt-2"><InlineText text={category.title} /></h3>
	</div>
	<p class="docs-copy-sm docs-text-body mt-3"><InlineText text={category.description} /></p>

	<div class="mt-5 space-y-2.5">
		{#each category.items as doc}
			<LinkCard
				href={localizeHref(docPath(doc.slug))}
				title={doc.navTitle}
				variant="compact"
				tone="soft"
			/>
		{/each}
	</div>
</section>
