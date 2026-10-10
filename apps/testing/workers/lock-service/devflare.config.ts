import { defineConfig } from '../../../../packages/devflare/src/config-entry'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

export default defineConfig({
	name: 'devflare-testing-shared-worker',
	compatibilityDate: '2026-04-08',
	accountId,
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		durableObjects: {
			CROSS_WORKER_LOCK: 'CrossWorkerLock'
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_classes: ['CrossWorkerLock']
		}
	]
})
