// =============================================================================
// Build manifest (R2 — fixes C5, C8, C11)
// =============================================================================
// Persists a deterministic snapshot of the source config + devflare version
// + intended deployment target alongside the build artefact at
// `.devflare/build/manifest.json`. The deploy CLI uses this to:
//
//   - C5: detect when `devflare.config.ts` changed between `devflare build`
//     and `devflare deploy --build <path>`, so deploys against a stale
//     artefact warn instead of silently shipping new bindings against an
//     old code bundle.
//   - C8: detect when the artefact was built with a `--preview <scope>`
//     strategy but is being deployed without one (or vice versa), which
//     used to silently ship to production.
//   - C11: provide a devflare-version stamp so cross-version artefact
//     reuse is at least visible to the deploy preflight.
//
// The manifest is intentionally small and human-readable. It is NOT a
// security control - any local user with write access to `.devflare/build/`
// can edit it - but it is a strong correctness guard against accidental
// stale-artefact deploys.
// =============================================================================

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'pathe'
import type { DevflareConfig } from '../config'

export const BUILD_MANIFEST_VERSION = 1
export const BUILD_MANIFEST_FILENAME = 'manifest.json'

export interface BuildManifest {
	manifestVersion: typeof BUILD_MANIFEST_VERSION
	devflareVersion: string
	createdAt: string
	sourceConfigHash: string
	intendedTarget: {
		environment?: string
		preview: boolean
		previewScope?: string
		branchName?: string
	}
	bindingsSnapshot: {
		kv: string[]
		d1: string[]
		r2: string[]
		queues: string[]
		hyperdrive: string[]
		vectorize: string[]
		services: string[]
	}
}

export interface ManifestDriftReport {
	configChanged: boolean
	versionChanged: boolean
	targetChanged: boolean
	previousVersion: string
	currentVersion: string
	previousTarget: BuildManifest['intendedTarget']
	currentTarget: BuildManifest['intendedTarget']
	bindingsAdded: string[]
	bindingsRemoved: string[]
}

/**
 * Compute a stable hash of the source DevflareConfig. Used both at build
 * time (to stamp the manifest) and at deploy time (to detect drift).
 *
 * The hash deliberately ignores transient fields like `accountId` so that
 * setting CLOUDFLARE_ACCOUNT_ID between build and deploy doesn't trip drift.
 */
export function hashSourceConfig(config: DevflareConfig): string {
	const normalized = JSON.stringify(config, (key, value) => {
		// Skip account-id-ish fields that may legitimately differ per env.
		if (key === 'accountId') return undefined
		// Skip undefined/null sentinels for stable ordering.
		if (value === null || value === undefined) return undefined
		// `ref()` proxies expose throwing `name`/`config` getters when not
		// yet resolved. They show up here via worker/DO bindings whose
		// `__ref` back-pointer would otherwise recurse into the proxy.
		// Replace any ref proxy with a stable, serializable identifier so
		// the hash stays deterministic and never triggers resolution.
		if (key === '__ref' && value && typeof value === 'object') {
			const nameOverride = (value as { __nameOverride?: string }).__nameOverride
			return nameOverride ? `ref:${nameOverride}` : 'ref:<unresolved>'
		}
		return value
	})
	return createHash('sha256').update(normalized).digest('hex')
}

export function summarizeBindings(config: DevflareConfig): BuildManifest['bindingsSnapshot'] {
	const bindings = config.bindings ?? {}
	return {
		kv: Object.keys(bindings.kv ?? {}).sort(),
		d1: Object.keys(bindings.d1 ?? {}).sort(),
		r2: Object.keys(bindings.r2 ?? {}).sort(),
		queues: Object.keys(bindings.queues ?? {}).sort(),
		hyperdrive: Object.keys(bindings.hyperdrive ?? {}).sort(),
		vectorize: Object.keys(bindings.vectorize ?? {}).sort(),
		services: Object.keys(bindings.services ?? {}).sort()
	}
}

export interface CreateBuildManifestOptions {
	devflareVersion: string
	intendedTarget: BuildManifest['intendedTarget']
}

export function createBuildManifest(
	config: DevflareConfig,
	options: CreateBuildManifestOptions
): BuildManifest {
	return {
		manifestVersion: BUILD_MANIFEST_VERSION,
		devflareVersion: options.devflareVersion,
		createdAt: new Date().toISOString(),
		sourceConfigHash: hashSourceConfig(config),
		intendedTarget: options.intendedTarget,
		bindingsSnapshot: summarizeBindings(config)
	}
}

export async function writeBuildManifest(
	buildDir: string,
	manifest: BuildManifest
): Promise<string> {
	const manifestPath = resolve(buildDir, BUILD_MANIFEST_FILENAME)
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`, 'utf-8')
	return manifestPath
}

export async function readBuildManifest(buildDir: string): Promise<BuildManifest | null> {
	const manifestPath = resolve(buildDir, BUILD_MANIFEST_FILENAME)
	try {
		const raw = await readFile(manifestPath, 'utf-8')
		const parsed = JSON.parse(raw) as BuildManifest
		if (typeof parsed?.manifestVersion !== 'number') return null
		return parsed
	} catch {
		return null
	}
}

function targetsEqual(
	a: BuildManifest['intendedTarget'],
	b: BuildManifest['intendedTarget']
): boolean {
	return a.environment === b.environment
		&& a.preview === b.preview
		&& a.previewScope === b.previewScope
		&& a.branchName === b.branchName
}

export function compareManifests(
	previous: BuildManifest,
	current: BuildManifest
): ManifestDriftReport {
	const prevBindings = new Set(
		Object.entries(previous.bindingsSnapshot).flatMap(([k, v]) => v.map((n) => `${k}:${n}`))
	)
	const currBindings = new Set(
		Object.entries(current.bindingsSnapshot).flatMap(([k, v]) => v.map((n) => `${k}:${n}`))
	)
	const bindingsAdded = [...currBindings].filter((b) => !prevBindings.has(b))
	const bindingsRemoved = [...prevBindings].filter((b) => !currBindings.has(b))

	return {
		configChanged: previous.sourceConfigHash !== current.sourceConfigHash,
		versionChanged: previous.devflareVersion !== current.devflareVersion,
		targetChanged: !targetsEqual(previous.intendedTarget, current.intendedTarget),
		previousVersion: previous.devflareVersion,
		currentVersion: current.devflareVersion,
		previousTarget: previous.intendedTarget,
		currentTarget: current.intendedTarget,
		bindingsAdded,
		bindingsRemoved
	}
}

export function formatDriftWarning(drift: ManifestDriftReport): string | null {
	const lines: string[] = []
	if (drift.versionChanged) {
		lines.push(`devflare version differs (built with ${drift.previousVersion}, deploying with ${drift.currentVersion})`)
	}
	if (drift.targetChanged) {
		lines.push(
			`deployment target differs (built for ${formatTarget(drift.previousTarget)}, `
			+ `deploying as ${formatTarget(drift.currentTarget)})`
		)
	}
	if (drift.configChanged) {
		lines.push('source config changed since build (devflare.config.ts hash differs)')
	}
	if (drift.bindingsAdded.length > 0) {
		lines.push(`bindings added since build: ${drift.bindingsAdded.join(', ')}`)
	}
	if (drift.bindingsRemoved.length > 0) {
		lines.push(`bindings removed since build: ${drift.bindingsRemoved.join(', ')}`)
	}
	if (lines.length === 0) return null
	return [
		'Build artefact drift detected:',
		...lines.map((line) => `  - ${line}`),
		'Re-run `devflare build` to refresh the artefact, or pass --force to deploy anyway.'
	].join('\n')
}

function formatTarget(t: BuildManifest['intendedTarget']): string {
	const parts: string[] = []
	if (t.environment) parts.push(`env=${t.environment}`)
	parts.push(t.preview ? 'preview' : 'production')
	if (t.previewScope) parts.push(`scope=${t.previewScope}`)
	if (t.branchName) parts.push(`branch=${t.branchName}`)
	return parts.join(' ')
}
