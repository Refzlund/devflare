<script lang="ts">
	import {
		PUBLIC_DOCUMENTATION_BUILD_SHA,
		PUBLIC_DOCUMENTATION_BUILD_TIME
	} from '$env/static/public'

	const documentationBuildTimeIso = PUBLIC_DOCUMENTATION_BUILD_TIME
	const documentationBuildTimeUtc = new Date(documentationBuildTimeIso).toUTCString()
	const documentationBuildSha = PUBLIC_DOCUMENTATION_BUILD_SHA

	const deployment = {
		stage: 'Production',
		codename: 'Evergreen',
		badge: 'Production build',
		description: 'This is the production deployment for the documentation app. It uses a separate evergreen palette and copy so you can compare it directly against both preview variants.',
		expectedUrl: 'https://devflare-docs.refz.workers.dev',
		footer: 'If this page is working, you should see a green-teal gradient, the Evergreen codename, a Production label, a build timestamp, and the current build revision.',
		accent: 'from-emerald-300 via-teal-400 to-cyan-500',
		panelClass: 'border-emerald-300/35 bg-emerald-400/10',
		badgeClass: 'border-emerald-200/30 bg-emerald-300/15 text-emerald-50',
		descriptionClass: 'text-emerald-50/85'
	} as const

	const markers = [
		'Traffic channel: production',
		'Color signature: evergreen + teal',
		'URL: devflare-docs.refz.workers.dev',
		'Build marker: visible timestamp + revision'
	] as const
</script>

<svelte:head>
	<title>{deployment.stage} · {deployment.codename} · Documentation</title>
</svelte:head>

<div class="min-h-screen bg-slate-950 px-6 py-16 text-white sm:px-10">
	<div class="mx-auto flex max-w-4xl flex-col gap-8">
		<section class={`overflow-hidden rounded-4xl border ${deployment.panelClass} shadow-2xl shadow-slate-950/60`}>
			<div class={`h-2 w-full bg-linear-to-r ${deployment.accent}`}></div>

			<div class="space-y-8 p-8 sm:p-10">
				<div class="flex flex-wrap items-center gap-3">
					<span class={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] ${deployment.badgeClass}`}>
						{deployment.badge}
					</span>
					<span class="text-sm text-white/45">Distinct deployment marker</span>
				</div>

				<div class="space-y-4">
					<p class="text-sm uppercase tracking-[0.35em] text-white/45">{deployment.stage}</p>
					<h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">{deployment.codename}</h1>
					<p class={`max-w-2xl text-lg leading-8 ${deployment.descriptionClass}`}>
						{deployment.description}
					</p>
				</div>

				<div class="grid gap-4 sm:grid-cols-3">
					{#each markers as marker}
						<div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/75">
							{marker}
						</div>
					{/each}
				</div>

				<div class="grid gap-4 sm:grid-cols-3">
					<div class="rounded-2xl border border-white/10 bg-black/25 p-5">
						<p class="text-xs uppercase tracking-[0.3em] text-white/45">Expected URL</p>
						<p class="mt-2 break-all font-mono text-sm text-white/80">{deployment.expectedUrl}</p>
					</div>

					<div class="rounded-2xl border border-white/10 bg-black/25 p-5">
						<p class="text-xs uppercase tracking-[0.3em] text-white/45">Build time (UTC)</p>
						<p class="mt-2 font-mono text-sm text-white/80">{documentationBuildTimeUtc}</p>
						<p class="mt-2 break-all font-mono text-xs text-white/45">{documentationBuildTimeIso}</p>
					</div>

					<div class="rounded-2xl border border-white/10 bg-black/25 p-5">
						<p class="text-xs uppercase tracking-[0.3em] text-white/45">Build revision</p>
						<p class="mt-2 break-all font-mono text-sm text-white/80">{documentationBuildSha}</p>
					</div>
				</div>

				<p class="text-sm text-white/55">{deployment.footer}</p>
			</div>
		</section>
	</div>
</div>
