import type { InputOptions } from 'rolldown'

/**
 * Shared baseline options for the workerd-targeted Rolldown config used by
 * both `worker-bundler` (main worker entry) and `do-bundler` (per-class
 * Durable Object entries).
 *
 * Each call site spreads this and overrides only the keys whose values are
 * legitimately different between the two surfaces:
 *  - `platform`: workers run as `'browser'`; per-class DO bundles use
 *    `'neutral'` so user-side imports of node-only helpers don't get the
 *    browser shim treatment.
 *  - `defaultTsconfigMode`: workers honor a user `tsconfig.json` when one
 *    exists (`'if-present'`); DO entries are virtual, so we always inject
 *    a default tsconfig (`'always'`).
 */
export interface WorkerdBundlerDefaults {
	platform: NonNullable<InputOptions['platform']>
	defaultTsconfigMode: 'always' | 'if-present'
	sourcemap: boolean
	minify: boolean
}

export function createWorkerdBundlerDefaults(): WorkerdBundlerDefaults {
	return {
		platform: 'browser',
		defaultTsconfigMode: 'if-present',
		sourcemap: false,
		minify: false
	}
}
