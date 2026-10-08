// =============================================================================
// Miniflare Options — devflare's v4-shaped options, translated for Miniflare 5
// =============================================================================
/*
	Every devflare runtime path (bridge, dev server, workspace server, test
	context, worker-loader shim) assembles Miniflare options in Miniflare 4's
	flat shape: shared options plus per-worker options, optionally under
	`workers: [...]`. Miniflare 5 accepts only its new workers-array shape and
	ships `convertV4MiniflareOptions` for the translation; Wrangler itself
	builds v4 options and converts them the same way.

	→ every `new Miniflare()` / `setOptions()` goes through toMiniflareOptions().
	  Don't hand Miniflare a raw v4 object: v5 rejects it outright.
	→ GOTCHA: the converter's v4 schema STRIPS keys it does not know. An option
	  Miniflare 5 removed (`kvPersist`, `wrappedBindings`, `handleRuntimeStdio`,
	  `liveReload`, …) would vanish without a word, and its behaviour with it.
	  toMiniflareOptions refuses such keys instead, naming each one — but only
	  OPTION NAMES: top-level keys, and the keys of each `workers[i]`. A field
	  nested inside an option's value (`queueConsumers.<queue>.maxRetires`,
	  `workflows.<name>.compatibilityFlags`, …) is stripped unseen, so check the
	  v4 schema before emitting a new nested field.
	→ A multi-worker config keeps only Miniflare-wide options at the top level;
	  splitSharedOptions() decides which those are, from the same schema.
	→ Two removed options devflare still needs are translated here rather than
	  refused: `modulesRules` (Miniflare 5 no longer discovers a worker's
	  imports itself, so the rules become the explicit module list it requires)
	  and `httpsKeyPath`/`httpsCertPath` (Miniflare 5 takes file contents).
*/

import { readFileSync } from 'node:fs'
import {
	init as initModuleLexer,
	type Import as ModuleImport,
	parse as parseModule
} from 'es-module-lexer'
import type { CompiledModuleRule, MiniflareOptions, V4ModuleDefinition } from 'miniflare'
import { dirname, isAbsolute, relative, resolve } from 'pathe'

/** The part of the `miniflare` module this adapter reads; callers pass the module they loaded. */
export type MiniflareOptionsRuntime = Pick<
	typeof import('miniflare'),
	| 'convertV4MiniflareOptions'
	| 'V4MiniflareOptionsSchema'
	| 'V4WorkerOptionsSchema'
	| 'compileModuleRules'
>

/** The option keys Miniflare 5's v4 converter understands, split by where they may appear. */
interface V4OptionKeys {
	/** Keys allowed at the top level in either shape (host, port, persistence, logging, …). */
	shared: Set<string>
	/** Keys allowed on a worker — inside `workers[i]`, or at the top level of a single-worker config. */
	worker: Set<string>
}

/** The structural slice of a zod schema node the key walk reads. */
interface SchemaDef {
	/** zod's node kind: `object`, `intersection`, `union`, … */
	type?: string
	/** An object node's property schemas. */
	shape?: Record<string, unknown>
	/** An intersection node's left operand. */
	left?: unknown
	/** An intersection node's right operand. */
	right?: unknown
	/** A union node's alternatives. */
	options?: unknown[]
}

/** A Miniflare module rule as devflare emits it (`modulesRules[i]`). */
interface V4ModuleRuleInput {
	/** Module type every matching file is loaded as. */
	type: V4ModuleDefinition['type']
	/** Globs, matched against the absolute forward-slashed path of an imported file. */
	include: string[]
	/** Keep evaluating later rules of the same type after this one. */
	fallthrough?: boolean
}

/** The fields of one v4 worker entry this adapter reads or rewrites. */
type V4Worker = Record<string, unknown> & {
	/** Bundle the worker runs from. */
	scriptPath?: unknown
	/** Directory module names are relative to. */
	modulesRoot?: unknown
	/** Rules classifying the files the script imports. */
	modulesRules?: unknown
}

/**
 * @description Reads a zod schema node's definition. Miniflare bundles its own
 * zod 4, whose public `_zod.def` is the stable way into a schema's structure.
 * @param schema - a schema exported by the loaded `miniflare` module
 * @returns the node's definition
 * @throws When the value is not a zod 4 schema — Miniflare changed how it ships
 *   its schemas, and the key guard below would otherwise pass everything.
 */
function readSchemaDef(schema: unknown): SchemaDef {
	const def = (schema as { _zod?: { def?: SchemaDef } } | null)?._zod?.def
	if (!def || typeof def.type !== 'string') {
		throw new Error(
			'devflare could not read the option schema exported by `miniflare`; this Miniflare version is not supported.'
		)
	}
	return def
}

/**
 * @description Collects every object key reachable through intersections and
 * unions of a schema — the set of option names Miniflare will keep.
 * @param schema - the schema node to walk
 * @param into - accumulator shared across the recursion
 * @returns `into`, filled
 * @throws On a node kind other than object/intersection/union, because a key
 *   set that silently missed a branch would wave dropped options through.
 */
function collectObjectKeys(schema: unknown, into: Set<string> = new Set()): Set<string> {
	const def = readSchemaDef(schema)

	if (def.type === 'object' && def.shape) {
		for (const key of Object.keys(def.shape)) into.add(key)
		return into
	}

	if (def.type === 'intersection') {
		collectObjectKeys(def.left, into)
		collectObjectKeys(def.right, into)
		return into
	}

	if (def.type === 'union' && Array.isArray(def.options)) {
		for (const option of def.options) collectObjectKeys(option, into)
		return into
	}

	throw new Error(
		`devflare cannot walk a "${def.type}" node in Miniflare's option schema; this Miniflare version is not supported.`
	)
}

/**
 * @description Derives the accepted v4 option names from the schemas the loaded
 * Miniflare exports, so the list can never drift from what the converter keeps.
 * `V4MiniflareOptionsSchema` is `sharedOptions.and(workers-or-single-worker)`.
 * @param runtime - the loaded `miniflare` module
 * @returns the shared and per-worker key sets
 * @throws When the root schema is not the expected intersection.
 */
function readV4OptionKeys(runtime: MiniflareOptionsRuntime): V4OptionKeys {
	return {
		shared: readSharedOptionKeys(runtime),
		worker: collectObjectKeys(runtime.V4WorkerOptionsSchema)
	}
}

/** The part of the `miniflare` module that knows which options are Miniflare-wide. */
export type SharedOptionsRuntime = Pick<typeof import('miniflare'), 'V4MiniflareOptionsSchema'>

/**
 * @description Reads the names of the Miniflare-wide options (host, port,
 * persistence root, logging, …) from the loaded Miniflare's option schema.
 * @param runtime - the loaded `miniflare` module
 * @returns the shared option names
 * @throws When the root schema is not the expected intersection.
 */
function readSharedOptionKeys(runtime: SharedOptionsRuntime): Set<string> {
	const root = readSchemaDef(runtime.V4MiniflareOptionsSchema)
	if (root.type !== 'intersection') {
		throw new Error(
			"devflare could not find Miniflare's shared option schema; this Miniflare version is not supported."
		)
	}
	return collectObjectKeys(root.left)
}

/** Flat single-worker options, split by where a multi-worker config holds them. */
export interface SplitOptions {
	/** Miniflare-wide options, which stay at the top level next to `workers`. */
	shared: Record<string, unknown>
	/** Everything else, which belongs on the worker the options described. */
	worker: Record<string, unknown>
}

/**
 * @description Splits flat single-worker options for a multi-worker config:
 * Miniflare reads per-worker options only from `workers` once that array
 * exists, so every non-shared option must move onto a worker or it is lost.
 * The shared set comes from Miniflare's schema, so a binding devflare adds
 * later moves with the rest instead of being left behind.
 * @param runtime - the loaded `miniflare` module
 * @param options - flat v4 options describing one worker
 * @returns the shared and per-worker halves; a key lands in exactly one
 * @throws When Miniflare's option schema cannot be read.
 *
 * @example
 * const { shared, worker } = splitSharedOptions(miniflare, mfConfig)
 * const multiWorker = { ...shared, workers: [{ ...worker, name: 'main' }, ...others] }
 */
export function splitSharedOptions(
	runtime: SharedOptionsRuntime,
	options: Record<string, unknown>
): SplitOptions {
	const sharedKeys = readSharedOptionKeys(runtime)
	const split: SplitOptions = { shared: {}, worker: {} }
	for (const [key, value] of Object.entries(options)) {
		split[sharedKeys.has(key) ? 'shared' : 'worker'][key] = value
	}
	return split
}

/**
 * @description Lists every option the converter would strip. A key whose value
 * is `undefined` carries nothing and is ignored. In the multi-worker shape a
 * worker-only key at the top level is dropped too (the converter reads only
 * `workers`), so it is reported as well.
 * @param options - the v4-shaped options devflare assembled
 * @param keys - the accepted key sets
 * @returns dotted paths of the offending keys, e.g. `workers[2].wrappedBindings`
 */
function findDroppedOptions(options: Record<string, unknown>, keys: V4OptionKeys): string[] {
	const dropped: string[] = []
	const workers = options.workers

	for (const [key, value] of Object.entries(options)) {
		if (value === undefined || keys.shared.has(key)) continue
		const isAcceptedHere = Array.isArray(workers) ? key === 'workers' : keys.worker.has(key)
		if (!isAcceptedHere) dropped.push(key)
	}

	if (Array.isArray(workers)) {
		workers.forEach((worker: Record<string, unknown>, index) => {
			for (const [key, value] of Object.entries(worker)) {
				if (value !== undefined && !keys.worker.has(key)) dropped.push(`workers[${index}].${key}`)
			}
		})
	}

	return dropped
}

/**
 * @description Tests a compiled include/exclude matcher. Miniflare compiles the
 * globs with the `g` flag, which makes `RegExp#test` stateful, so `lastIndex`
 * is reset before every probe.
 * @param matcher - one rule's compiled `include`
 * @param path - absolute, forward-slashed file path
 * @returns whether the rule claims the file
 */
function matchesCompiledRule(matcher: CompiledModuleRule['include'], path: string): boolean {
	const test = (pattern: RegExp) => {
		pattern.lastIndex = 0
		return pattern.test(path)
	}
	return matcher.include.some(test) && !matcher.exclude.some(test)
}

/**
 * @description Picks out the file an import record points at, if any.
 * @param record - one import record from es-module-lexer
 * @param importer - the module containing it, for the error
 * @returns the relative or absolute specifier, or `undefined` for a bare
 *   specifier, a type-only import, or an `import.meta` reference
 * @throws On a dynamic `import()` whose specifier is not a string literal —
 *   it names no single module, and Miniflare 4 refused it the same way.
 */
function readFileSpecifier(record: ModuleImport, importer: string): string | undefined {
	if (record.type === 'import-meta' || (record.type !== 'dynamic' && record.typeOnly)) {
		return undefined
	}

	if (record.type === 'dynamic' && (record.specifier === undefined || record.glob)) {
		throw new Error(
			`${importer} has a dynamic import() whose specifier is not a string literal; a worker module list cannot include it. Import the module with a literal path, or bundle it.`
		)
	}

	const { specifier } = record
	return specifier !== undefined && (specifier.startsWith('.') || isAbsolute(specifier))
		? specifier
		: undefined
}

/**
 * @description Builds the explicit module list for a file-backed worker, which
 * Miniflare 4 used to discover itself from `modulesRules`. Starting from the
 * script, it follows every relative static or string-literal dynamic import,
 * classifies the target with the first matching rule, and recurses into
 * ES modules. Bare specifiers (`node:*`, `cloudflare:*`, package names) are
 * left to workerd, which provides the builtins and rejects anything else loudly.
 * @param scriptPath - absolute path of the worker's entry script (always an ES module)
 * @param rules - the worker's rules, in Miniflare 4's `modulesRules` form
 * @param runtime - the loaded `miniflare` module (for its glob compiler)
 * @returns module definitions, entry first
 * @throws When an imported file matches no rule or a dynamic import has a
 *   non-literal specifier — the same refusals Miniflare 4 raised — or when a
 *   module cannot be read.
 *
 * → NOTE: CommonJS modules are listed but not followed: finding `require()`
 *   calls needs a real JS parse. devflare's bundles are single ES modules, so a
 *   CommonJS module only appears through a user `external`; a `require` it
 *   makes that is missing from the list fails loudly at workerd load. Follow
 *   requires here if that case ever matters.
 */
async function collectWorkerModules(
	scriptPath: string,
	rules: V4ModuleRuleInput[],
	runtime: MiniflareOptionsRuntime
): Promise<V4ModuleDefinition[]> {
	await initModuleLexer()
	const compiledRules = runtime.compileModuleRules(rules)
	const modules = new Map<string, V4ModuleDefinition>([
		[scriptPath, { type: 'ESModule', path: scriptPath }]
	])
	const pending = [scriptPath]

	for (let importer = pending.pop(); importer !== undefined; importer = pending.pop()) {
		const [imports] = parseModule(readFileSync(importer, 'utf8'), importer)

		for (const record of imports) {
			const specifier = readFileSpecifier(record, importer)
			if (specifier === undefined) continue

			const modulePath = resolve(dirname(importer), specifier)
			if (modules.has(modulePath)) continue

			const rule = compiledRules.find((candidate) =>
				matchesCompiledRule(candidate.include, modulePath)
			)
			if (!rule) {
				throw new Error(
					`"${specifier}" imported by ${importer} matches no module rule. Add a \`rules\` entry for it in devflare.config.`
				)
			}

			modules.set(modulePath, { type: rule.type, path: modulePath })
			if (rule.type === 'ESModule') pending.push(modulePath)
		}
	}

	return [...modules.values()]
}

/**
 * @description Replaces a worker's `scriptPath` + `modulesRules` with the
 * explicit `modules` list Miniflare 5 needs. Workers without rules pass through.
 * @param worker - one v4 worker entry
 * @param runtime - the loaded `miniflare` module
 * @returns the worker, rewritten when it carried `modulesRules`
 * @throws When `modulesRules` arrive without a `scriptPath` to start from.
 */
async function expandModuleRules(
	worker: V4Worker,
	runtime: MiniflareOptionsRuntime
): Promise<V4Worker> {
	if (worker.modulesRules === undefined) return worker

	const { scriptPath, modulesRules, modules: _modulesFlag, ...rest } = worker
	if (typeof scriptPath !== 'string') {
		throw new Error('devflare emitted `modulesRules` for a worker without a `scriptPath`.')
	}

	const modulesRoot =
		typeof worker.modulesRoot === 'string' ? worker.modulesRoot : dirname(scriptPath)
	const modules = await collectWorkerModules(
		resolve(scriptPath),
		modulesRules as V4ModuleRuleInput[],
		runtime
	)

	const outsideRoot = modules.find((module) =>
		relative(resolve(modulesRoot), module.path).startsWith('..')
	)
	if (outsideRoot) {
		throw new Error(
			`Module ${outsideRoot.path} lies outside the worker's modules root ${modulesRoot}; workerd cannot load it.`
		)
	}

	return { ...rest, modulesRoot, modules }
}

/**
 * @description Reads one TLS file named by a `*Path` option.
 * @param path - the configured path; relative paths resolve against the process cwd
 * @param option - the option that named it, for the error
 * @returns the file's contents
 * @throws When the file cannot be read, naming the option that pointed at it.
 */
function readTlsFile(path: string, option: string): string {
	try {
		return readFileSync(path, 'utf8')
	} catch (error) {
		throw new Error(`Could not read the TLS file "${path}" given as ${option}.`, { cause: error })
	}
}

/**
 * @description Turns `httpsKeyPath` / `httpsCertPath` into the `httpsKey` /
 * `httpsCert` contents Miniflare 5 takes, exactly as Miniflare 4 resolved them
 * itself: files are read only when both a key and a certificate are supplied
 * (in either form), an inline value wins over its path, and relative paths
 * resolve against the process cwd. With only one half supplied both Miniflare
 * versions serve their built-in self-signed certificate when `https` is on.
 * @param options - top-level v4 options
 * @returns the options without the two `*Path` keys
 * @throws When a named file cannot be read.
 */
function readHttpsFiles(options: Record<string, unknown>): Record<string, unknown> {
	const { httpsKeyPath, httpsCertPath, ...rest } = options
	const hasKey = Boolean(rest.httpsKey || httpsKeyPath)
	const hasCert = Boolean(rest.httpsCert || httpsCertPath)
	if (!hasKey || !hasCert) return rest

	return {
		...rest,
		httpsKey: rest.httpsKey ?? readTlsFile(httpsKeyPath as string, 'httpsKeyPath'),
		httpsCert: rest.httpsCert ?? readTlsFile(httpsCertPath as string, 'httpsCertPath')
	}
}

/**
 * @description Translates devflare's v4-shaped Miniflare options into the
 * options Miniflare 5 accepts. Reads the TLS files `httpsKeyPath` /
 * `httpsCertPath` name, expands `modulesRules` into explicit module lists,
 * refuses any option the converter would silently drop, then converts.
 * @param runtime - the `miniflare` module the caller loaded (and will construct from)
 * @param options - v4-shaped options: shared keys plus one worker's keys, or
 *   shared keys plus `workers: [...]`
 * @returns options for `new Miniflare()` / `setOptions()`
 * @throws When an option Miniflare 5 no longer accepts is present (a devflare
 *   bug, not a user error), when a TLS file cannot be read, or when module
 *   expansion fails.
 *
 * @example
 * const miniflare = await import('miniflare')
 * const mf = new miniflare.Miniflare(await toMiniflareOptions(miniflare, { script, modules: true }))
 */
export async function toMiniflareOptions(
	runtime: MiniflareOptionsRuntime,
	options: object
): Promise<MiniflareOptions> {
	const record = readHttpsFiles(options as Record<string, unknown>)
	const expanded = Array.isArray(record.workers)
		? {
				...record,
				workers: await Promise.all(
					record.workers.map((worker: V4Worker) => expandModuleRules(worker, runtime))
				)
			}
		: await expandModuleRules(record, runtime)

	const dropped = findDroppedOptions(expanded, readV4OptionKeys(runtime))
	if (dropped.length > 0) {
		throw new Error(
			`devflare built Miniflare options that Miniflare 5 no longer accepts and would silently ignore: ${dropped.join(', ')}. This is a devflare bug; please report it.`
		)
	}

	return runtime.convertV4MiniflareOptions(
		expanded as Parameters<MiniflareOptionsRuntime['convertV4MiniflareOptions']>[0]
	)
}
