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
//
// The three `CASE18_DOTENV_*` vars read names that a second workspace app's
// `.env` sets too. The test writes that app, and this app's `.env.dev`, while it
// runs; every name is required, so this config resolves only under that test.
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
		CASE18_DESCRIPTOR_VAR: env.CASE18_COORDINATOR_ONLY,
		CASE18_DOTENV_SHARED_VAR: env.CASE18_DOTENV_SHARED,
		CASE18_DOTENV_PEER_ONLY_VAR: env.CASE18_DOTENV_PEER_ONLY,
		CASE18_DOTENV_MANIFEST_VAR: env.CASE18_DOTENV_MANIFEST
	},
	wrangler: {
		passthrough: {
			main: '.svelte-kit/cloudflare/_worker.js'
		}
	}
})
