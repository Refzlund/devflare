// =============================================================================
// defineWorkspace — multi-app dev coordinator manifest
// =============================================================================
// A workspace manifest lists several devflare apps that should run inside ONE
// Miniflare instance so they share LIVE binding state (D1/KV/R2/DO) in dev —
// exactly as they share one managed resource in production. Each app is still
// exposed on its own browser-reachable origin via a Miniflare direct socket, so
// the cross-origin split (e.g. `ui.localhost` ↔ `api.ui.localhost`) is kept.
//
// This is strictly opt-in: it powers `devflare workspace dev` and changes
// nothing about the per-app `devflare dev` path.
// =============================================================================

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'pathe'
import { z } from 'zod'

type C12LoadConfig = typeof import('c12')['loadConfig']

/**
 * Per-app entry in a workspace manifest.
 *
 * A pure worker app is reached directly on {@link WorkspaceApp.port}; a Vite app
 * is served by Vite on {@link WorkspaceApp.vitePort} and reaches its bindings
 * through the gateway bridge on {@link WorkspaceApp.bridgePort}.
 */
const workspaceAppSchema = z
	.object({
		/**
		 * Path to the app's `devflare.config.*`, relative to the manifest file
		 * (or absolute). The app's own config stays the single source of truth
		 * for its bindings/DOs/routes.
		 */
		config: z.string().min(1),
		/**
		 * Namespace used to prefix this app's worker names inside the shared
		 * instance. Defaults to the app config's `name`. Must be unique across
		 * the workspace.
		 */
		name: z.string().min(1).optional(),
		/**
		 * Browser-reachable direct-socket port for a pure-worker app. Required
		 * when `vite` is not set. This is the origin `portless`/the browser hits
		 * (e.g. `api.ui.localhost` → this port).
		 */
		port: z.number().int().positive().max(65535).optional(),
		/** Spawn a Vite child process for this app (SvelteKit etc.). */
		vite: z.boolean().optional(),
		/** Vite dev-server port for a Vite app (default 5173). */
		vitePort: z.number().int().positive().max(65535).optional(),
		/**
		 * Gateway direct-socket port for a Vite app: the app's SvelteKit bridge
		 * dials `ws://localhost:<bridgePort>` for its bindings, and locally
		 * presigned R2 URLs are minted against it. Required when `vite` is set.
		 */
		bridgePort: z.number().int().positive().max(65535).optional(),
		/**
		 * Extra vars injected into this app's workers (on top of the app
		 * config's `vars`). Handy for one-shot dev seed flags such as
		 * `{ DOC_API_DEV_SEED: '1' }`.
		 */
		env: z.record(z.string()).optional()
	})
	.strict()

const workspaceManifestSchema = z
	.object({
		/** The apps co-hosted in one Miniflare instance. At least one. */
		apps: z.array(workspaceAppSchema).min(1),
		/**
		 * Optional assertion of which binding names are intended to be shared.
		 * Sharing itself is automatic by binding id; this only turns a silent
		 * id-mismatch into a loud error at startup.
		 */
		shared: z
			.object({
				d1: z.array(z.string()).optional(),
				r2: z.array(z.string()).optional(),
				kv: z.array(z.string()).optional()
			})
			.strict()
			.optional(),
		/**
		 * One persist directory for the whole workspace (relative to the
		 * manifest dir, or absolute). Default `.devflare/workspace-data`. A
		 * single instance owns it, so there is no cross-process file contention.
		 */
		persist: z.string().min(1).optional(),
		/** Host the shared instance binds (entry + direct sockets). Default `127.0.0.1`. */
		host: z.string().min(1).optional(),
		/**
		 * Port for the shared instance's entry socket. Browsers use the per-app
		 * direct sockets, so this is only for stray top-level requests; default
		 * `0` (ephemeral) avoids clashing with anything.
		 */
		entryPort: z.number().int().nonnegative().max(65535).optional()
	})
	.strict()

/** Validated workspace manifest (output type, defaults applied by the coordinator). */
export type WorkspaceManifest = z.infer<typeof workspaceManifestSchema>
/** Author-facing manifest input (optional fields truly optional). */
export type WorkspaceManifestInput = z.input<typeof workspaceManifestSchema>
/** A single validated app entry. */
export type WorkspaceApp = z.infer<typeof workspaceAppSchema>

/**
 * Type-safe helper for defining a devflare workspace manifest. Mirrors
 * {@link defineConfig}: it only attaches types and returns the value unchanged.
 *
 * @param manifest - The workspace manifest.
 * @returns The same manifest, typed.
 *
 * @example
 * // devflare.workspace.ts (repo root)
 * export default defineWorkspace({
 *   apps: [
 *     { config: './apps/api/devflare.config.ts', port: 8789, env: { DOC_API_DEV_SEED: '1' } },
 *     { config: './apps/web/devflare.config.ts', vite: true, vitePort: 5173, bridgePort: 8788 }
 *   ],
 *   shared: { d1: ['PLATFORM_DB'], r2: ['MEDIA'] }
 * })
 */
export function defineWorkspace(manifest: WorkspaceManifestInput): WorkspaceManifestInput {
	return manifest
}

/** Manifest file names searched at the workspace root, in priority order. */
const WORKSPACE_MANIFEST_FILES = [
	'devflare.workspace.ts',
	'devflare.workspace.mts',
	'devflare.workspace.js',
	'devflare.workspace.mjs'
] as const

/**
 * The browser/direct-socket port a given app is reached on inside the shared
 * instance: `bridgePort` for a Vite app, `port` for a pure worker. Throws a
 * descriptive error when the required port is missing.
 *
 * @param app - A validated workspace app entry.
 * @param label - Human-readable app label for error messages.
 * @returns The direct-socket port for the app's gateway worker.
 * @throws When a Vite app omits `bridgePort` or a worker app omits `port`.
 */
export function resolveAppDirectSocketPort(app: WorkspaceApp, label: string): number {
	if (app.vite) {
		if (app.bridgePort === undefined) {
			throw new Error(`Workspace app "${label}" sets vite: true but is missing "bridgePort".`)
		}
		return app.bridgePort
	}
	if (app.port === undefined) {
		throw new Error(`Workspace app "${label}" is a pure worker but is missing "port".`)
	}
	return app.port
}

/** Result of loading a workspace manifest from disk. */
export interface LoadedWorkspaceManifest {
	/** The validated manifest. */
	manifest: WorkspaceManifest
	/** Absolute path to the manifest file. */
	manifestPath: string
	/** Directory containing the manifest — app config paths resolve against it. */
	manifestDir: string
}

/** Options for {@link loadWorkspaceManifest}. */
export interface LoadWorkspaceManifestOptions {
	/** Directory to search for the manifest (default: `process.cwd()`). */
	cwd?: string
	/** Explicit manifest file (name or path) overriding auto-discovery. */
	configFile?: string
}

/**
 * c12 resolves TypeScript/ESM manifests via jiti. Prefer the target project's
 * own `c12` install (mirrors {@link loadConfig}) so a monorepo that vendors
 * devflare per-app still transpiles the manifest; fall back to devflare's own.
 */
function resolveC12LoadConfig(cwd: string): C12LoadConfig {
	const requireFromCwd = createRequire(join(cwd, '__devflare_workspace__.cjs'))
	try {
		return (requireFromCwd('c12') as typeof import('c12')).loadConfig
	} catch {
		return (createRequire(import.meta.url)('c12') as typeof import('c12')).loadConfig
	}
}

/**
 * Load, transpile, and validate a workspace manifest.
 *
 * @param options - Search directory and optional explicit file.
 * @returns The validated manifest plus its resolved path/dir.
 * @throws {WorkspaceManifestNotFoundError} When no manifest file is found.
 * @throws {WorkspaceManifestValidationError} When the manifest fails schema validation.
 */
export async function loadWorkspaceManifest(
	options: LoadWorkspaceManifestOptions = {}
): Promise<LoadedWorkspaceManifest> {
	const cwd = resolve(options.cwd ?? process.cwd())
	const configFile = options.configFile ?? 'devflare.workspace'

	// c12 returns an empty object (not null) when nothing is found, so a missing
	// manifest would otherwise surface as a confusing "apps: Required" validation
	// error. Detect absence up front for a clear message.
	const explicitManifestPath = options.configFile ? resolve(cwd, options.configFile) : undefined
	const manifestExists =
		(explicitManifestPath !== undefined && existsSync(explicitManifestPath)) ||
		WORKSPACE_MANIFEST_FILES.some((name) => existsSync(join(cwd, name)))
	if (!manifestExists) {
		throw new WorkspaceManifestNotFoundError(cwd)
	}

	const c12LoadConfig = resolveC12LoadConfig(cwd)

	const { config, configFile: loadedFile } = await c12LoadConfig({
		name: 'devflare',
		cwd,
		configFile,
		rcFile: false,
		globalRc: false,
		dotenv: false
	})

	if (!config || !loadedFile) {
		throw new WorkspaceManifestNotFoundError(cwd)
	}

	const result = workspaceManifestSchema.safeParse(config)
	if (!result.success) {
		throw new WorkspaceManifestValidationError(result.error.issues, loadedFile)
	}

	return {
		manifest: result.data,
		manifestPath: loadedFile,
		manifestDir: dirname(loadedFile)
	}
}

/** Error thrown when no workspace manifest file is found. */
export class WorkspaceManifestNotFoundError extends Error {
	readonly code = 'WORKSPACE_MANIFEST_NOT_FOUND'

	constructor(public readonly cwd: string) {
		super(
			`No workspace manifest found in ${cwd}.\n` +
				`Expected one of: ${WORKSPACE_MANIFEST_FILES.join(', ')}\n` +
				`Create one that exports \`defineWorkspace({ apps: [...] })\`.`
		)
		this.name = 'WorkspaceManifestNotFoundError'
	}
}

/** Error thrown when a workspace manifest fails schema validation. */
export class WorkspaceManifestValidationError extends Error {
	readonly code = 'WORKSPACE_MANIFEST_VALIDATION_ERROR'

	constructor(
		public readonly issues: Array<{ path: (string | number)[]; message: string }>,
		public readonly manifestPath: string
	) {
		const issueMessages = issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
		super(`Invalid workspace manifest in ${manifestPath}:\n${issueMessages.join('\n')}`)
		this.name = 'WorkspaceManifestValidationError'
	}
}

/**
 * Assert that every binding name listed in `manifest.shared` resolves to the
 * SAME local identifier across the apps that declare it — otherwise the apps
 * would silently get SEPARATE stores. Sharing is by id, so a mismatch is a real
 * bug in the configs, surfaced here as a loud error rather than a subtle
 * "writes don't appear" symptom.
 *
 * @param assertions - The `shared` block from the manifest.
 * @param resolved - Per-app resolved identifiers: `{ appLabel, d1, r2, kv }`
 *   where each map is `bindingName -> localIdentifier` for that app.
 * @throws When a shared binding resolves to differing ids (or is absent everywhere).
 */
export function assertSharedBindingIds(
	assertions: NonNullable<WorkspaceManifest['shared']>,
	resolved: Array<{
		appLabel: string
		d1: Record<string, string>
		r2: Record<string, string>
		kv: Record<string, string>
	}>
): void {
	const kinds = ['d1', 'r2', 'kv'] as const
	for (const kind of kinds) {
		for (const bindingName of assertions[kind] ?? []) {
			const seen: Array<{ appLabel: string; id: string }> = []
			for (const app of resolved) {
				const id = app[kind][bindingName]
				if (id !== undefined) {
					seen.push({ appLabel: app.appLabel, id })
				}
			}

			if (seen.length === 0) {
				throw new Error(
					`Workspace "shared.${kind}" lists "${bindingName}", but no app declares that ${kind.toUpperCase()} binding.`
				)
			}

			const uniqueIds = new Set(seen.map((entry) => entry.id))
			if (uniqueIds.size > 1) {
				const detail = seen.map((entry) => `${entry.appLabel} → ${entry.id}`).join(', ')
				throw new Error(
					`Workspace "shared.${kind}" binding "${bindingName}" resolves to different ids across apps ` +
						`(${detail}); they would NOT share a store. Align the ${kind.toUpperCase()} id in the app configs.`
				)
			}
		}
	}
}
