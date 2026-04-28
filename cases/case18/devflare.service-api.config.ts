import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case18-service-api',
	compatibilityDate: '2026-04-27',
	files: {
		fetch: false,
		entrypoints: 'api/src/ep.*.ts'
	},
	vars: {
		API_PREFIX: 'case18-api'
	}
})
