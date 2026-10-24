// =============================================================================
// Gradual / percentage deployments — Wrangler versions-deploy orchestration
// =============================================================================
// A `devflare deploy --percentage <n>` rollout is expressed faithfully on
// Wrangler's gradual-deployment model:
//
//   1. `wrangler versions upload`  — uploads the new code as an inactive Worker
//      version (no traffic served yet). Devflare already runs this for preview
//      uploads; for a percentage rollout the production deploy uploads a version
//      too instead of going straight to 100%.
//   2. `wrangler versions deploy <new-version-id>@<n> [<other-version-id>@<rest>]
//      --yes` — splits live production traffic between the new version (`n%`) and
//      the currently-live version (`rest%`). With `--yes` Wrangler accepts the
//      non-interactive defaults so it can run in CI.
//
// This module owns only the pure argument construction + percentage parsing so
// it is trivially unit-testable; the deploy command wires the two wrangler runs
// and resolves the version ids around it.
// =============================================================================

export interface GradualDeploySpec {
	/** Worker version id receiving the rollout percentage. */
	versionId: string
	/** Percentage of production traffic to route to `versionId` (0–100). */
	percentage: number
	/**
	 * The currently-live version id that receives the remaining percentage. When
	 * omitted (or equal to `versionId`) the rollout deploys a single version and
	 * Wrangler distributes the remaining traffic itself.
	 */
	previousVersionId?: string
	/** Worker name (`--name`). */
	workerName: string
	/** Optional deployment message (`--message`). */
	message?: string
}

export interface ResolvedWranglerInvocation {
	command: string
	args: string[]
}

/**
 * Parse and validate the `--percentage` CLI option.
 *
 * Returns `undefined` when the flag is absent (a normal full deploy). Throws a
 * clear error when the value is present but not an integer in `[0, 100]` — the
 * same bounds Wrangler enforces — so a typo never silently becomes a full
 * deploy.
 */
export function parseDeployPercentage(value: string | boolean | undefined): number | undefined {
	if (value === undefined) {
		return undefined
	}

	if (value === true || value === false) {
		throw new Error('--percentage requires a value between 0 and 100, e.g. `--percentage 10`.')
	}

	const trimmed = value.trim()
	if (!/^\d+$/.test(trimmed)) {
		throw new Error(`--percentage must be a whole number between 0 and 100, received "${value}".`)
	}

	const parsed = Number.parseInt(trimmed, 10)
	if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
		throw new Error(`--percentage must be a whole number between 0 and 100, received "${value}".`)
	}

	return parsed
}

/**
 * Build the positional `<version-id>@<percentage>` version specs for a rollout.
 *
 * Wrangler's `versions deploy` consumes traffic splits as positional specs (see
 * `wrangler versions deploy --help`: "Shorthand notation to deploy Worker
 * Version(s) [<version-id>@<percentage>..]"). When a distinct previous version
 * id is provided, the remaining percentage is routed to it so the split is
 * fully specified and Wrangler never has to prompt; otherwise only the new
 * version is named and Wrangler distributes the rest.
 */
export function buildVersionSpecs(spec: GradualDeploySpec): string[] {
	const specs = [`${spec.versionId}@${spec.percentage}`]

	const remaining = 100 - spec.percentage
	if (spec.previousVersionId && spec.previousVersionId !== spec.versionId && remaining > 0) {
		specs.push(`${spec.previousVersionId}@${remaining}`)
	}

	return specs
}

/**
 * Build the full `wrangler versions deploy` invocation for a gradual rollout.
 *
 * `localWranglerExecutable` mirrors the deploy command's resolution: when a
 * local `wrangler/bin/wrangler.js` exists it is run under `node`; otherwise the
 * invocation falls back to `bunx wrangler …`.
 */
export function buildGradualDeployInvocation(
	spec: GradualDeploySpec,
	localWranglerExecutable: string | null
): ResolvedWranglerInvocation {
	const command = localWranglerExecutable ? 'node' : 'bunx'
	const args = localWranglerExecutable
		? [localWranglerExecutable, 'versions', 'deploy']
		: ['wrangler', 'versions', 'deploy']

	args.push(...buildVersionSpecs(spec))
	args.push('--name', spec.workerName)

	if (spec.message?.trim()) {
		args.push('--message', spec.message.trim())
	}

	// Accept the non-interactive defaults so the rollout works in CI without a
	// confirmation prompt (Wrangler: "--yes, -y  Automatically accept defaults
	// to prompts").
	args.push('--yes')

	return { command, args }
}
