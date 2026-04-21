// =============================================================================
// Shared worker source extension lists
// =============================================================================
// Single source of truth for the file extensions Devflare treats as worker
// source modules. Used by:
// - transform/worker-entrypoint.ts (recognizing worker entry files + gating
//   TS-only emit)
// - worker-entry/surface-paths.ts (default-handler file lookup for
//   src/fetch, src/queue, src/scheduled, src/email)
// - worker-entry/routes.ts (file-route discovery globs)
// =============================================================================

/** Extensions accepted as worker source modules. */
export const SUPPORTED_WORKER_EXTENSIONS = [
	'.ts',
	'.tsx',
	'.mts',
	'.mjs',
	'.cts',
	'.cjs',
	'.js',
	'.jsx'
] as const

/** Subset of {@link SUPPORTED_WORKER_EXTENSIONS} that may host TypeScript-only syntax. */
export const TS_WORKER_EXTENSIONS = [
	'.ts',
	'.tsx',
	'.mts',
	'.cts'
] as const
