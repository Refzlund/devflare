<script lang="ts">
	import { page } from '$app/state'
	import { docGroups, docPath } from '$lib/docs/content'
	import type { DocCategory, DocPage } from '$lib/docs/types'
	import { m } from '$lib/paraglide/messages'
	import { localizeHref } from '$lib/paraglide/runtime'

	function href(path: string): string {
		return localizeHref(path)
	}

	function isActive(path: string): boolean {
		return page.url.pathname === href(path)
	}

	function getSidebarItems(category: DocCategory): DocPage[] {
		return (category.sidebarItems ?? category.items).filter((item) => !item.sidebarHidden)
	}

	const linkBase = 'block rounded-md px-2.5 py-1.5 transition'
	const linkIdle = 'docs-nav-link'
	const linkOn = 'docs-nav-link-active font-medium'
</script>

<nav aria-label={m.nav_documentation_aria()} class="flex h-full flex-col text-[0.875rem] leading-6">
	<div class="space-y-0.5 px-3">
		<a href={href('/')} class="{linkBase} {isActive('/') ? linkOn : linkIdle}">{m.nav_home()}</a>
	</div>

	<div class="mt-5 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
		{#each docGroups as group}
			<section>
				<p class="docs-text-subtle px-2.5 text-[0.68rem] font-semibold uppercase tracking-widest">
					{group.title}
				</p>

				<div class="mt-2 space-y-0.5">
					{#each group.categories as category}
						{@const sidebarItems = getSidebarItems(category)}
						{#if sidebarItems.length === 0}
							<!-- Intentionally hidden from sidebar -->
						{:else if category.sidebarDisplay === 'links' || category.sidebarDisplay === 'standalone'}
							<ul class="space-y-0.5">
								{#each sidebarItems as item}
									<li>
										<a
											href={href(docPath(item.slug))}
											class="{linkBase} {isActive(docPath(item.slug)) ? linkOn : linkIdle}"
										>
											{item.navTitle}
										</a>
									</li>
								{/each}
							</ul>
						{:else}
							<details
								class="group/cat"
								open={sidebarItems.some((item) => isActive(docPath(item.slug)))}
							>
								<summary
									class="docs-hover-soft docs-hover-text-strong docs-surface-transition docs-text-body flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition select-none [&::-webkit-details-marker]:hidden"
								>
									<svg
										class="docs-text-subtle h-3 w-3 shrink-0 transition-transform group-open/cat:rotate-90"
										viewBox="0 0 16 16"
										fill="currentColor"
									>
										<path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" />
									</svg>
									{category.title}
								</summary>

								<ul class="docs-border ml-[0.95rem] mt-0.5 space-y-0.5 border-l pl-2">
									{#each sidebarItems as item}
										<li>
											<a
												href={href(docPath(item.slug))}
												class="{linkBase} {isActive(docPath(item.slug)) ? linkOn : linkIdle}"
											>
												{item.navTitle}
											</a>
										</li>
									{/each}
								</ul>
							</details>
						{/if}
					{/each}
				</div>
			</section>
		{/each}
	</div>
</nav>
