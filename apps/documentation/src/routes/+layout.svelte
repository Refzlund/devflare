<script lang="ts">
	import { base } from '$app/paths'
	import { afterNavigate } from '$app/navigation'
	import { onMount } from 'svelte'
	import Tooltip from '$lib/components/layout/Tooltip.svelte'
	import IntellisenseTooltip from '$lib/intellisense/IntellisenseTooltip.svelte'
	import Sidebar from '$lib/components/navigation/Sidebar.svelte'
	import { m } from '$lib/paraglide/messages'
	import { localizeHref } from '$lib/paraglide/runtime'
	import './layout.css'

	type ThemeMode = 'light' | 'dark'

	const THEME_STORAGE_KEY = 'documentation-theme'
	const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)'
	const themeMetaColors: Record<ThemeMode, string> = {
		light: '#f5f3ef',
		dark: '#161616'
	}
	type ReadingViewportLink = {
		id: 'github' | 'npm'
		label: string
		href: string
		ariaLabel: string
		iconClass?: string
	}

	const readingViewportLinks: readonly ReadingViewportLink[] = [
		{
			id: 'github',
			label: 'Refzlund/devflare',
			href: 'https://github.com/Refzlund/devflare',
			ariaLabel: 'Open Refzlund/devflare on GitHub'
		},
		{
			id: 'npm',
			label: 'npm',
			href: 'https://www.npmjs.com/package/devflare',
			iconClass: 'logos--npm-icon',
			ariaLabel: 'Open Devflare on npm'
		}
	] as const

	const brandLogoPath = `${base}/devflare-fav.png`

	let { children } = $props()
	let sidebarOpen = $state(false)
	let theme = $state<ThemeMode>('light')

	function getStoredTheme(): ThemeMode | undefined {
		if (typeof window === 'undefined') {
			return undefined
		}

		const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
		if (storedTheme === 'light' || storedTheme === 'dark') {
			return storedTheme
		}

		return undefined
	}

	function getSystemTheme(): ThemeMode {
		if (typeof window === 'undefined') {
			return 'light'
		}

		return window.matchMedia(THEME_MEDIA_QUERY).matches ? 'dark' : 'light'
	}

	function getResolvedTheme(): ThemeMode {
		return getStoredTheme() ?? getSystemTheme()
	}

	function applyTheme(nextTheme: ThemeMode): void {
		theme = nextTheme

		if (typeof document === 'undefined') {
			return
		}

		document.documentElement.dataset.theme = nextTheme
		document.documentElement.style.colorScheme = nextTheme
		document
			.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
			?.setAttribute('content', themeMetaColors[nextTheme])
	}

	function setStoredTheme(nextTheme: ThemeMode): void {
		if (typeof window === 'undefined') {
			return
		}

		window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
	}

	function setTheme(nextTheme: ThemeMode): void {
		applyTheme(nextTheme)
		setStoredTheme(nextTheme)
	}

	function toggleTheme(): void {
		setTheme(theme === 'dark' ? 'light' : 'dark')
	}

	const themeSwitchLabel = $derived(theme === 'dark' ? m.theme_switch_to_light() : m.theme_switch_to_dark())

	onMount(() => {
		const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY)

		const handleThemePreferenceChange = (event: MediaQueryListEvent): void => {
			if (getStoredTheme()) {
				return
			}

			applyTheme(event.matches ? 'dark' : 'light')
		}

		const handleStorageChange = (event: StorageEvent): void => {
			if (event.key !== null && event.key !== THEME_STORAGE_KEY) {
				return
			}

			applyTheme(getResolvedTheme())
		}

		applyTheme(getResolvedTheme())
		mediaQuery.addEventListener('change', handleThemePreferenceChange)
		window.addEventListener('storage', handleStorageChange)

		return () => {
			mediaQuery.removeEventListener('change', handleThemePreferenceChange)
			window.removeEventListener('storage', handleStorageChange)
		}
	})

	afterNavigate(() => {
		sidebarOpen = false
	})
</script>

<svelte:head>
	<script>
		(() => {
			const themeStorageKey = 'documentation-theme'
			const storedTheme = localStorage.getItem(themeStorageKey)
			const theme = storedTheme === 'light' || storedTheme === 'dark'
				? storedTheme
				: window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'

			document.documentElement.dataset.theme = theme
			document.documentElement.style.colorScheme = theme
		})()
	</script>
	<link rel="icon" type="image/png" href={brandLogoPath} />
	<meta name="theme-color" content="#f5f3ef" />
</svelte:head>

{#if sidebarOpen}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-black/50 lg:hidden"
		onclick={() => { sidebarOpen = false }}
		aria-label={m.aria_close_navigation()}
	></button>
{/if}


<div class="docs-shell flex min-h-screen">
	<aside
		class="docs-sidebar-panel docs-surface-transition fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}"
	>
		<div class="docs-border flex h-14 shrink-0 items-center gap-2.5 border-b px-5">
			<img
				src={brandLogoPath}
				alt=""
				class="size-10 shrink-0 object-contain"
				decoding="async"
			/>
			<a href={localizeHref('/')} class="docs-text-strong text-[0.9rem] font-semibold tracking-tight">{m.site_title()}</a>
		</div>

		<div class="docs-border shrink-0 border-b px-5 py-4 lg:hidden">
			<div class="docs-reading-viewport-actions-mobile grid gap-2">
				{#each readingViewportLinks as link (link.href)}
					<a
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						class="docs-reading-viewport-action docs-reading-viewport-action-mobile docs-focus-ring docs-surface-transition inline-flex items-center gap-2 px-3 py-2 text-[0.82rem] font-semibold"
						aria-label={link.ariaLabel}
					>
						{#if link.id === 'github'}
							<svg
								aria-hidden="true"
								focusable="false"
								viewBox="0 0 24 24"
								class="docs-reading-viewport-action-icon docs-reading-viewport-action-icon-github size-4 shrink-0"
							>
								<path
									fill="currentColor"
									d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.73.08-.72.08-.72 1.18.08 1.79 1.2 1.79 1.2 1.04 1.79 2.74 1.27 3.4.97.11-.76.41-1.27.74-1.57-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.19 1.19a11.1 11.1 0 0 1 5.81 0c2.21-1.5 3.18-1.19 3.18-1.19.64 1.59.24 2.77.12 3.06.74.81 1.18 1.85 1.18 3.11 0 4.43-2.69 5.4-5.26 5.69.42.36.79 1.08.79 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
								></path>
							</svg>
						{:else}
							<span
								aria-hidden="true"
								class={`iconify-color ${link.iconClass} docs-reading-viewport-action-icon size-4 shrink-0`}
							></span>
						{/if}
						<span>{link.label}</span>
					</a>
				{/each}
			</div>
		</div>

		<div class="flex-1 overflow-y-auto pt-4">
			<Sidebar />
		</div>

		<div class="shrink-0 px-5 py-4">
			<div class="flex justify-end">
				<button
					type="button"
					class="docs-theme-switch docs-focus-ring"
					aria-label={themeSwitchLabel}
					role="switch"
					aria-checked={theme === 'dark'}
					onclick={() => {
						toggleTheme()
					}}
				>
					<span class="docs-theme-switch-track" aria-hidden="true">
						<span class="docs-theme-switch-icon docs-theme-switch-icon-light">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="4.2"></circle>
								<path d="M12 2.75v2.1"></path>
								<path d="M12 19.15v2.1"></path>
								<path d="M4.75 4.75l1.5 1.5"></path>
								<path d="M17.75 17.75l1.5 1.5"></path>
								<path d="M2.75 12h2.1"></path>
								<path d="M19.15 12h2.1"></path>
								<path d="M4.75 19.25l1.5-1.5"></path>
								<path d="M17.75 6.25l1.5-1.5"></path>
							</svg>
						</span>
						<span class="docs-theme-switch-icon docs-theme-switch-icon-dark">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
								<path d="M20.25 14.2A7.9 7.9 0 1 1 9.8 3.75a6.95 6.95 0 0 0 10.45 10.45Z"></path>
							</svg>
						</span>
						<span class="docs-theme-switch-thumb" data-theme={theme}>
							<span class="docs-theme-switch-thumb-icon" data-theme={theme}>
								{#if theme === 'dark'}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
										<path d="M20.25 14.2A7.9 7.9 0 1 1 9.8 3.75a6.95 6.95 0 0 0 10.45 10.45Z"></path>
									</svg>
								{:else}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
										<circle cx="12" cy="12" r="4.2"></circle>
										<path d="M12 2.75v2.1"></path>
										<path d="M12 19.15v2.1"></path>
										<path d="M4.75 4.75l1.5 1.5"></path>
										<path d="M17.75 17.75l1.5 1.5"></path>
										<path d="M2.75 12h2.1"></path>
										<path d="M19.15 12h2.1"></path>
										<path d="M4.75 19.25l1.5-1.5"></path>
										<path d="M17.75 6.25l1.5-1.5"></path>
									</svg>
								{/if}
							</span>
						</span>
					</span>
				</button>
			</div>
		</div>
	</aside>

	<div class="flex min-h-screen min-w-0 flex-1 flex-col">
		<header class="docs-mobile-header docs-backdrop-blur sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 lg:hidden">
			<button
				type="button"
				onclick={() => { sidebarOpen = !sidebarOpen }}
				class="docs-focus-ring docs-hover-soft docs-hover-text-strong docs-text-muted inline-flex h-8 w-8 items-center justify-center rounded-lg transition"
				aria-label={m.aria_toggle_navigation()}
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
				</svg>
			</button>
			<a href={localizeHref('/')} class="docs-text-strong inline-flex items-center gap-2 text-[0.9rem] font-semibold">
				<img
					src={brandLogoPath}
					alt=""
					class="h-6 w-6 shrink-0 object-contain"
					decoding="async"
				/>
				<span>{m.site_title()}</span>
			</a>
		</header>

		<main class="relative flex-1 px-6 py-8 lg:px-10 lg:py-10">
			<div class="docs-reading-viewport-actions docs-reading-viewport-actions-desktop hidden flex-wrap items-center gap-2 lg:flex">
				{#each readingViewportLinks as link (link.href)}
					<a
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						class="docs-reading-viewport-action docs-focus-ring docs-surface-transition inline-flex items-center gap-2 px-3 py-2 text-[0.82rem] font-semibold"
						aria-label={link.ariaLabel}
					>
						{#if link.id === 'github'}
							<svg
								aria-hidden="true"
								focusable="false"
								viewBox="0 0 24 24"
								class="docs-reading-viewport-action-icon docs-reading-viewport-action-icon-github size-4 shrink-0"
							>
								<path
									fill="currentColor"
									d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.73.08-.72.08-.72 1.18.08 1.79 1.2 1.79 1.2 1.04 1.79 2.74 1.27 3.4.97.11-.76.41-1.27.74-1.57-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.19 1.19a11.1 11.1 0 0 1 5.81 0c2.21-1.5 3.18-1.19 3.18-1.19.64 1.59.24 2.77.12 3.06.74.81 1.18 1.85 1.18 3.11 0 4.43-2.69 5.4-5.26 5.69.42.36.79 1.08.79 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
								></path>
							</svg>
						{:else}
							<span
								aria-hidden="true"
								class={`iconify-color ${link.iconClass} docs-reading-viewport-action-icon size-4 shrink-0`}
							></span>
						{/if}
						<span>{link.label}</span>
					</a>
				{/each}
			</div>

			<div class="mx-auto max-w-4xl">
				{@render children()}
			</div>
		</main>
	</div>

	<IntellisenseTooltip />
	<Tooltip />
</div>
