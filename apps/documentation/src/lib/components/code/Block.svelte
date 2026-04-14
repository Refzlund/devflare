<script lang="ts">
	import { onDestroy } from 'svelte'
	import type { DocCodeFile, DocCodeSnippet, DocCodeTreeEntry } from '$lib/docs/types'
	import { getCopyCode, normalizeSnippet } from './block'
	import Pane from './Pane.svelte'
	import Tabs from './Tabs.svelte'
	import Tree from './Tree.svelte'

	let {
		title,
		description,
		language,
		code,
		filename,
		files,
		structure,
		activeFile: initialActiveFile
	}: DocCodeSnippet = $props()

	let normalized = $derived(
		normalizeSnippet({
			title,
			description,
			language,
			code,
			filename,
			files: files as DocCodeFile[] | undefined,
			structure: structure as DocCodeTreeEntry[] | undefined,
			activeFile: initialActiveFile
		})
	)
	let activePath = $state<string | undefined>(undefined)
	let copied = $state(false)
	let copyResetHandle: ReturnType<typeof setTimeout> | undefined
	let showStandaloneMeta = $derived(normalized.files.length === 1 && !normalized.hasStructure)

	$effect(() => {
		if (!activePath || !normalized.files.some((file) => file.path === activePath)) {
			activePath = normalized.activeFile
		}
	})

	let currentFile = $derived(
		normalized.files.find((file) => file.path === activePath) ?? normalized.files[0]
	)

	function selectFile(path: string): void {
		if (!normalized.files.some((file) => file.path === path)) {
			return
		}

		activePath = path
		copied = false
	}

	async function copyCode(): Promise<void> {
		if (typeof navigator === 'undefined' || !navigator.clipboard || !currentFile) {
			return
		}

		await navigator.clipboard.writeText(getCopyCode(currentFile))
		copied = true
		if (copyResetHandle) {
			clearTimeout(copyResetHandle)
		}
		copyResetHandle = setTimeout(() => {
			copied = false
		}, 1500)
	}

	onDestroy(() => {
		if (copyResetHandle) {
			clearTimeout(copyResetHandle)
		}
	})
</script>


<section class="docs-code-shell docs-surface-transition overflow-hidden rounded-xl">
	<header class={`docs-code-header ${normalized.files.length > 1 ? '' : 'docs-code-panel-border border-b'}`}>
		<div class="px-4 py-3.5 md:px-5 md:py-4">
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0 space-y-2.5">
					<p class="docs-title-sm docs-code-title min-w-0">{normalized.title}</p>

					{#if normalized.description}
						<p class="docs-code-description max-w-[62ch] text-[0.89rem] leading-6">{normalized.description}</p>
					{/if}
				</div>

				{#if showStandaloneMeta && currentFile}
					<div class="docs-code-kind shrink-0">
						<span aria-hidden="true" class={`iconify ${currentFile.metaIconClass} size-[1.15rem] shrink-0`}></span>
						<span class="sr-only">Code sample type: {currentFile.languageLabel}</span>
					</div>
				{/if}
			</div>
		</div>

		{#if normalized.files.length > 1}
			<div class="docs-code-panel-border border-t border-b">
				<Tabs files={normalized.files} activeFile={currentFile.path} onSelect={selectFile} />
			</div>
		{/if}
	</header>

	<div class={`grid min-w-0 ${normalized.hasStructure ? 'lg:grid-cols-[15rem_minmax(0,1fr)]' : ''}`}>
		{#if normalized.hasStructure}
			<Tree nodes={normalized.structure} activeFile={currentFile.path} onSelect={selectFile} />
		{/if}

		{#if currentFile}
			<Pane file={currentFile} files={normalized.files} copied={copied} onCopy={copyCode} />
		{/if}
	</div>
</section>
