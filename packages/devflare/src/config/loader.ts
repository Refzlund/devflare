// =============================================================================
// Config Loader — Load devflare.config.ts via c12
// =============================================================================

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'pathe'
import { loadWithC12 } from './c12'
import { resolveConfigRefs } from './config-refs'
import { loadDevflareDotenvIntoProcess } from './env-vars'
import { applyFrameworkConfigProviders } from './framework-providers'
import { configSchema, type DevflareConfig } from './schema'
import { normalizeSchemaIssues, type SchemaIssue, type ValidationIssue } from './validation-issues'

/**
 * Options for loading config
 */
export interface LoadConfigOptions {
	/** Working directory to search for config */
	cwd?: string
	/** Custom config file name */
	configFile?: string
	/**
	 * Environment name for env-specific overrides. NOT read by `loadConfig`, which returns the base
	 * config with every `env.<name>` entry still in it: `loadResolvedConfig` merges this one, and so
	 * does `compileBuildConfig(config, environment)`.
	 */
	environment?: string
	/**
	 * Whether to run the dotenv layer before the config is evaluated: copy `.env.public`, `.env.dev`
	 * and `.env` from the config's directory and every ancestor into `process.env`, for each name
	 * the process leaves unset. Every command runs it; pass `false` to evaluate the config against
	 * `process.env` as it stands.
	 *
	 * → KEY: `false` is for a script that must see the config as a deploy compiles it but must NOT
	 *   let the machine's untracked `.env` files decide the answer — a predeploy guard evaluating
	 *   under a built environment, which grades those files separately with `loadDevflareDotenv`.
	 *   The dotenv layer is the only step it skips: the file c12 picks, its `extends` layers, the
	 *   schema, `ref()` resolution and the framework providers are the same either way.
	 * → GOTCHA: it cannot stop the RUNTIME's own dotenv loading. Bun reads `.env`, `.env.local` and
	 *   `.env.<NODE_ENV>` from the working directory before any script runs, so a process that must
	 *   not see them is started with `bun --no-env-file`.
	 *
	 * @default true
	 */
	dotenv?: boolean
}

/**
 * Config file names to search for, in order of priority
 */
const CONFIG_FILES = [
	'devflare.config.ts',
	'devflare.config.mts',
	'devflare.config.js',
	'devflare.config.mjs'
]

async function resolveConfigDotenvDirectory(cwd: string, configFile: string): Promise<string> {
	const explicitConfigPath = resolve(cwd, configFile)
	if (existsSync(explicitConfigPath)) {
		return dirname(explicitConfigPath)
	}

	const discoveredConfigPath = await resolveConfigPath(cwd)
	return discoveredConfigPath ? dirname(discoveredConfigPath) : cwd
}

/**
 * Resolve the config file path in a directory
 *
 * @param cwd - Directory to search in
 * @returns Path to config file or undefined
 */
export async function resolveConfigPath(cwd: string): Promise<string | undefined> {
	for (const file of CONFIG_FILES) {
		const path = join(cwd, file)
		if (existsSync(path)) {
			return path
		}
	}
	return undefined
}

/**
 * Load and validate devflare configuration
 *
 * @param options - Loading options
 * @returns Validated DevflareConfig
 * @throws When config file not found or validation fails
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<DevflareConfig> {
	const cwd = resolve(options.cwd ?? process.cwd())
	const configFile = options.configFile ?? 'devflare.config'

	if (options.dotenv !== false) {
		await loadDevflareDotenvIntoProcess(await resolveConfigDotenvDirectory(cwd, configFile))
	}

	const { config, configFile: loadedFile } = await loadWithC12<DevflareConfig>({
		name: 'devflare',
		cwd,
		configFile,
		defaultConfig: undefined,
		rcFile: false,
		globalRc: false,
		dotenv: false
	})

	// Check if config was found
	if (!config || !loadedFile) {
		throw new ConfigNotFoundError(cwd, configFile)
	}

	// Validate config
	const result = configSchema.safeParse(config)
	if (!result.success) {
		throw new ConfigValidationError(result.error.issues, loadedFile)
	}

	// Before any consumer reads a binding: an unresolved ref() names its worker `<pending>`.
	await resolveConfigRefs(result.data, loadedFile)

	return applyFrameworkConfigProviders(result.data, {
		cwd,
		configPath: loadedFile
	})
}

/**
 * Error thrown when config file is not found
 */
export class ConfigNotFoundError extends Error {
	readonly code = 'CONFIG_NOT_FOUND'

	constructor(
		public readonly cwd: string,
		public readonly configFile: string
	) {
		super(
			`Config file not found in ${cwd}.\n` +
				`Expected one of: ${CONFIG_FILES.join(', ')}\n` +
				`Run 'devflare init' to create a new config.`
		)
		this.name = 'ConfigNotFoundError'
	}
}

/**
 * Error thrown when config validation fails
 */
export class ConfigValidationError extends Error {
	readonly code = 'CONFIG_VALIDATION_ERROR'

	/** Each problem found, with the path to the offending field. */
	public readonly issues: ValidationIssue[]

	/**
	 * @param issues - the schema's issues, as zod reports them
	 * @param configFile - the config file that failed validation
	 */
	constructor(
		issues: ReadonlyArray<SchemaIssue>,
		public readonly configFile: string
	) {
		const normalized = normalizeSchemaIssues(issues)
		const issueMessages = normalized.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')

		super(`Invalid config in ${configFile}:\n${issueMessages}`)
		this.name = 'ConfigValidationError'
		this.issues = normalized
	}
}

export {
	ConfigResourceResolutionError,
	type LoadResolvedConfigOptions,
	loadResolvedConfig
} from './resource-resolution'
