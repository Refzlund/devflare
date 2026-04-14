<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime'
	import { portal } from '$lib/vendor/floating-runes'
	import {
		cancelHideIntellisense,
		intellisense,
		setIntellisenseTooltipHovered
	} from './controller'
	import type { IntellisenseEntry, IntellisenseKind, IntellisenseLink } from './types'

	const kindLabels: Record<IntellisenseKind, string> = {
		module: 'Module',
		config: 'Config',
		binding: 'Binding',
		runtime: 'Runtime',
		test: 'Testing',
		cli: 'CLI',
		flag: 'Flag',
		env: 'Env'
	}

	function resolveHref(link: IntellisenseLink): string {
		return link.external ? link.href : localizeHref(link.href)
	}

	function isCloudflareReference(link: IntellisenseLink): boolean {
		return link.citation === 'Cloudflare Docs' || link.href.includes('developers.cloudflare.com')
	}

	function getRequirementLabel(requirement: IntellisenseEntry['requirement']): string | undefined {
		switch (requirement) {
			case 'required':
				return 'Required'
			case 'contextual':
				return 'Contextual'
			default:
				return undefined
		}
	}
</script>

{#if intellisense.visible && intellisense.content}
	{@const requirementLabel = getRequirementLabel(intellisense.content.requirement)}
	{@const hasCloudflareReference = intellisense.content.references?.some((link) => isCloudflareReference(link)) ?? false}

	<div
		class="docs-intellisense-shell"
		role="presentation"
		use:intellisense.float
		use:portal
		onpointerenter={() => {
			setIntellisenseTooltipHovered(true)
			cancelHideIntellisense()
		}}
		onpointerleave={() => {
			setIntellisenseTooltipHovered(false)
		}}
	>
		<div class="docs-intellisense-panel" role="dialog" aria-label={`${intellisense.content.label} documentation`}>
			{#if hasCloudflareReference}
				<span
					aria-hidden="true"
					class="iconify-color logos--cloudflare-icon docs-intellisense-cloudflare-mark size-24"
				></span>
			{/if}

			<div class="docs-intellisense-content">
				<div class="docs-intellisense-head">
					<p class="docs-intellisense-kicker">{kindLabels[intellisense.content.kind]}</p>
					<h3 class="docs-intellisense-title">{intellisense.content.label}</h3>
				</div>

				<div class="docs-intellisense-copy">
					<p class="docs-intellisense-summary">{intellisense.content.summary}</p>

					{#if intellisense.content.detail}
						<p class="docs-intellisense-detail">{intellisense.content.detail}</p>
					{/if}
				</div>

				{#if requirementLabel || intellisense.content.defaultValue}
					<div class="docs-intellisense-facts" aria-label="Additional details">
						{#if requirementLabel}
							<span class="docs-intellisense-fact docs-intellisense-fact-emphasis">{requirementLabel}</span>
						{/if}

						{#if intellisense.content.defaultValue}
							<span class="docs-intellisense-fact">
								<span class="docs-intellisense-fact-label">Default</span>
								<span>{intellisense.content.defaultValue}</span>
							</span>
						{/if}
					</div>
				{/if}

				{#if intellisense.content.references?.length}
					<div class="docs-intellisense-links">
						{#each intellisense.content.references as link (link.href)}
							{@const cloudflareReference = isCloudflareReference(link)}

							<a
								href={resolveHref(link)}
								target={link.external ? '_blank' : undefined}
								rel={link.external ? 'noopener noreferrer' : undefined}
								aria-label={cloudflareReference ? link.label : undefined}
								class={`docs-intellisense-link docs-surface-transition ${cloudflareReference ? 'docs-intellisense-link-cloudflare' : ''}`}
							>
								{#if cloudflareReference}
									<span aria-hidden="true" class="iconify-color logos--cloudflare-icon docs-intellisense-link-icon size-4 shrink-0"></span>
									<span class="sr-only">{link.label}</span>
								{:else}
									<span class="docs-intellisense-link-label">{link.label}</span>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
