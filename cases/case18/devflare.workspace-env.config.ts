// =============================================================================
// Case 18: a workspace Vite app whose config reads its environment
// =============================================================================
// Served by `devflare workspace dev` in
// packages/devflare/tests/integration/dev-server/workspace-vite-env.test.ts.
// `CASE18_CONFIG_SAW` records what this config read from `process.env` when the
// Vite child evaluated it, so the test can tell whether the manifest's `env`
// reached the child before the config ran. `CASE18_STRING_VAR` is one the
// manifest overrides. `CASE18_DESCRIPTOR_VAR` is declared with `env.NAME`, so
// the child has to resolve it as the coordinator does, not serve the descriptor.
// =============================================================================

import { defineConfig, env } from 'devflare/config'

export default defineConfig({
	name: 'case18-workspace-env',
	compatibilityDate: '2026-04-27',
	files: {
		fetch: false
	},
	vars: {
		CASE18_STRING_VAR: 'case18-var-value',
		CASE18_CONFIG_SAW: process.env.CASE18_WORKSPACE_ENV ?? 'absent when the config ran',
		CASE18_DESCRIPTOR_VAR: env.CASE18_COORDINATOR_ONLY
	},
	wrangler: {
		passthrough: {
			main: '.svelte-kit/cloudflare/_worker.js'
		}
	}
})
