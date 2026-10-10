// =============================================================================
// Bundler Module — Rolldown-based DO bundling with watch mode
// =============================================================================
// Provides bundling for Durable Object files with chokidar-based file watching.
// On each change the bundler performs a FULL rebuild of all discovered DOs
// (debounced ~150ms with single-flight + one queued rebuild). This is not
// HMR — the DO worker is re-bundled and re-registered end-to-end. Incremental
// rebuilds are deferred as a larger architectural change.
// =============================================================================

export {
	bundleDOs,
	createDOBundler,
	type DOBundleResult,
	type DOBundler,
	type DOBundlerOptions
} from './do-bundler'
export {
	type AliasEntry,
	type AliasInput,
	mergeAliases,
	normalizeAliasEntries
} from './rolldown-shared'
export {
	bundleWorkerEntry,
	type WorkerBundlerOptions
} from './worker-bundler'
