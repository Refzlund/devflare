import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case16-workflows',
	compatibilityDate: '2026-04-26',

	files: {
		// Workflow classes use wf.*.ts pattern (intentionally more restrictive than default)
		workflows: 'src/wf.*.ts',
		// Transport for custom type serialization
		transport: 'src/transport.ts'
	},

	bindings: {
		// KV for storing workflow state and results
		kv: {
			WORKFLOW_STATE: 'workflow-state-kv-id',
			RESULTS: 'results-kv-id'
		}
	},

	vars: {
		// Default retry configuration
		MAX_RETRIES: '3',
		RETRY_DELAY_MS: '1000'
	}
})
