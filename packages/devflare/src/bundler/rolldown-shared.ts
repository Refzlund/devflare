import { existsSync } from 'node:fs'
import { resolve } from 'pathe'
import type {
	ExternalOption,
	InputOptions,
	OutputOptions,
	RolldownPluginOption
} from 'rolldown'
import type { DevflareRolldownOptions } from '../config/schema'
import {
	assertWorkerBundleHasNoDynamicImports,
	createWorkerDynamicImportPlugin
} from './worker-compat'

type ExternalPattern = string | RegExp

type SanitizedRolldownOptions = DevflareRolldownOptions &
	Partial<Pick<InputOptions, 'cwd' | 'input' | 'platform' | 'watch'>> & {
		target?: unknown
	}

type SanitizedRolldownOutputOptions = NonNullable<DevflareRolldownOptions['output']> &
	Partial<Pick<OutputOptions, 'codeSplitting' | 'dir' | 'file' | 'format' | 'inlineDynamicImports'>>

const DEFAULT_EXTERNAL_MODULES: ExternalPattern[] = [
	/^cloudflare:/,
	/^node:/,
	'buffer', 'crypto', 'events', 'http', 'https', 'net', 'os', 'path',
	'stream', 'tls', 'url', 'util', 'zlib', 'fs', 'child_process',
	'async_hooks', 'querystring', 'string_decoder', 'assert', 'dns'
]

function toArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value]
}

function matchesExternalPattern(pattern: ExternalPattern, id: string): boolean {
	if (pattern instanceof RegExp) {
		pattern.lastIndex = 0
		return pattern.test(id)
	}

	return pattern === id
}

function matchesExternalOption(
	option: ExternalOption | undefined,
	id: string,
	parentId: string | undefined,
	isResolved: boolean
): boolean {
	if (!option) {
		return false
	}

	if (typeof option === 'function') {
		return option(id, parentId, isResolved) ?? false
	}

	return toArray(option).some((pattern) => matchesExternalPattern(pattern, id))
}

function mergeExternalOptions(
	base: ExternalOption | undefined,
	user: ExternalOption | undefined
): ExternalOption | undefined {
	if (!base) {
		return user
	}

	if (!user) {
		return base
	}

	if (typeof base !== 'function' && typeof user !== 'function') {
		return [...toArray(base), ...toArray(user)]
	}

	return (id, parentId, isResolved) => {
		return matchesExternalOption(base, id, parentId, isResolved)
			|| matchesExternalOption(user, id, parentId, isResolved)
			|| false
	}
}

function mergePluginOptions(
	base: RolldownPluginOption | undefined,
	user: RolldownPluginOption | undefined
): RolldownPluginOption | undefined {
	if (!base) {
		return user
	}

	if (!user) {
		return base
	}

	return [base, user]
}

/**
 * Single alias entry. `find` may be a string or RegExp; `replacement` is the
 * module id / absolute path the matched specifier resolves to.
 */
export interface AliasEntry {
	find: string | RegExp
	replacement: string
}

type RolldownAliasRecord = Record<string, string>

/**
 * Rolldown's `resolve.alias` option accepts only `Record<string, string[] | string | false>`.
 * We accept the richer `AliasEntry[]` form internally so framework defaults, user
 * overrides and future regex-based aliases can flow through a single pipeline.
 */
export type AliasInput = RolldownAliasRecord | AliasEntry[] | undefined

function aliasKey(find: string | RegExp): string {
	return find instanceof RegExp
		? `re:${find.source}:${find.flags}`
		: `str:${find}`
}

export function normalizeAliasEntries(input: AliasInput): AliasEntry[] {
	if (!input) {
		return []
	}

	if (Array.isArray(input)) {
		return input.filter((entry): entry is AliasEntry => {
			return Boolean(entry) && typeof entry.replacement === 'string'
		})
	}

	return Object.entries(input)
		.filter(([, replacement]) => typeof replacement === 'string')
		.map(([find, replacement]) => ({ find, replacement: replacement as string }))
}

/**
 * Merge framework-default aliases with user-provided aliases.
 *
 * Contract:
 * - Framework defaults are emitted first, then user entries, so on duplicate
 *   `find` keys the user entry wins (object-spread / last-wins semantics).
 * - Entries are deduplicated by the normalized `find` key (string value or
 *   `RegExp.source` + flags).
 * - Ordering of user entries is preserved so regex specificity remains
 *   predictable.
 */
export function mergeAliases(
	userAliases: AliasEntry[],
	frameworkDefaults: AliasEntry[]
): AliasEntry[] {
	const userKeys = new Set(userAliases.map((entry) => aliasKey(entry.find)))

	const frameworkFiltered = frameworkDefaults.filter((entry) => {
		return !userKeys.has(aliasKey(entry.find))
	})

	// Dedupe user entries too, keeping the LAST occurrence of each key to match
	// object-spread semantics while preserving the relative ordering of that
	// last occurrence (important for regex specificity).
	const seenUserKeys = new Set<string>()
	const dedupedUser: AliasEntry[] = []
	for (let index = userAliases.length - 1;index >= 0;index--) {
		const entry = userAliases[index]!
		const key = aliasKey(entry.find)
		if (seenUserKeys.has(key)) {
			continue
		}
		seenUserKeys.add(key)
		dedupedUser.unshift(entry)
	}

	return [...frameworkFiltered, ...dedupedUser]
}

function aliasEntriesToRolldownRecord(entries: AliasEntry[]): RolldownAliasRecord {
	const record: RolldownAliasRecord = {}
	for (const entry of entries) {
		if (entry.find instanceof RegExp) {
			// Rolldown's resolve.alias is Record<string, string> only. RegExp keys
			// are carried by `mergeAliases` for future use but cannot be handed to
			// rolldown directly; skip them here so we never emit an invalid shape.
			continue
		}
		record[entry.find] = entry.replacement
	}
	return record
}

function mergeResolveOptions(
	base: InputOptions['resolve'] | undefined,
	user: InputOptions['resolve'] | undefined
): InputOptions['resolve'] | undefined {
	if (!base && !user) {
		return undefined
	}

	const frameworkEntries = normalizeAliasEntries(base?.alias as AliasInput)
	const userEntries = normalizeAliasEntries(user?.alias as AliasInput)
	const mergedEntries = mergeAliases(userEntries, frameworkEntries)

	const mergedAlias = aliasEntriesToRolldownRecord(mergedEntries)

	return {
		...(user ?? {}),
		...(base ?? {}),
		...(mergedEntries.length > 0 ? { alias: mergedAlias } : {})
	}
}

function resolveTsconfigOption(options: {
	cwd: string
	userTsconfig: InputOptions['tsconfig']
	defaultMode: 'always' | 'if-present'
}): Pick<InputOptions, 'tsconfig'> | {} {
	if (options.userTsconfig) {
		return { tsconfig: options.userTsconfig }
	}

	const defaultTsconfigPath = resolve(options.cwd, 'tsconfig.json')
	if (options.defaultMode === 'always' || existsSync(defaultTsconfigPath)) {
		return { tsconfig: defaultTsconfigPath }
	}

	return {}
}

export async function ensureDebugShim(outDir: string): Promise<string> {
	const fs = await import('node:fs/promises')
	const debugShimCode = `
// Debug module shim for local development
const createDebug = (namespace) => {
	const logger = (...args) => {
		if (createDebug.enabled) console.debug(\`[\${namespace}]\`, ...args)
	}
	logger.enabled = false
	logger.namespace = namespace
	logger.extend = (sub) => createDebug(\`\${namespace}:\${sub}\`)
	return logger
}
createDebug.enabled = false
createDebug.formatters = {}
export default createDebug
`
	const debugShimPath = resolve(outDir, '_debug_shim.js')
	await fs.writeFile(debugShimPath, debugShimCode, 'utf-8')
	return debugShimPath
}

export function resolveWorkerCompatibleRolldownConfig(options: {
	cwd: string
	inputFile: string
	outFile: string
	platform: InputOptions['platform']
	alias?: Record<string, string>
	rolldownOptions?: DevflareRolldownOptions
	sourcemap?: boolean
	minify?: boolean
	inlineDynamicImports?: boolean
	defaultTsconfigMode: 'always' | 'if-present'
}): {
	inputOptions: InputOptions
	outputOptions: OutputOptions
} {
	const {
		output: userOutputOptions,
		input: _ignoredInput,
		cwd: _ignoredCwd,
		platform: _ignoredPlatform,
		target: _ignoredTarget,
		watch: _ignoredWatch,
		external: userExternal,
		plugins: userPlugins,
		resolve: userResolve,
		tsconfig: userTsconfig,
		...userInputOptions
	} = (options.rolldownOptions ?? {}) as SanitizedRolldownOptions

	const {
		codeSplitting: _ignoredCodeSplitting,
		dir: _ignoredDir,
		file: _ignoredFile,
		format: _ignoredFormat,
		inlineDynamicImports: _ignoredInlineDynamicImports,
		...safeUserOutputOptions
	} = (userOutputOptions ?? {}) as SanitizedRolldownOutputOptions

	return {
		inputOptions: {
			...userInputOptions,
			input: options.inputFile,
			cwd: options.cwd,
			platform: options.platform,
			...resolveTsconfigOption({
				cwd: options.cwd,
				userTsconfig,
				defaultMode: options.defaultTsconfigMode
			}),
			external: mergeExternalOptions(DEFAULT_EXTERNAL_MODULES, userExternal),
			plugins: mergePluginOptions(createWorkerDynamicImportPlugin(), userPlugins),
			resolve: mergeResolveOptions(
				options.alias
					? {
						alias: options.alias
					}
					: undefined,
				userResolve
			)
		},
		outputOptions: {
			...safeUserOutputOptions,
			file: options.outFile,
			format: 'esm',
			sourcemap: safeUserOutputOptions.sourcemap ?? options.sourcemap ?? false,
			minify: safeUserOutputOptions.minify ?? options.minify,
			codeSplitting: false,
			...(options.inlineDynamicImports !== undefined
				? { inlineDynamicImports: options.inlineDynamicImports }
				: {})
		}
	}
}

export async function writeWorkerCompatibleBundle(options: {
	inputOptions: InputOptions
	outputOptions: OutputOptions
	outFile: string
}): Promise<void> {
	const { rolldown } = await import('rolldown')
	const bundle = await rolldown(options.inputOptions)

	try {
		await bundle.write(options.outputOptions)
		await assertWorkerBundleHasNoDynamicImports(options.outFile)
	} finally {
		await bundle.close()
	}
}