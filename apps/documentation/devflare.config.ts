import { defineConfig } from '../../packages/devflare/src/config-entry'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

export default defineConfig({
	name: 'devflare-docs',
	compatibilityDate: '2026-04-08',
	previews: {
		includeCrons: false
	},
	accountId,
	vars: {
		BUILD_SHA: process.env.GITHUB_SHA ?? 'local-dev',
		BUILD_TIME: new Date().toISOString()
	}
})