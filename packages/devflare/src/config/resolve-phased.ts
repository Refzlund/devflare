// =============================================================================
// Phase-discriminated resolver (R1 step 1 - facade + branded phase types)
// =============================================================================
// This module exposes a single `resolveResources({ phase })` entry point that
// unifies the three lifecycle consumers documented in
// `tests/unit/config/resolver-contract.test.ts`:
//
//   * build   - preserves name-based KV/D1/Hyperdrive bindings (no network)
//   * local   - materializes name-based bindings into stable local identifiers
//   * deploy  - resolves or provisions concrete Cloudflare IDs
//
// Today this is a facade - it delegates to the existing helpers without
// changing behavior, so the resolver-contract regression gate stays green.
// Subsequent R1 steps collapse the duplicated internals and brand the return
// type per phase so that `compileConfig` can refuse an unresolved config at
// the type level.
//
// This is the canonical *resource-resolution* seam: every consumer that needs
// resolved resources (Vite serve/build, programmatic Vite, deploy provisioning,
// and the CLI config command) routes through `resolveResources`. The remaining
// direct callers of `resolveConfigForEnvironment`/`mergeConfigForEnvironment`
// are env-overlay-only (they read merged `.vite`, entry files, or preview
// metadata and never resolve resource IDs), and `compileBuildConfig`
// deliberately preserves name-based bindings for reproducible build artifacts.
// Those are by design, not bypasses; the `@internal`-annotated lower-level
// helpers are the seam's delegates.
//
// See `.local/refactors/R1-phase-discriminated-resolver.md` for the plan.
// =============================================================================

import {
	type PrepareMaterializedConfigResourcesForDeployOptions,
	prepareMaterializedConfigResourcesForDeploy
} from './deploy-resources'
import { type PreviewResolutionOptions, materializePreviewScopedConfig } from './preview'
import { mergeConfigForEnvironment } from './resolve'
import {
	type ResolveMaterializedConfigResourcesOptions,
	resolveConfigForLocalRuntime,
	resolveMaterializedConfigResources
} from './resource-resolution'
import type { DevflareConfig } from './schema'

declare const __phaseBrand: unique symbol

/**
 * `DevflareConfig` after the build-phase pipeline. KV/D1/Hyperdrive bindings
 * may still carry `{ name }`-only entries because the build artefact is
 * reproducible offline and resolves IDs at deploy.
 */
export type BuildConfig = DevflareConfig & { readonly [__phaseBrand]: 'build' }

/**
 * `DevflareConfig` after the local-phase pipeline. KV/D1/Hyperdrive bindings
 * have been materialized into stable local identifiers via
 * `getLocalXIdentifier()` helpers.
 */
export type LocalConfig = DevflareConfig & { readonly [__phaseBrand]: 'local' }

/**
 * `DevflareConfig` after the deploy-phase pipeline. KV/D1/Hyperdrive bindings
 * have been resolved (and optionally provisioned) against a live Cloudflare
 * account.
 */
export type DeployConfig = DevflareConfig & { readonly [__phaseBrand]: 'deploy' }

export type Phase = 'build' | 'local' | 'deploy'

/**
 * Configurations whose KV/D1/Hyperdrive bindings are guaranteed to carry an
 * `id` field (either a real Cloudflare resource ID or a stable local
 * identifier). `compileConfig()` requires this brand so that passing a raw
 * `DevflareConfig` is rejected at compile time rather than runtime.
 */
export type ResolvedConfig = LocalConfig | DeployConfig

/**
 * Cast helper used at the resolve-phase boundaries. The brand is a phantom
 * intersection so this is a zero-cost reinterpretation.
 */
export function brandAsLocalConfig(config: DevflareConfig): LocalConfig {
	return config as LocalConfig
}

/**
 * Cast helper used at the resolve-phase boundaries. The brand is a phantom
 * intersection so this is a zero-cost reinterpretation.
 */
export function brandAsDeployConfig(config: DevflareConfig): DeployConfig {
	return config as DeployConfig
}

export type PhaseConfig<P extends Phase> = P extends 'build'
	? BuildConfig
	: P extends 'local'
		? LocalConfig
		: P extends 'deploy'
			? DeployConfig
			: never

export interface ResolveResourcesCommonOptions {
	environment?: string
	preview?: PreviewResolutionOptions
}

export interface ResolveResourcesBuildOptions extends ResolveResourcesCommonOptions {
	phase: 'build'
}

export interface ResolveResourcesLocalOptions extends ResolveResourcesCommonOptions {
	phase: 'local'
}

export interface ResolveResourcesDeployOptions
	extends ResolveResourcesCommonOptions,
		ResolveMaterializedConfigResourcesOptions {
	phase: 'deploy'
	provision?: boolean
	preparation?: PrepareMaterializedConfigResourcesForDeployOptions
}

export type ResolveResourcesOptions =
	| ResolveResourcesBuildOptions
	| ResolveResourcesLocalOptions
	| ResolveResourcesDeployOptions

/**
 * Unified phase-discriminated resource resolver. Facade over the legacy
 * per-phase helpers; stamps the appropriate phase brand on the returned
 * config so callers can narrow at the type layer.
 */
export async function resolveResources<O extends ResolveResourcesOptions>(
	config: DevflareConfig,
	options: O
): Promise<PhaseConfig<O['phase']>> {
	const envMerged = mergeConfigForEnvironment(config, options.environment)
	// C2 prep: always materialize preview-scoped values so this seam is a strict
	// superset of the legacy per-phase entry points (`resolveConfigForEnvironment`,
	// `resolveConfigForLocalRuntime`, `resolveConfigResources`), which all
	// materialize preview unconditionally. Callers can still pass extra
	// `preview` resolution options (env / identifier overrides).
	const previewMerged = materializePreviewScopedConfig(envMerged, {
		environment: options.environment,
		...options.preview
	})

	switch (options.phase) {
		case 'build': {
			return previewMerged as PhaseConfig<O['phase']>
		}
		case 'local': {
			const resolved = resolveConfigForLocalRuntime(previewMerged, undefined)
			return resolved as PhaseConfig<O['phase']>
		}
		case 'deploy': {
			if (options.provision) {
				const prepared = await prepareMaterializedConfigResourcesForDeploy(
					previewMerged,
					options.preparation ?? {
						accountId: options.accountId,
						cloudflare: options.cloudflare
					}
				)
				return prepared.config as PhaseConfig<O['phase']>
			}
			const materialized = await resolveMaterializedConfigResources(previewMerged, {
				accountId: options.accountId,
				cloudflare: options.cloudflare
			})
			return materialized as PhaseConfig<O['phase']>
		}
	}
}
