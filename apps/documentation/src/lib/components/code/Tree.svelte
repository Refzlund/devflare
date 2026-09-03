<script lang="ts">
import { tooltip } from '$lib/components/layout/Tooltip.svelte'
import type { NormalizedCodeSnippet } from './block'

const {
	nodes,
	activeFile,
	onSelect
}: {
	nodes: NormalizedCodeSnippet['structure']
	activeFile: string
	onSelect: (path: string) => void
} = $props()

let openFolders = $state<Record<string, boolean>>({})

const folderPaths = $derived(
	nodes.filter((node) => node.kind === 'folder').map((node) => node.path)
)

const visibleNodes = $derived(
	nodes.filter((node) => {
		return getAncestorFolders(node.path).every((ancestor) => openFolders[ancestor] !== false)
	})
)

$effect(() => {
	const nextOpenFolders = { ...openFolders }
	let changed = false

	for (const path of folderPaths) {
		if (!(path in nextOpenFolders)) {
			nextOpenFolders[path] = true
			changed = true
		}
	}

	for (const path of Object.keys(nextOpenFolders)) {
		if (!folderPaths.includes(path)) {
			delete nextOpenFolders[path]
			changed = true
		}
	}

	for (const ancestor of getAncestorFolders(activeFile)) {
		if (nextOpenFolders[ancestor] === false) {
			nextOpenFolders[ancestor] = true
			changed = true
		}
	}

	if (changed) {
		openFolders = nextOpenFolders
	}
})

function getAncestorFolders(path: string): string[] {
	const segments = path.split('/').filter(Boolean)
	const ancestors: string[] = []
	let currentPath = ''

	for (const segment of segments.slice(0, -1)) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment
		ancestors.push(currentPath)
	}

	return ancestors
}

function isFolderOpen(path: string): boolean {
	return openFolders[path] !== false
}

function toggleFolder(path: string): void {
	openFolders = {
		...openFolders,
		[path]: !isFolderOpen(path)
	}
}

function preventMouseFocus(event: MouseEvent): void {
	event.preventDefault()
}
</script>

<aside class="docs-code-tree docs-code-panel-border border-b px-3 py-3 lg:border-r lg:border-b-0 lg:px-4">
	<p class="docs-code-tree-label px-2 pb-2 text-[0.72rem] font-semibold uppercase tracking-widest">Files</p>
	<div class="space-y-1">
		{#each visibleNodes as node (node.path)}
			{#if node.kind === 'folder'}
				<button
					type="button"
					onmousedown={preventMouseFocus}
					onclick={() => toggleFolder(node.path)}
					class={`docs-focus-ring docs-code-tree-item docs-code-tree-folder docs-code-tree-folder-toggle rounded-lg px-2 py-1.5 text-[0.82rem] ${node.muted ? 'docs-code-tree-item-muted' : ''}`}
					style={`--docs-code-depth:${node.depth}`}
				>
					<span aria-hidden="true" class="docs-code-tree-indent"></span>
					<span class="docs-code-tree-entry">
						<span aria-hidden="true" class="docs-code-tree-toggle-slot">
							<span
								class={`iconify docs-code-tree-chevron ${isFolderOpen(node.path) ? 'fluent--chevron-down-16-regular' : 'fluent--chevron-right-16-regular'}`}
							></span>
						</span>
						<span class="truncate">{node.name}</span>
					</span>
				</button>
			{:else if node.available}
				<button
					type="button"
					use:tooltip={node.path}
					onmousedown={preventMouseFocus}
					onclick={() => onSelect(node.path)}
					class={`docs-focus-ring docs-code-tree-item docs-code-tree-file docs-code-tree-file-button rounded-lg px-2 py-1.5 text-left text-[0.82rem] transition ${node.path === activeFile ? 'docs-code-tree-item-active' : ''} ${node.muted ? 'docs-code-tree-item-muted' : ''}`}
					style={`--docs-code-depth:${node.depth}`}
				>
					<span aria-hidden="true" class="docs-code-tree-indent"></span>
					<span class="docs-code-tree-entry">
						<span class={`iconify docs-code-tree-icon ${node.iconClass ?? 'material-icon-theme--document'}`}></span>
						<span class="truncate">{node.name}</span>
					</span>
				</button>
			{:else}
				<div
					class={`docs-code-tree-item docs-code-tree-file docs-code-tree-file-static rounded-lg px-2 py-1.5 text-[0.82rem] ${node.muted ? 'docs-code-tree-item-muted' : ''}`}
					style={`--docs-code-depth:${node.depth}`}
				>
					<span aria-hidden="true" class="docs-code-tree-indent"></span>
					<span class="docs-code-tree-entry">
						<span class={`iconify docs-code-tree-icon ${node.iconClass ?? 'material-icon-theme--document'}`}></span>
						<span class="truncate">{node.name}</span>
					</span>
				</div>
			{/if}
		{/each}
	</div>
</aside>
