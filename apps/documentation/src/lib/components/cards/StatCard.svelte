<script lang="ts">
let {
	label,
	value,
	description,
	class: className = '',
	valueClass = 'docs-title-md docs-text-strong mt-2',
	descriptionClass = 'docs-copy-sm docs-text-body mt-1'
}: {
	label: string
	value: string | number
	description?: string
	class?: string
	valueClass?: string
	descriptionClass?: string
} = $props()
</script>

<div class={`docs-border space-y-2 border-l pl-4 ${className}`}>
	<p class="docs-label docs-text-muted">{label}</p>
	<p class={valueClass}>{value}</p>
	{#if description}
		<p class={descriptionClass}>{description}</p>
	{/if}
</div>
