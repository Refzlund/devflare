<script module lang="ts">
	import { createSingleton, flip, offset, shift } from '$lib/vendor/floating-runes'

	export const tooltip = createSingleton<string>({
		placement: 'top',
		strategy: 'fixed',
		middleware: [
			offset(10),
			flip({ padding: 12 }),
			shift({ padding: 12 })
		],
		showDelay: 160,
		hideDelay: 0
	})
</script>

<script lang="ts">
	import { portal } from '$lib/vendor/floating-runes'
</script>

{#if tooltip.visible && tooltip.content !== undefined}
	<div class="docs-tooltip-shell" use:tooltip.float use:portal>
		<div class="docs-tooltip" role="tooltip">
			{tooltip.content}
		</div>
	</div>
{/if}