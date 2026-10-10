import { defineConfig } from '../../../../packages/devflare/src/config-entry'
import { resolveTestingWorkerNames } from '../../worker-names'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

export default defineConfig({
	name: resolveTestingWorkerNames().authServiceName,
	compatibilityDate: '2026-04-08',
	accountId,
	files: {
		fetch: 'src/worker.ts'
	}
})
