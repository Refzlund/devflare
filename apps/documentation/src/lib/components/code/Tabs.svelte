<script lang="ts">
	import { tooltip } from '$lib/components/layout/Tooltip.svelte'
	import type { NormalizedCodeFile } from './block'

	let {
		files,
		activeFile,
		onSelect
	}: {
		files: NormalizedCodeFile[]
		activeFile: string
		onSelect: (path: string) => void
	} = $props()

	function preventMouseFocus(event: MouseEvent): void {
		event.preventDefault()
	}
</script>


<div class="docs-code-tabs" role="tablist" aria-label="Snippet files">
	{#each files as file}
		{@const active = file.path === activeFile}
		<button
			type="button"
			use:tooltip={file.displayPath ?? file.label}
			onmousedown={preventMouseFocus}
			onclick={() => {
				if (!active) {
					onSelect(file.path)
				}
			}}
			class={`docs-focus-ring docs-code-tab ${active ? 'docs-code-tab-active' : ''}`}
			role="tab"
			aria-disabled={active}
			aria-selected={active}
			tabindex={active ? 0 : -1}
		>
			<span aria-hidden="true" class={`iconify ${file.iconClass} docs-code-tab-icon size-4 shrink-0`}></span>
			<span class="truncate">{file.label}</span>
		</button>
	{/each}
</div>
