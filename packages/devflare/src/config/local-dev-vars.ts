import { isAbsolute, resolve } from 'pathe'
import type { DevflareConfig } from './schema'

type WranglerDevVarBinding = {
	type: 'plain_text' | 'json' | 'secret_text'
	value: unknown
}

type WranglerDevVarsModule = {
	unstable_getVarsForDev: (
		configPath: string | undefined,
		envFiles: string[] | undefined,
		vars: Record<string, unknown>,
		env: string | undefined,
		silent?: boolean,
		secrets?: { required?: string[] }
	) => Record<string, WranglerDevVarBinding>
}

export interface LoadLocalDevVarsOptions {
	cwd: string
	configPath?: string
	environment?: string
	vars?: Record<string, string>
	secrets?: DevflareConfig['secrets']
	silent?: boolean
}

function resolveConfigPath(cwd: string, configPath: string | undefined): string {
	if (!configPath) {
		return resolve(cwd, 'devflare.config.ts')
	}

	return isAbsolute(configPath) ? configPath : resolve(cwd, configPath)
}

function stringifyBindingValue(value: unknown): string {
	if (typeof value === 'string') {
		return value
	}

	return JSON.stringify(value)
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

export async function loadLocalDevVars(options: LoadLocalDevVarsOptions): Promise<Record<string, string>> {
	const wrangler = await import('wrangler') as WranglerDevVarsModule
	const configPath = resolveConfigPath(options.cwd, options.configPath)
	const activeEnvironment = options.environment ?? process.env.CLOUDFLARE_ENV
	const bindings = wrangler.unstable_getVarsForDev(
		configPath,
		undefined,
		options.vars ?? {},
		activeEnvironment,
		options.silent ?? true,
		toWranglerSecretsConfig(options.secrets)
	)

	return Object.fromEntries(
		Object.entries(bindings).map(([name, binding]) => [name, stringifyBindingValue(binding.value)])
	)
}

export async function applyLocalDevVarsToConfig(
	config: DevflareConfig,
	options: Omit<LoadLocalDevVarsOptions, 'vars' | 'secrets'>
): Promise<DevflareConfig> {
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
