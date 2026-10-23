// =============================================================================
// Case 20: SvelteKit 3 — configured in the Vite config
// =============================================================================
// SvelteKit 3 refuses `svelte.config.js`; its options, the adapter included,
// are passed to `sveltekit()` here. The adapter reads the Wrangler config
// devflare generates into `.devflare/`.
// =============================================================================

import adapter from '@sveltejs/adapter-cloudflare'
import { sveltekit } from '@sveltejs/kit/vite'
import { devflarePlugin } from 'devflare/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		devflarePlugin(),
		sveltekit({
			adapter: adapter({
				config: '.devflare/wrangler.jsonc',
				platformProxy: {
					configPath: '.devflare/wrangler.jsonc'
				}
			})
		})
	]
})
