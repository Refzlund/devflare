import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { documentationUrlPatterns } from './paraglide-routing'
import { generateLLMDocuments, shouldRegenerateLLMDocuments } from './scripts/llm-documents'
import { devflarePlugin } from '../../packages/devflare/src/vite/index'
import { defineConfig, type Plugin } from 'vite'

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
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'baseLocale'],
			urlPatterns: documentationUrlPatterns
		})
	]
})
