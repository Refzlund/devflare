import { resolve } from 'pathe'
import { resolveConfigForEnvironment } from '../resolve'
import { type DevflareConfig, normalizeDOBinding } from '../schema'
import {
	getWranglerBrowserBinding,
	getWranglerD1DatabaseBinding,
	getWranglerKVNamespaceBinding
} from './bindings'
import { compileModuleOptions, compileWranglerMigrations } from './core-helpers'
import type { WranglerConfig } from './types'

/**
 * Derive a deterministic worker name from a Durable Object class name.
 * Converts PascalCase/camelCase to kebab-case so it is safe to use as a
 * Wrangler worker name.
 */
function kebabCaseClassName(className: string): string {
	return className
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase()
}

/**
 * Filter a migration entry down to the subset that applies to the given
 * Durable Object class. Returns null when nothing in the migration references
 * the class (so that worker does not need that migration tag).
 */
function filterMigrationForClass(
	migration: NonNullable<DevflareConfig['migrations']>[number],
	className: string
): NonNullable<DevflareConfig['migrations']>[number] | null {
	const newClasses = migration.new_classes?.filter((name) => name === className)
	const newSqliteClasses = migration.new_sqlite_classes?.filter((name) => name === className)
	const deletedClasses = migration.deleted_classes?.filter((name) => name === className)
	const renamedClasses = migration.renamed_classes?.filter(
		(entry) => entry.to === className || entry.from === className
	)

	const hasAny = Boolean(
		(newClasses && newClasses.length > 0) ||
			(newSqliteClasses && newSqliteClasses.length > 0) ||
			(deletedClasses && deletedClasses.length > 0) ||
			(renamedClasses && renamedClasses.length > 0)
	)

	if (!hasAny) {
		return null
	}

	return {
		tag: migration.tag,
		...(newClasses && newClasses.length > 0 && { new_classes: newClasses }),
		...(newSqliteClasses &&
			newSqliteClasses.length > 0 && { new_sqlite_classes: newSqliteClasses }),
		...(deletedClasses && deletedClasses.length > 0 && { deleted_classes: deletedClasses }),
		...(renamedClasses && renamedClasses.length > 0 && { renamed_classes: renamedClasses })
	}
}

/**
 * Compile DO Worker configs from DevflareConfig.
 *
 * Each distinct Durable Object class is emitted as its own compiled worker
 * entry. The worker name is derived from the class being compiled (or from
 * an explicit `scriptName` on a binding for that class), never from the
 * first binding encountered.
 *
 * **Public-API only.** This helper is exported for downstream tooling that
 * orchestrates multi-worker DO topologies on top of devflare. The internal
 * `devflare build` / `devflare deploy` pipeline does **not** call this —
 * it emits a single Wrangler config and relies on `wrangler` to handle DO
 * placement. C9 in `REMAINING.md` tracks this caveat: nothing inside the
 * package exercises this function, so behaviour for current consumers is
 * defined by the (small) test surface rather than by the build/deploy
 * happy path. Pass `preserveNamedBindings: true` if you want the same
 * build-time name preservation that `compileBuildConfig()` uses.
 *
 * @param config - The devflare configuration
 * @param doWorkerEntry - Path to the DO worker entry file (e.g., 'src/workers/do-worker.ts')
 * @param options - Additional options
 * @param options.absoluteMain - If true, resolve main to absolute path using cwd
 * @param options.cwd - Working directory for resolving absolute paths
 * @returns Array of Wrangler configs — one per DO class. Empty when no DOs configured.
 */
export function compileDOWorkerConfig(
	config: DevflareConfig,
	doWorkerEntry: string,
	options?: {
		absoluteMain?: boolean
		cwd?: string
		environment?: string
		preserveNamedBindings?: boolean
	}
): WranglerConfig[] {
	const resolvedConfig = resolveConfigForEnvironment(config, options?.environment)

	const doBindings = resolvedConfig.bindings?.durableObjects
	if (!doBindings || Object.keys(doBindings).length === 0) {
		return []
	}

	// Group bindings by class name. Multiple bindings may point to the same
	// class; they are hosted by a single worker dedicated to that class.
	const bindingsByClass = new Map<
		string,
		Array<{ bindingName: string; normalized: ReturnType<typeof normalizeDOBinding> }>
	>()
	for (const [bindingName, doConfig] of Object.entries(doBindings)) {
		const normalized = normalizeDOBinding(doConfig)
		const group = bindingsByClass.get(normalized.className) ?? []
		group.push({ bindingName, normalized })
		bindingsByClass.set(normalized.className, group)
	}

	// Resolve main path (absolute if needed for wrangler pages dev)
	let mainPath = doWorkerEntry
	if (options?.absoluteMain && options.cwd) {
		mainPath = resolve(options.cwd, doWorkerEntry)
	}

	const results: WranglerConfig[] = []

	for (const [className, entries] of bindingsByClass) {
		const explicitScriptName = entries.find((entry) => entry.normalized.scriptName)?.normalized
			.scriptName
		const workerName =
			explicitScriptName ?? `${resolvedConfig.name}-${kebabCaseClassName(className)}`

		const result: WranglerConfig = {
			name: workerName,
			main: mainPath,
			compatibility_date: resolvedConfig.compatibilityDate
		}

		compileModuleOptions(resolvedConfig, result)

		if (resolvedConfig.compatibilityFlags && resolvedConfig.compatibilityFlags.length > 0) {
			result.compatibility_flags = resolvedConfig.compatibilityFlags
		}

		// DO bindings WITHOUT script_name (the class is defined in this worker)
		result.durable_objects = {
			bindings: entries.map(({ bindingName, normalized }) => ({
				name: bindingName,
				class_name: normalized.className
			}))
		}

		// Scope migrations to this class only so each worker declares only the
		// classes it actually exports.
		if (resolvedConfig.migrations && resolvedConfig.migrations.length > 0) {
			const classMigrations = resolvedConfig.migrations
				.map((migration) => filterMigrationForClass(migration, className))
				.filter((migration): migration is NonNullable<typeof migration> => migration !== null)

			if (classMigrations.length > 0) {
				result.migrations = compileWranglerMigrations(classMigrations)
			}
		}

		// Include bindings that DOs might need (storage, browser, etc.)
		if (resolvedConfig.bindings?.kv) {
			result.kv_namespaces = Object.entries(resolvedConfig.bindings.kv).map(
				([binding, namespace]) => {
					return getWranglerKVNamespaceBinding(binding, namespace, options)
				}
			)
		}

		if (resolvedConfig.bindings?.d1) {
			result.d1_databases = Object.entries(resolvedConfig.bindings.d1).map(
				([binding, database_id]) => {
					return getWranglerD1DatabaseBinding(binding, database_id, options)
				}
			)
		}

		if (resolvedConfig.bindings?.r2) {
			result.r2_buckets = Object.entries(resolvedConfig.bindings.r2).map(
				([binding, bucket_name]) => ({
					binding,
					bucket_name
				})
			)
		}

		const browserBinding = getWranglerBrowserBinding(resolvedConfig.bindings?.browser)
		if (browserBinding) {
			result.browser = browserBinding
		}

		results.push(result)
	}

	return results
}
