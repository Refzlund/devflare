// =============================================================================
// GET /api/workspace-env — what a workspace Vite app sees of its manifest `env`
// =============================================================================
// Read by packages/devflare/tests/integration/dev-server/workspace-vite-env.test.ts
// against devflare.workspace-env.config.ts. Each field answers one question; a
// missing value is reported as null rather than omitted, so the JSON always has
// the same shape.
// =============================================================================

import type { RequestHandler } from './$types'

/** The Vite child's own environment. This fixture's tsconfig carries no Node types. */
const childEnv =
	(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

export const GET: RequestHandler = async ({ platform }) => {
	const env = (platform?.env ?? {}) as Record<string, unknown>

	return Response.json({
		/** The manifest value, in the Vite child's process environment. */
		processEnv: childEnv.CASE18_WORKSPACE_ENV ?? null,
		/** A value only the coordinator's own environment holds. */
		inherited: childEnv.CASE18_COORDINATOR_ONLY ?? null,
		/** A name both `.env` files set, as the Vite child's process environment holds it. */
		processEnvDotenvShared: childEnv.CASE18_DOTENV_SHARED ?? null,
		/** What the config read from `process.env` when the child evaluated it. */
		configSaw: env.CASE18_CONFIG_SAW ?? null,
		/** A manifest key the config's `vars` never mention, in `platform.env`. */
		manifestOnly: env.CASE18_WORKSPACE_ENV ?? null,
		/** A config var the manifest overrides, in `platform.env`. */
		overridden: env.CASE18_STRING_VAR ?? null,
		/** A config var declared with `env.NAME`, in `platform.env`. */
		descriptor: env.CASE18_DESCRIPTOR_VAR ?? null,
		/** `env.NAME`, where both this app's `.env.dev` and another app's `.env` set NAME. */
		dotenvShared: env.CASE18_DOTENV_SHARED_VAR ?? null,
		/** `env.NAME`, where only another app's `.env` sets NAME. */
		dotenvPeerOnly: env.CASE18_DOTENV_PEER_ONLY_VAR ?? null,
		/** `env.NAME`, where both `.env` files and this app's manifest `env` set NAME. */
		dotenvManifest: env.CASE18_DOTENV_MANIFEST_VAR ?? null
	})
}
