<script lang="ts">
	import { onDestroy } from 'svelte'
	import { tooltip } from '$lib/components/layout/Tooltip.svelte'
	import type { Snippet } from 'svelte'

	const COPY_LABEL = 'Copy inline code'
	const COPIED_LABEL = 'Copied inline code'
	const COPIED_TOOLTIP = 'Copied!'

	let {
		children,
		text = '',
		class: className = ''
	}: {
		children?: Snippet
		text?: string
		class?: string
	} = $props()

	let copied = $state(false)
	let buttonElement = $state<HTMLButtonElement | undefined>(undefined)
	let copyResetHandle: ReturnType<typeof setTimeout> | undefined

	async function copyInlineCode(): Promise<void> {
		if (!text || typeof navigator === 'undefined' || !navigator.clipboard) {
			return
		}

		await navigator.clipboard.writeText(text)
		copied = true

		if (buttonElement) {
			tooltip.show(COPIED_TOOLTIP, buttonElement)
		}

		if (copyResetHandle) {
			clearTimeout(copyResetHandle)
		}

		copyResetHandle = setTimeout(() => {
			copied = false

			if (buttonElement && tooltip.anchor === buttonElement) {
				tooltip.hide()
			}
		}, 1500)
	}

	onDestroy(() => {
		if (copyResetHandle) {
			clearTimeout(copyResetHandle)
		}

		if (buttonElement && tooltip.anchor === buttonElement) {
			tooltip.hide()
		}
	})
</script>

<button
	bind:this={buttonElement}
	type="button"
	onclick={copyInlineCode}
	class={`docs-inline-code docs-inline-code-button docs-focus-ring ${copied ? 'docs-inline-code-copied' : ''} ${className}`.trim()}
	aria-label={`${copied ? COPIED_LABEL : COPY_LABEL}: ${text}`}
>
	<code class="docs-inline-code-content">
		{@render children?.()}
	</code>
</button>
