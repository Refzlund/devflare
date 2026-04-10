import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { devflarePlugin } from '../../packages/devflare/src/vite/index'
import { defineConfig } from 'vite'

process.env.PUBLIC_DOCUMENTATION_BUILD_TIME ??= new Date().toISOString()
process.env.PUBLIC_DOCUMENTATION_BUILD_SHA ??= process.env.GITHUB_SHA ?? 'local-dev'

export default defineConfig({
	plugins: [
		devflarePlugin(),
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' })
	]
})
