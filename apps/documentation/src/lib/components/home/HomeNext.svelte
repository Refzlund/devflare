<script lang="ts">
import { docPath } from '$lib/docs/content'
import { workerOnlyRecipeFiles } from '$lib/docs/content/examples/shared'
import { localizeHref } from '$lib/paraglide/runtime'
import Block from '../code/Block.svelte'
import InlineText from '../content/InlineText.svelte'
import SectionHeading from '../content/SectionHeading.svelte'

const nextPaths = [
	{
		task: 'Create a Worker',
		first: { label: 'Your first worker', href: localizeHref(docPath('first-worker')) },
		followUp: { label: 'Your first unit test', href: localizeHref(docPath('first-unit-test')) }
	},
	{
		task: 'Add a route tree',
		first: { label: 'Your first route tree', href: localizeHref(docPath('first-route-tree')) },
		followUp: { label: 'HTTP routing', href: localizeHref(docPath('http-routing')) }
	},
	{
		task: 'Add a binding',
		first: { label: 'First bindings', href: localizeHref(docPath('first-bindings')) },
		followUp: { label: 'KV binding', href: localizeHref(docPath('bindings/kv')) }
	},
	{
		task: 'Write tests',
		first: { label: 'Your first unit test', href: localizeHref(docPath('first-unit-test')) },
		followUp: {
			label: 'Test helper reference',
			href: localizeHref(docPath('test-helper-reference'))
		}
	},
	{
		task: 'Deploy safely',
		first: { label: 'Deploy and preview', href: localizeHref(docPath('deploy-and-preview')) },
		followUp: {
			label: 'Deploy command recipes',
			href: localizeHref(docPath('deploy-command-recipes'))
		}
	},
	{
		task: 'Understand a boundary',
		first: { label: 'Feature index', href: localizeHref(docPath('feature-index')) },
		followUp: {
			label: 'Binding testing guides',
			href: localizeHref(docPath('binding-testing-guides'))
		}
	}
]

const routeTreeSnippet = {
	title: 'A route-tree path you can copy after the first worker runs',
	description:
		'One config, one request-wide handler, one route leaf, and one test that exercises the route through the worker.',
	activeFile: 'src/routes/notes/[id].ts',
	files: workerOnlyRecipeFiles
}
</script>

<section class="space-y-5">
	<SectionHeading
		title="Next: Do what matters"
		description="Pick the job in front of you, open the shortest working path, then follow the deeper reference only when you need it."
	/>

	<div class="docs-surface-glass overflow-hidden rounded-xl">
		<div class="overflow-x-auto">
			<table class="docs-divide min-w-full">
				<thead class="docs-table-head">
					<tr>
						<th class="docs-label docs-text-muted px-4 py-3 text-left">I need to...</th>
						<th class="docs-label docs-text-muted px-4 py-3 text-left">Open first</th>
						<th class="docs-label docs-text-muted px-4 py-3 text-left">Then open</th>
					</tr>
				</thead>
				<tbody class="docs-divide">
					{#each nextPaths as path}
						<tr>
							<td class="docs-copy-sm docs-text-body px-4 py-4"><InlineText text={path.task} /></td>
							<td class="docs-copy-sm docs-text-body px-4 py-4">
								<a href={path.first.href} class="docs-focus-ring docs-text-accent rounded-md font-medium underline-offset-4 hover:underline">
									{path.first.label}
								</a>
							</td>
							<td class="docs-copy-sm docs-text-body px-4 py-4">
								<a href={path.followUp.href} class="docs-focus-ring docs-text-accent rounded-md font-medium underline-offset-4 hover:underline">
									{path.followUp.label}
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<Block {...routeTreeSnippet} />
</section>
