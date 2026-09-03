import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'pathe'
import type { DevflareConfig } from './schema'

const ENV_DESCRIPTOR_FLAG = '__devflareEnvDescriptor'

/**
 * Environment-variable resolution mode.
 *
 * `build` treats missing required variables as fatal. `dev` also reports
 * missing required variables, but dev-server startup can wait for `.env`
 * changes and retry.
 *
 * @default 'build'
 */
export type EnvResolutionMode = 'build' | 'dev'

type EnvParser<T> = (value: string) => T

export interface EnvVarDescriptorState<TValue = string, TOptional extends boolean = false> {
	name: string
	optional: TOptional
	parser?: EnvParser<TValue>
	defaultValue?: TValue
	hasDefault: boolean
	devValue?: TValue
	hasDevDefault: boolean
	absentInDev: boolean
}

/**
 * A typed environment-variable descriptor used inside `defineConfig({ vars })`.
 *
 * Descriptors are resolved by Devflare before a dev runtime or build artifact is
 * started. The descriptor itself is intentionally inert while the config module
 * is imported, so missing variables can be reported with config paths instead
 * of throwing during module evaluation.
 *
 * @typeParam TValue - Runtime value produced by the optional parser.
 * @typeParam TOptional - Whether a missing value is allowed.
 */
export interface EnvVarDescriptor<TValue = string, TOptional extends boolean = false> {
	readonly [ENV_DESCRIPTOR_FLAG]: true
	readonly __state: EnvVarDescriptorState<TValue, TOptional>

	/**
	 * Allow this variable to be missing. Missing optional variables are omitted
	 * from generated Worker vars.
	 *
	 * @example
	 * ```ts
	 * vars: {
	 *   MAYBE_LABEL: env.MAYBE_LABEL.optional()
	 * }
	 * ```
	 */
	optional(): EnvVarDescriptor<TValue, true>

	/**
	 * Parse the string value read from `.env` / process env into a runtime value.
	 *
	 * @example
	 * ```ts
	 * vars: {
	 *   RETRIES: env.RETRIES.parse(Number)
	 * }
	 * ```
	 */
	parse<TNext>(parser: EnvParser<TNext>): EnvVarDescriptor<TNext, TOptional>

	/**
	 * Alias for {@link parse}.
	 *
	 * @example
	 * ```ts
	 * vars: {
	 *   PORT: env.PORT.parser(parseInt)
	 * }
	 * ```
	 */
	parser<TNext>(parser: EnvParser<TNext>): EnvVarDescriptor<TNext, TOptional>

	/**
	 * Use this value when the environment variable is missing in any mode.
	 *
	 * @example
	 * ```ts
	 * vars: {
	 *   APP_ENV: env.APP_ENV.default('local')
	 * }
	 * ```
	 */
	default<TDefault>(value: TDefault): EnvVarDescriptor<TValue | TDefault, false>

	/**
	 * Use this value only when the environment variable is missing in dev mode.
	 * Build mode still treats the variable as required unless `.default()` or
	 * `.optional()` is also chained.
	 *
	 * @example
	 * ```ts
	 * vars: {
	 *   MOCK_TENANT_ID: env.MOCK_TENANT_ID.dev(123)
	 * }
	 * ```
	 */
	dev<TDev>(value: TDev): EnvVarDescriptor<TValue | TDev, TOptional>

	/**
	 * Keep this variable REQUIRED in build mode, and let dev run WITHOUT it. A
	 * missing value fails a build; in dev the key is simply not emitted.
	 *
	 * This is the third answer to "what if it is missing", and it exists because
	 * the other two are both wrong for a class of variable that a deployment must
	 * have and a developer must NOT: `.optional()` allows it to be missing in a
	 * production build too, and `.dev(value)` hands the local runtime a value.
	 *
	 * The motivating case is a sender address. A worker with no sender is the
	 * intended local state — code that shape-checks the environment finds nothing
	 * and takes its "cannot send" path, which is how local development gets a
	 * sign-in code in the response instead of an email nobody will read. Give it a
	 * placeholder and every laptop starts believing it can send. Let it be
	 * `.optional()` and a production deploy that forgot it ships silently broken.
	 *
	 * The inferred type is OPTIONAL, because a dev runtime genuinely may not have
	 * the key — code reading it must handle that, which is the point.
	 *
	 * → KEY: absent by default is not the same as FORBIDDEN. A value that is
	 *   actually present still wins, in dev as everywhere else, so a developer who
	 *   deliberately exports one to point their machine at a real sender gets it.
	 * → GOTCHA: which is why a variable declared this way must NOT be written into
	 *   `.env.public`. That file is committed, so a value there reaches every
	 *   checkout — handing the exact placeholder to every laptop that this
	 *   descriptor exists to withhold, and doing it without anyone choosing to.
	 *   Supply it from the deployment (a CI variable, the dashboard) or from a
	 *   developer's own git-ignored `.env`.
	 *
	 * @example
	 * ```ts
	 * vars: {
	 *   EMAIL_FROM: env.EMAIL_FROM.absentInDev()
	 * }
	 * ```
	 */
	absentInDev(): EnvVarDescriptor<TValue, true>
}

/**
 * One value allowed under `defineConfig({ vars })`.
 *
 * Use literals for values that are already known, or `env.NAME` descriptors
 * for values loaded from Devflare-discovered env files (`.env.public`, `.env.dev`, `.env`) or from
 * `process.env`.
 *
 * @example
 * ```ts
 * vars: {
 *   serviceName: 'api',
 *   mongo: {
 *     uri: env.MONGOURI,
 *     poolSize: env.MONGO_POOL_SIZE.parse(Number)
 *   }
 * }
 * ```
 */
export type DevflareVarInput =
	| string
	| number
	| boolean
	| null
	| EnvVarDescriptor<unknown, boolean>
	| { [key: string]: DevflareVarInput }
	| DevflareVarInput[]

/**
 * Runtime variable map accepted by `defineConfig({ vars })`.
 *
 * @default {}
 */
export type DevflareVarsInput = Record<string, DevflareVarInput>

export type InferEnvVarDescriptor<T> = T extends EnvVarDescriptor<infer TValue, infer TOptional>
	? TOptional extends true
		? TValue | undefined
		: TValue
	: never

type InferOptionalKeys<T extends Record<string, unknown>> = {
	[K in keyof T]-?: undefined extends InferConfigVars<T[K]> ? K : never
}[keyof T]

type InferRequiredKeys<T extends Record<string, unknown>> = Exclude<keyof T, InferOptionalKeys<T>>

/**
 * Infer the runtime `vars` shape from the authored config value.
 *
 * This is used by generated `env.d.ts` files so `import { vars } from
 * 'devflare'` can expose nested variables and parser return values without
 * hand-maintained duplicate types.
 *
 * @example
 * ```ts
 * type Vars = InferConfigVars<{
 *   mongo: {
 *     database: typeof env.MONGODATABASE
 *   },
 *   retries: ReturnType<typeof env.RETRIES.parse<number>>
 * }>
 * ```
 */
export type InferConfigVars<T> = T extends { readonly __vars?: infer TVars }
	? TVars
	: T extends EnvVarDescriptor<unknown, boolean>
		? InferEnvVarDescriptor<T>
		: T extends readonly (infer TItem)[]
			? InferConfigVars<TItem>[]
			: T extends Record<string, unknown>
				? {
						[K in InferRequiredKeys<T>]: Exclude<InferConfigVars<T[K]>, undefined>
					} & {
						[K in InferOptionalKeys<T>]?: Exclude<InferConfigVars<T[K]>, undefined>
					}
				: T

function createDescriptor<TValue, TOptional extends boolean>(
	state: EnvVarDescriptorState<TValue, TOptional>
): EnvVarDescriptor<TValue, TOptional> {
	const descriptor = {
		[ENV_DESCRIPTOR_FLAG]: true as const,
		__state: state,
		optional() {
			return createDescriptor({
				...state,
				optional: true
			})
		},
		parse<TNext>(parser: EnvParser<TNext>) {
			return createDescriptor({
				...state,
				parser
			} as unknown as EnvVarDescriptorState<TNext, TOptional>)
		},
		parser<TNext>(parser: EnvParser<TNext>) {
			return this.parse(parser)
		},
		default<TDefault>(value: TDefault) {
			return createDescriptor({
				...state,
				defaultValue: value,
				hasDefault: true,
				optional: false
			} as unknown as EnvVarDescriptorState<TValue | TDefault, false>)
		},
		dev<TDev>(value: TDev) {
			return createDescriptor({
				...state,
				devValue: value,
				hasDevDefault: true
			} as unknown as EnvVarDescriptorState<TValue | TDev, TOptional>)
		},
		absentInDev() {
			// `optional` stays FALSE on the state while the TYPE parameter flips to true, and the split is the
			// whole feature. The state drives resolution, where this must still be required in a build; the
			// type parameter drives the generated `env.d.ts`, where the key must read as possibly-absent
			// because in dev it genuinely is.
			return createDescriptor({
				...state,
				absentInDev: true
			} as unknown as EnvVarDescriptorState<TValue, true>)
		}
	}

	return descriptor as EnvVarDescriptor<TValue, TOptional>
}

function createEnvVarDescriptor(name: string): EnvVarDescriptor<string, false> {
	return createDescriptor({
		name,
		optional: false,
		hasDefault: false,
		hasDevDefault: false,
		absentInDev: false
	})
}

/**
 * Config-time environment variable descriptor factory.
 *
 * Accessing a property creates a descriptor for the exact environment variable
 * name, so `env.SECRET` reads `SECRET=...` from Devflare-loaded `.env` files or
 * from `process.env`.
 *
 * @example
 * ```ts
 * import { defineConfig, env } from 'devflare/config'
 *
 * export default defineConfig({
 *   vars: {
 *     secret: env.SECRET,
 *     mongo: {
 *       uri: env.MONGOURI,
 *       database: env.MONGODATABASE
 *     },
 *     retries: env.RETRIES.parse(Number)
 *   }
 * })
 * ```
 */
export const env: Record<string, EnvVarDescriptor<string, false>> = new Proxy(
	{} as Record<string, EnvVarDescriptor<string, false>>,
	{
		get(_target, prop: string | symbol) {
			if (typeof prop !== 'string') {
				return undefined
			}

			return createEnvVarDescriptor(prop)
		}
	}
)

/**
 * Return whether a value was created by the config-time {@link env} proxy.
 *
 * @example
 * ```ts
 * isEnvVarDescriptor(env.SECRET) // true
 * ```
 */
export function isEnvVarDescriptor(value: unknown): value is EnvVarDescriptor<unknown, boolean> {
	return Boolean(
		value &&
			typeof value === 'object' &&
			(value as { [ENV_DESCRIPTOR_FLAG]?: unknown })[ENV_DESCRIPTOR_FLAG] === true
	)
}

function parseEnvValue(rawValue: string): string {
	const trimmed = rawValue.trim()
	const quote = trimmed[0]

	if (
		(quote === '"' || quote === "'" || quote === '`') &&
		trimmed.endsWith(quote) &&
		trimmed.length >= 2
	) {
		const inner = trimmed.slice(1, -1)
		if (quote !== '"') {
			return inner
		}

		return inner
			.replace(/\\n/g, '\n')
			.replace(/\\r/g, '\r')
			.replace(/\\t/g, '\t')
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, '\\')
	}

	return trimmed
}

/**
 * Parse `.env` file contents with Devflare's no-expansion rules.
 *
 * Devflare intentionally does not expand `$OTHER_VARIABLE` references, so
 * values are read as written instead of going through Bun's environment-file
 * parser.
 *
 * @example
 * ```ts
 * parseDevflareEnvFile('TOKEN=abc$123')
 * // { TOKEN: 'abc$123' }
 * ```
 */
export function parseDevflareEnvFile(contents: string): Record<string, string> {
	const values: Record<string, string> = {}

	for (const line of contents.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) {
			continue
		}

		const assignment = trimmed.startsWith('export ')
			? trimmed.slice('export '.length).trimStart()
			: trimmed
		const equalsIndex = assignment.indexOf('=')
		if (equalsIndex <= 0) {
			continue
		}

		const key = assignment.slice(0, equalsIndex).trim()
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
			continue
		}

		values[key] = parseEnvValue(assignment.slice(equalsIndex + 1))
	}

	return values
}

function collectAncestorDirectories(startDir: string): string[] {
	const directories: string[] = []
	let current = resolve(startDir)

	while (true) {
		directories.push(current)
		const parent = dirname(current)
		if (parent === current) {
			break
		}
		current = parent
	}

	return directories.reverse()
}

/**
 * The env files Devflare reads in one directory, LOWEST precedence first.
 *
 * `.env.public` is the tier meant to be COMMITTED. Every other env file here is
 * conventionally git-ignored, which leaves a value that is genuinely not a
 * secret — a sender address, a support forwarding target, a public API origin —
 * with nowhere to live but a deploy dashboard or a hand-rolled spread in the
 * config. Both of those hide it from the reader who needs it most: the next
 * person setting the project up.
 *
 * It is deliberately the WEAKEST tier, so a developer's own `.env.dev` or `.env`
 * always wins over a committed default rather than the other way round.
 *
 * → GOTCHA: the name is a warning, not a category. Anything in `.env.public` is
 *   in git history permanently. Devflare cannot tell a sender address from an
 *   SMTP url with a password in it, so nothing here validates that promise —
 *   the filename is the only thing standing between a convenience and a leak.
 */
const DOTENV_FILES_LOWEST_FIRST = ['.env.public', '.env.dev', '.env'] as const

/**
 * Return `.env.public`, `.env.dev` and `.env` candidate paths from the
 * filesystem root to a project directory.
 *
 * Paths are ordered in the same precedence order as loading: parent files
 * first, then closer files, and within each directory the order of
 * {@link DOTENV_FILES_LOWEST_FIRST} — committed defaults, then a developer's
 * dev file, then their `.env`.
 *
 * @example
 * ```ts
 * getDevflareDotenvPaths(process.cwd())
 * ```
 */
export function getDevflareDotenvPaths(startDir: string): string[] {
	return collectAncestorDirectories(startDir).flatMap((directory) =>
		DOTENV_FILES_LOWEST_FIRST.map((file) => resolve(directory, file))
	)
}

export interface LoadDevflareDotenvResult {
	/**
	 * Merged values from every discovered `.env.public`, `.env.dev` and `.env` file.
	 *
	 * @default {}
	 */
	values: Record<string, string>

	/**
	 * Absolute file paths that contributed values, ordered by load precedence.
	 *
	 * @default []
	 */
	files: string[]
}

/**
 * Load Devflare `.env.public`, `.env.dev` and `.env` files without mutating `process.env`.
 *
 * Parent directories are loaded first, closer directories override them, and
 * within one directory the order is `.env.public` (committed defaults), then
 * `.env.dev`, then `.env` — so a developer's own file always beats a value the
 * repository ships.
 *
 * @example
 * ```ts
 * const { values } = await loadDevflareDotenv(process.cwd())
 * ```
 */
export async function loadDevflareDotenv(startDir: string): Promise<LoadDevflareDotenvResult> {
	const values: Record<string, string> = {}
	const files: string[] = []

	for (const filePath of getDevflareDotenvPaths(startDir)) {
		if (!existsSync(filePath)) {
			continue
		}

		Object.assign(values, parseDevflareEnvFile(await readFile(filePath, 'utf8')))
		files.push(filePath)
	}

	return { values, files }
}

/**
 * Load Devflare `.env` values into `process.env` without overwriting existing
 * process-level values.
 *
 * @example
 * ```ts
 * await loadDevflareDotenvIntoProcess(process.cwd())
 * ```
 */
export async function loadDevflareDotenvIntoProcess(
	startDir: string
): Promise<LoadDevflareDotenvResult> {
	const loaded = await loadDevflareDotenv(startDir)

	for (const [key, value] of Object.entries(loaded.values)) {
		if (process.env[key] === undefined) {
			process.env[key] = value
		}
	}

	return loaded
}

export interface MissingEnvVar {
	/**
	 * Nested `vars` path that required the missing variable.
	 *
	 * @example ['mongo', 'uri']
	 */
	path: string[]

	/**
	 * Exact environment variable name that was missing.
	 *
	 * @example 'MONGOURI'
	 */
	name: string
}

function formatMissingEnvTree(missing: MissingEnvVar[]): string {
	const root: Record<string, unknown> = {}

	for (const item of missing) {
		let current = root
		for (const segment of item.path.slice(0, -1)) {
			const next = current[segment]
			if (!next || typeof next !== 'object') {
				current[segment] = {}
			}
			current = current[segment] as Record<string, unknown>
		}

		current[item.path[item.path.length - 1] ?? item.name] = item.name
	}

	const lines: string[] = []
	const writeNode = (node: Record<string, unknown>, depth: number) => {
		const indent = '\t'.repeat(depth)
		for (const [key, value] of Object.entries(node)) {
			if (value && typeof value === 'object') {
				lines.push(`${indent}${key}:`)
				writeNode(value as Record<string, unknown>, depth + 1)
			} else {
				lines.push(`${indent}${key}: ${String(value)}`)
			}
		}
	}

	writeNode(root, 1)
	return lines.join('\n')
}

export class EnvVarResolutionError extends Error {
	readonly code = 'ENV_VARS_MISSING'

	constructor(
		public readonly missing: MissingEnvVar[],
		public readonly mode: EnvResolutionMode
	) {
		super(
			['These environment variables are missing:', '', formatMissingEnvTree(missing)].join('\n')
		)
		this.name = 'EnvVarResolutionError'
	}
}

export class EnvVarParseError extends Error {
	readonly code = 'ENV_VAR_PARSE_FAILED'

	constructor(
		public readonly variableName: string,
		public readonly path: string[],
		cause: unknown
	) {
		super(
			`Could not parse environment variable ${variableName} for vars.${path.join('.')}.\n` +
				`Parser error: ${cause instanceof Error ? cause.message : String(cause)}`
		)
		this.name = 'EnvVarParseError'
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || isEnvVarDescriptor(value)) {
		return false
	}

	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

const OMIT_VALUE = Symbol('omit optional env var')

type ResolveValueResult = unknown | typeof OMIT_VALUE

function resolveDescriptorValue(
	descriptor: EnvVarDescriptor<unknown, boolean>,
	sources: Record<string, string | undefined>,
	path: string[],
	mode: EnvResolutionMode,
	missing: MissingEnvVar[]
): ResolveValueResult {
	const state = descriptor.__state
	const rawValue = sources[state.name]

	if (rawValue !== undefined) {
		try {
			return state.parser ? state.parser(rawValue) : rawValue
		} catch (error) {
			throw new EnvVarParseError(state.name, path, error)
		}
	}

	if (mode === 'dev' && state.hasDevDefault) {
		return state.devValue
	}

	// AFTER `.dev(value)` and BEFORE `.default(value)`. Chaining either with this one is contradictory, so
	// the order decides rather than the author: an explicit dev value is a deliberate statement about dev
	// and wins here, while `.default()` is a statement about every mode and loses to the one that names
	// this mode. Neither combination is worth rejecting — they just have to resolve the same way twice.
	if (mode === 'dev' && state.absentInDev) {
		return OMIT_VALUE
	}

	if (state.hasDefault) {
		return state.defaultValue
	}

	if (state.optional) {
		return OMIT_VALUE
	}

	missing.push({ path, name: state.name })
	return OMIT_VALUE
}

function resolveVarValue(
	value: unknown,
	sources: Record<string, string | undefined>,
	path: string[],
	mode: EnvResolutionMode,
	missing: MissingEnvVar[]
): ResolveValueResult {
	if (isEnvVarDescriptor(value)) {
		return resolveDescriptorValue(value, sources, path, mode, missing)
	}

	if (Array.isArray(value)) {
		return value
			.map((item, index) => resolveVarValue(item, sources, [...path, String(index)], mode, missing))
			.filter((item) => item !== OMIT_VALUE)
	}

	if (isPlainObject(value)) {
		const resolved: Record<string, unknown> = {}
		for (const [key, childValue] of Object.entries(value)) {
			const child = resolveVarValue(childValue, sources, [...path, key], mode, missing)
			if (child !== OMIT_VALUE) {
				resolved[key] = child
			}
		}
		return resolved
	}

	return value
}

function resolveVarsObject(
	vars: DevflareConfig['vars'],
	sources: Record<string, string | undefined>,
	mode: EnvResolutionMode,
	missing: MissingEnvVar[]
): DevflareConfig['vars'] {
	if (!vars) {
		return vars
	}

	const resolved = resolveVarValue(vars, sources, [], mode, missing)
	return resolved === OMIT_VALUE ? undefined : (resolved as DevflareConfig['vars'])
}

export interface ResolveConfigEnvVarsOptions {
	/**
	 * Directory used to resolve relative config paths.
	 *
	 * @default process.cwd()
	 */
	cwd: string

	/**
	 * Optional config path. When present, `.env` discovery starts from the
	 * config file's directory rather than `cwd`.
	 */
	configPath?: string

	/**
	 * Resolution mode. Build mode fails on missing required variables; dev mode
	 * may use `.dev()` defaults before reporting missing values.
	 *
	 * @default 'build'
	 */
	mode: EnvResolutionMode
}

/**
 * Resolve all `env.NAME` descriptors under a config's `vars` object.
 *
 * @throws {EnvVarResolutionError} When required environment variables are missing.
 * @throws {EnvVarParseError} When a descriptor parser throws.
 *
 * @example
 * ```ts
 * const resolved = await resolveConfigEnvVars(config, {
 *   cwd: process.cwd(),
 *   mode: 'build'
 * })
 * ```
 */
export async function resolveConfigEnvVars<TConfig extends DevflareConfig>(
	config: TConfig,
	options: ResolveConfigEnvVarsOptions
): Promise<TConfig> {
	const startDir = options.configPath
		? dirname(resolve(options.cwd, options.configPath))
		: options.cwd
	const dotenv = await loadDevflareDotenv(startDir)
	const sources: Record<string, string | undefined> = {
		...dotenv.values,
		...process.env
	}
	const missing: MissingEnvVar[] = []
	const vars = resolveVarsObject(config.vars, sources, options.mode, missing)

	if (missing.length > 0) {
		throw new EnvVarResolutionError(missing, options.mode)
	}

	return vars === config.vars
		? config
		: ({
				...config,
				vars
			} as TConfig)
}
