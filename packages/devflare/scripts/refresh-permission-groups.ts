// =============================================================================
// scripts/refresh-permission-groups.ts
// =============================================================================
// Maintainer-run script that fetches Cloudflare permission groups for an
// authenticated account and rewrites
// `src/cloudflare/known-permission-group-ids.generated.ts` so the symbolic
// Devflare permission-group names map to verified Cloudflare UUIDs instead
// of falling back to display-name matching.
//
// Run with:
//   bun run --cwd packages/devflare refresh-permission-groups
//
// Required environment variables:
//   CLOUDFLARE_API_TOKEN   — token with permission to read
//                            /accounts/:id/tokens/permission_groups
//   CLOUDFLARE_ACCOUNT_ID  — account id to query
//
// Optional environment variables:
//   DEVFLARE_PERMISSION_GROUP_OUTPUT
//                          — override output file path (defaults to the
//                            generated file inside src/cloudflare)
//   DEVFLARE_PERMISSION_GROUP_DRY_RUN=1
//                          — print the would-be content to stdout instead
//                            of writing to disk; useful for CI drift checks
//
// The script never throws away verified ids when an entry is missing from
// the API response: a missing entry stays `null` (or keeps its previous
// value if --keep-existing is passed), and a console warning surfaces the
// drift so it can be reviewed.
// =============================================================================

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listAccountTokenPermissionGroups } from '../src/cloudflare/tokens'
import { KNOWN_PERMISSION_GROUP_DISPLAY_NAMES } from '../src/cloudflare/tokens'
import { KNOWN_PERMISSION_GROUP_IDS_DATA } from '../src/cloudflare/known-permission-group-ids.generated'

interface RefreshOptions {
	accountId: string
	apiToken: string
	outputPath: string
	dryRun: boolean
	keepExisting: boolean
}

function readRequiredEnv(name: string): string {
	const value = process.env[name]
	if (!value || value.trim().length === 0) {
		throw new Error(
			`Missing required environment variable ${name}. `
			+ 'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID before running this script.'
		)
	}
	return value.trim()
}

function parseCliFlags(argv: readonly string[]): {
	dryRun: boolean
	keepExisting: boolean
	outputOverride?: string
} {
	let dryRun = process.env.DEVFLARE_PERMISSION_GROUP_DRY_RUN === '1'
	let keepExisting = false
	let outputOverride: string | undefined

	for (let index = 0;index < argv.length;index++) {
		const arg = argv[index]
		switch (arg) {
			case '--dry-run':
				dryRun = true
				break
			case '--keep-existing':
				keepExisting = true
				break
			case '--output': {
				const next = argv[index + 1]
				if (!next) {
					throw new Error('--output requires a path argument.')
				}
				outputOverride = next
				index++
				break
			}
			default:
				if (arg.startsWith('--')) {
					throw new Error(`Unknown flag ${arg}. Supported: --dry-run, --keep-existing, --output <path>.`)
				}
		}
	}

	return { dryRun, keepExisting, outputOverride }
}

function getDefaultOutputPath(): string {
	const scriptPath = fileURLToPath(import.meta.url)
	const scriptDir = dirname(scriptPath)
	return resolve(
		scriptDir,
		'..',
		'src',
		'cloudflare',
		'known-permission-group-ids.generated.ts'
	)
}

interface ResolvedPermissionEntry {
	symbolicName: keyof typeof KNOWN_PERMISSION_GROUP_DISPLAY_NAMES
	displayName: string
	previousId: string | null
	resolvedId: string | null
}

function resolveUpdatedEntries(
	apiPermissionGroups: ReadonlyArray<{ id: string; name: string }>,
	options: { keepExisting: boolean }
): ResolvedPermissionEntry[] {
	const idsByDisplayName = new Map<string, string>()
	for (const group of apiPermissionGroups) {
		// Cloudflare may return multiple permission groups with the same display
		// name across scopes. The first one wins, which matches how the existing
		// matcher behaves: the caller is expected to filter by scope before
		// reaching this lookup, and the symbolic Devflare names target
		// account-scoped groups.
		if (!idsByDisplayName.has(group.name)) {
			idsByDisplayName.set(group.name, group.id)
		}
	}

	const symbolicNames = Object.keys(
		KNOWN_PERMISSION_GROUP_DISPLAY_NAMES
	) as Array<keyof typeof KNOWN_PERMISSION_GROUP_DISPLAY_NAMES>

	return symbolicNames.map((symbolicName) => {
		const displayName = KNOWN_PERMISSION_GROUP_DISPLAY_NAMES[symbolicName]
		const previousId = KNOWN_PERMISSION_GROUP_IDS_DATA[symbolicName]
		const fetchedId = idsByDisplayName.get(displayName) ?? null
		const resolvedId = fetchedId ?? (options.keepExisting ? previousId : null)

		return {
			symbolicName,
			displayName,
			previousId,
			resolvedId
		}
	})
}

function renderGeneratedFile(entries: ResolvedPermissionEntry[]): string {
	const typeBody = entries.map((entry) => `\t${entry.symbolicName}: string | null`).join('\n')
	const dataBody = entries
		.map((entry) => {
			const value = entry.resolvedId === null ? 'null' : `'${entry.resolvedId.replace(/'/g, "\\'")}'`
			return `\t${entry.symbolicName}: ${value}`
		})
		.join(',\n')

	return `// =============================================================================
// AUTO-GENERATED FILE — Do not edit by hand.
//
// Regenerate with:
//   bun run --cwd packages/devflare refresh-permission-groups
//
// Source of truth:
//   GET /accounts/:id/tokens/permission_groups (Cloudflare API)
//
// Each entry maps a Devflare symbolic permission-group name to the
// authoritative Cloudflare permission-group UUID, or \`null\` when no
// verified UUID is known yet (in which case \`tokens.ts\` falls back to
// exact display-name matching with a console.warn).
// =============================================================================

export const KNOWN_PERMISSION_GROUP_IDS_DATA: {
${typeBody}
} = {
${dataBody}
}
`
}

function reportDrift(entries: ResolvedPermissionEntry[]): void {
	const newlyResolved = entries.filter((entry) => entry.previousId === null && entry.resolvedId !== null)
	const stillMissing = entries.filter((entry) => entry.resolvedId === null)
	const changed = entries.filter((entry) => entry.previousId !== null && entry.resolvedId !== null && entry.previousId !== entry.resolvedId)

	if (newlyResolved.length > 0) {
		console.log(`[refresh-permission-groups] Newly resolved (${newlyResolved.length}):`)
		for (const entry of newlyResolved) {
			console.log(`  + ${entry.symbolicName} → ${entry.resolvedId}`)
		}
	}

	if (changed.length > 0) {
		console.warn(`[refresh-permission-groups] UUID drift detected (${changed.length}):`)
		for (const entry of changed) {
			console.warn(`  ~ ${entry.symbolicName}: ${entry.previousId} → ${entry.resolvedId}`)
		}
	}

	if (stillMissing.length > 0) {
		console.warn(`[refresh-permission-groups] Still unverified after refresh (${stillMissing.length}):`)
		for (const entry of stillMissing) {
			console.warn(`  ? ${entry.symbolicName} (display name: '${entry.displayName}')`)
		}
	}

	if (newlyResolved.length === 0 && changed.length === 0 && stillMissing.length === 0) {
		console.log('[refresh-permission-groups] No changes; all entries already verified.')
	}
}

async function refreshPermissionGroups(options: RefreshOptions): Promise<void> {
	const apiPermissionGroups = await listAccountTokenPermissionGroups(options.accountId, {
		token: options.apiToken
	})

	const entries = resolveUpdatedEntries(apiPermissionGroups, {
		keepExisting: options.keepExisting
	})

	reportDrift(entries)

	const generatedSource = renderGeneratedFile(entries)

	if (options.dryRun) {
		console.log('[refresh-permission-groups] --dry-run; not writing to disk. Would write:')
		console.log('--- BEGIN GENERATED FILE ---')
		console.log(generatedSource)
		console.log('--- END GENERATED FILE ---')
		return
	}

	await writeFile(options.outputPath, generatedSource, 'utf-8')
	console.log(`[refresh-permission-groups] Wrote ${options.outputPath}`)
}

async function main(): Promise<void> {
	const cliFlags = parseCliFlags(process.argv.slice(2))
	const accountId = readRequiredEnv('CLOUDFLARE_ACCOUNT_ID')
	const apiToken = readRequiredEnv('CLOUDFLARE_API_TOKEN')
	const outputPath = cliFlags.outputOverride
		? resolve(process.cwd(), cliFlags.outputOverride)
		: process.env.DEVFLARE_PERMISSION_GROUP_OUTPUT
			? resolve(process.cwd(), process.env.DEVFLARE_PERMISSION_GROUP_OUTPUT)
			: getDefaultOutputPath()

	await refreshPermissionGroups({
		accountId,
		apiToken,
		outputPath,
		dryRun: cliFlags.dryRun,
		keepExisting: cliFlags.keepExisting
	})
}

// Only auto-run `main()` when this file is invoked as the CLI entrypoint
// (e.g. `bun run scripts/refresh-permission-groups.ts`). Importing the named
// exports from tests must NOT side-effect into `main()` — otherwise the
// missing CLOUDFLARE_* env vars would throw, set `process.exitCode = 1`, and
// poison the surrounding `bun test` run even though all assertions pass.
const isCliEntry = (() => {
	try {
		const argv1 = process.argv[1]
		if (!argv1) {
			return false
		}
		// Bun exposes `import.meta.path`; resolve both via realpath-ish equality.
		return import.meta.path === argv1 || import.meta.url === `file://${argv1}`
	} catch {
		return false
	}
})()

if (isCliEntry) {
	void main().catch((error) => {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`[refresh-permission-groups] Failed: ${message}`)
		process.exitCode = 1
	})
}

// Exported for unit testing without running the CLI entrypoint.
export { renderGeneratedFile, resolveUpdatedEntries }
