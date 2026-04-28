<script lang="ts">
	export interface SocialCardBlob {
		x: number
		y: number
		width: number
		height: number
		rotation: number
		opacity: number
		tone: 'orange' | 'amber'
	}

	let {
		title,
		description,
		logoDataUrl,
		npmLogoDataUrl,
		blobs
	}: {
		title: string
		description: string
		logoDataUrl: string
		npmLogoDataUrl: string
		blobs: readonly SocialCardBlob[]
	} = $props()

	function toBlobStyle(blob: SocialCardBlob): string {
		return [
			`left: ${blob.x}px`,
			`top: ${blob.y}px`,
			`width: ${blob.width}px`,
			`height: ${blob.height}px`,
			`transform: rotate(${blob.rotation}deg)`,
			`opacity: ${blob.opacity}`
		].join('; ')
	}
</script>

<svelte:head>
	<style>
		html,
		body {
			width: 1200px;
			height: 630px;
			margin: 0;
			overflow: hidden;
			background: #fff5e6;
		}

		* {
			box-sizing: border-box;
		}

		.social-card {
			position: relative;
			width: 1200px;
			height: 630px;
			overflow: hidden;
			color: #211711;
			font-family:
				Arial,
				Helvetica,
				sans-serif;
			background:
				radial-gradient(circle at 86% 18%, rgba(255, 80, 0, 0.18), transparent 48%),
				linear-gradient(135deg, #fff9ee 0%, #fff2dc 58%, #ffe1bf 100%);
		}

		.social-card-grid {
			position: absolute;
			inset: 0;
			background-image:
				linear-gradient(rgba(93, 53, 34, 0.08) 1px, transparent 1px),
				linear-gradient(90deg, rgba(93, 53, 34, 0.08) 1px, transparent 1px);
			background-size: 48px 48px;
		}

		.social-card-blobs {
			position: absolute;
			inset: 0;
			filter: blur(54px);
		}

		.social-card-blob {
			position: absolute;
			border-radius: 999px;
		}

		.social-card-blob-orange {
			background: radial-gradient(circle, rgba(255, 80, 0, 0.36), rgba(255, 80, 0, 0));
		}

		.social-card-blob-amber {
			background: radial-gradient(circle, rgba(255, 128, 22, 0.3), rgba(255, 128, 22, 0));
		}

		.social-card-logo {
			position: absolute;
			left: 92px;
			top: 64px;
			width: 236px;
			height: 106px;
			object-fit: contain;
			object-position: left center;
		}

		.social-card-badges {
			position: absolute;
			top: 64px;
			right: 90px;
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.social-card-badge {
			position: relative;
			display: inline-flex;
			height: 38px;
			align-items: center;
			gap: 10px;
			padding: 0 10px;
			overflow: hidden;
			border: 0;
			border-radius: 7px;
			background: rgba(255, 253, 248, 0.66);
			backdrop-filter: blur(22px);
			box-shadow: inset 0 0 0 1px rgba(255, 122, 26, 0.24);
			color: #241811;
			font-size: 18px;
			font-weight: 500;
			line-height: 1;
			white-space: nowrap;
		}

		.social-card-badge::after {
			position: absolute;
			top: -1px;
			right: -1px;
			width: 42px;
			height: 16px;
			border-top: 1px solid rgba(255, 255, 255, 0.74);
			border-right: 1px solid rgba(255, 255, 255, 0.58);
			border-top-right-radius: 7px;
			content: '';
			pointer-events: none;
		}

		.social-card-badge-icon {
			display: block;
			width: 18px;
			height: 18px;
			flex: 0 0 18px;
			object-fit: contain;
		}

		.social-card-badge svg {
			fill: currentColor;
		}

		.social-card-badge-npm {
			color: #cb3837;
		}

		.social-card-brand {
			position: absolute;
			left: 92px;
			top: 198px;
		}

		.social-card-eyebrow {
			color: #ff5000;
			font-size: 22px;
			font-weight: 900;
			letter-spacing: 3px;
			line-height: 1;
		}

		.social-card-subtitle {
			margin-top: 12px;
			color: #80624f;
			font-size: 19px;
			font-weight: 430;
			line-height: 1.2;
		}

		.social-card-separator {
			position: absolute;
			left: 92px;
			top: 292px;
			width: 116px;
			height: 4px;
			border-radius: 999px;
			background: linear-gradient(90deg, #f7bb0f, #ff5000);
		}

		.social-card-copy {
			position: absolute;
			left: 92px;
			top: 356px;
			width: 900px;
		}

		.social-card-copy h1 {
			display: -webkit-box;
			margin: 0;
			overflow: hidden;
			color: #211711;
			font-size: 58px;
			font-weight: 900;
			letter-spacing: 0;
			line-height: 1.1;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
		}

		.social-card-copy p {
			display: -webkit-box;
			margin: 18px 0 0;
			overflow: hidden;
			color: #5a4032;
			font-size: 25px;
			font-weight: 500;
			letter-spacing: 0;
			line-height: 1.42;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 3;
		}
	</style>
</svelte:head>

<div class="social-card">
	<div class="social-card-grid" aria-hidden="true"></div>
	<div class="social-card-blobs" aria-hidden="true">
		{#each blobs as blob}
			<div
				class={`social-card-blob social-card-blob-${blob.tone}`}
				style={toBlobStyle(blob)}
			></div>
		{/each}
	</div>

	<img class="social-card-logo" src={logoDataUrl} alt="" aria-hidden="true" />

	<div class="social-card-badges" aria-label="Devflare package links">
		<div class="social-card-badge social-card-badge-github">
			<svg class="social-card-badge-icon" viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.73.08-.72.08-.72 1.18.08 1.79 1.2 1.79 1.2 1.04 1.79 2.74 1.27 3.4.97.11-.76.41-1.27.74-1.57-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.19 1.19a11.1 11.1 0 0 1 5.81 0c2.21-1.5 3.18-1.19 3.18-1.19.64 1.59.24 2.77.12 3.06.74.81 1.18 1.85 1.18 3.11 0 4.43-2.69 5.4-5.26 5.69.42.36.79 1.08.79 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
				/>
			</svg>
			<span>Refzlund/devflare</span>
		</div>

		<div class="social-card-badge social-card-badge-npm">
			<img class="social-card-badge-icon" src={npmLogoDataUrl} alt="" aria-hidden="true" />
			<span>npmjs</span>
		</div>
	</div>

	<div class="social-card-brand">
		<div class="social-card-eyebrow">DEVFLARE DOCS</div>
		<div class="social-card-subtitle">Local-first toolkit for Cloudflare Workers.</div>
	</div>

	<div class="social-card-separator" aria-hidden="true"></div>

	<main class="social-card-copy">
		<h1>{title}</h1>
		<p>{description}</p>
	</main>
</div>
