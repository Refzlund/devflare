import { readFile } from 'node:fs/promises'
import { resolve } from 'pathe'
import { LOCAL_DEV_VARS_ENV } from './local-dev-vars-switch'
import type { DevflareConfig } from './schema'

export { LOCAL_DEV_VARS_ENV }

/**
 * @description Whether the local-vars overlay applies, as {@link LOCAL_DEV_VARS_ENV} says.
 * @param environment - the environment to read; `process.env` when omitted
 * @returns `false` for `0`, `false`, `no` or `off`; `true` for `1`, `true`, `yes`, `on`, empty or
 *   unset. Case and surrounding space are ignored.
 * @throws When the variable holds any other value. A launcher sets it to keep the overlay off, so a
 *   misspelled value refuses rather than quietly leaving the overlay on.
 */
export function localDevVarsEnabled(
	environment: Record<string, string | undefined> = process.env
): boolean {
	const raw = environment[LOCAL_DEV_VARS_ENV]
	const configured = raw?.trim().toLowerCase()
	if (!configured || ['1', 'true', 'yes', 'on'].includes(configured)) {
		return true
	}
	if (['0', 'false', 'no', 'off'].includes(configured)) {
		return false
	}

	throw new Error(
		`${LOCAL_DEV_VARS_ENV} is "${raw}": set it to 0, false, no or off to keep .dev.vars and .env ` +
			'off a config’s vars, or to 1, true, yes or on (or leave it unset) to lay them over'
	)
}

export interface LoadLocalDevVarsOptions {
	cwd: string
	configPath?: string
	environment?: string
	vars?: Record<string, unknown>
	secrets?: DevflareConfig['secrets']
	silent?: boolean
}

function parseEnvValue(value: string): string {
	const trimmed = value.trim()
	const quote = trimmed[0]

	if (
		(quote === '"' || quote === "'" || quote === '`') &&
		trimmed.endsWith(quote) &&
		trimmed.length >= 2
	) {
		const inner = trimmed.slice(1, -1)
		return quote === '"'
			? inner
					.replace(/\\n/g, '\n')
					.replace(/\\r/g, '\r')
					.replace(/\\t/g, '\t')
					.replace(/\\"/g, '"')
					.replace(/\\\\/g, '\\')
			: inner
	}

	const commentIndex = trimmed.search(/\s+#/)
	return (commentIndex >= 0 ? trimmed.slice(0, commentIndex) : trimmed).trimEnd()
}

function parseEnvFile(contents: string): Record<string, string> {
	const vars: Record<string, string> = {}

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

		vars[key] = parseEnvValue(assignment.slice(equalsIndex + 1))
	}

	return vars
}

async function readOptionalEnvFile(filePath: string): Promise<Record<string, string> | null> {
	try {
		return parseEnvFile(await readFile(filePath, 'utf8'))
	} catch (error) {
		if ((error as { code?: unknown }).code === 'ENOENT') {
			return null
		}

		throw error
	}
}

async function loadWranglerCompatibleLocalVars(
	cwd: string,
	environment: string | undefined
): Promise<Record<string, string>> {
	const environmentDevVars = environment
		? await readOptionalEnvFile(resolve(cwd, `.dev.vars.${environment}`))
		: null
	if (environmentDevVars) {
		return environmentDevVars
	}

	const devVars = await readOptionalEnvFile(resolve(cwd, '.dev.vars'))
	if (devVars) {
		return devVars
	}

	// → NOTE: deliberately NOT the same list as `env-vars.ts`'s, and it must not be kept in step with it.
	//   This one exists to be WRANGLER-COMPATIBLE — these are the files wrangler itself reads for local
	//   secrets, in wrangler's order. `env-vars.ts` reads `.env.public`/`.env.dev`/`.env` for config-time
	//   `env.NAME` descriptors, which is Devflare's own mechanism. Adding `.env.public` here would break the
	//   compatibility this function is named for, since wrangler has no such file.
	const envFiles = [
		'.env',
		'.env.local',
		...(environment ? [`.env.${environment}`, `.env.${environment}.local`] : [])
	]
	const merged: Record<string, string> = {}

	for (const fileName of envFiles) {
		const values = await readOptionalEnvFile(resolve(cwd, fileName))
		if (values) {
			Object.assign(merged, values)
		}
	}

	return merged
}

export function toWranglerSecretsConfig(
	secrets: DevflareConfig['secrets'] | undefined
): { required: string[] } | undefined {
	if (!secrets) {
		return undefined
	}

	const required = Object.entries(secrets)
		.filter(([, config]) => config.required !== false)
		.map(([name]) => name)
		.sort()

	return required.length > 0 ? { required } : undefined
}

export async function loadLocalDevVars(
	options: LoadLocalDevVarsOptions
): Promise<Record<string, unknown>> {
	const activeEnvironment = options.environment ?? process.env.CLOUDFLARE_ENV
	const localVars = await loadWranglerCompatibleLocalVars(options.cwd, activeEnvironment)
	const secretNames = toWranglerSecretsConfig(options.secrets)?.required
	const filteredLocalVars = secretNames
		? Object.fromEntries(Object.entries(localVars).filter(([name]) => secretNames.includes(name)))
		: localVars

	return {
		...(options.vars ?? {}),
		...filteredLocalVars
	}
}

/**
 * @description Lays the app directory's wrangler-compatible local-vars files over a config's `vars`,
 * as {@link loadLocalDevVars} reads them, unless {@link LOCAL_DEV_VARS_ENV} turns the overlay off.
 * @param config - the config, its `env.NAME` descriptors already resolved
 * @param options - where the files are read from; see {@link LoadLocalDevVarsOptions}
 * @returns the config with the files' values over its `vars`; the same config object when the overlay
 *   is off or there is nothing to lay
 */
export async function applyLocalDevVarsToConfig(
	config: DevflareConfig,
	options: Omit<LoadLocalDevVarsOptions, 'vars' | 'secrets'>
): Promise<DevflareConfig> {
	if (!localDevVarsEnabled()) {
		return config
	}

	const vars = await loadLocalDevVars({
		...options,
		vars: config.vars,
		secrets: config.secrets
	})

	if (Object.keys(vars).length === 0) {
		return config
	}

	return {
		...config,
		vars
	}
}
