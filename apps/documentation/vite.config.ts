import { paraglideVitePlugin } from '@inlang/paraglide-js'
import adapter from '@sveltejs/adapter-cloudflare'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { devflarePlugin } from '../../packages/devflare/src/vite/index'
import { documentationUrlPatterns } from './paraglide-routing'
import { generateLLMDocuments, shouldRegenerateLLMDocuments } from './scripts/llm-documents'

function llmDocumentsVitePlugin(): Plugin {
	let activeGeneration: Promise<void> | null = null
	let pendingGeneration = false

	const regenerate = async (reason: string): Promise<void> => {
		if (activeGeneration) {
			pendingGeneration = true
			await activeGeneration
			return
		}

		activeGeneration = (async () => {
			const result = await generateLLMDocuments()
			console.log(`[documentation:llm] generated ${result.outputFiles.join(', ')} (${reason})`)
		})()

		try {
			await activeGeneration
		} finally {
			activeGeneration = null
		}

		if (!pendingGeneration) {
			return
		}

		pendingGeneration = false
		await regenerate('pending source change')
	}

	return {
		name: 'documentation-llm-documents',
		async buildStart() {
			await regenerate('build start')
		},
		configureServer() {
			void regenerate('dev server start')
		},
		async handleHotUpdate(context) {
			if (!shouldRegenerateLLMDocuments(context.file)) {
				return
			}

			await regenerate(`hot update: ${context.file.replace(/\\/g, '/')}`)
		}
	}
}

export default defineConfig({
	plugins: [
		llmDocumentsVitePlugin(),
		devflarePlugin(),
		tailwindcss(),
		sveltekit({
			adapter: adapter({
				config: '.devflare/wrangler.jsonc',
				platformProxy: {
					configPath: '.devflare/wrangler.jsonc',
					persist: true
				}
			}),
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SvelteKit 3 no longer provides `$lib`; this keeps the app's imports as they were.
			alias: {
				$lib: 'src/lib'
			}
		}),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'baseLocale'],
			urlPatterns: documentationUrlPatterns
		})
	]
})
