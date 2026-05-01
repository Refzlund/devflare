import { readFile } from 'node:fs/promises'
import { resolve } from 'pathe'
import type { DevflareConfig } from './schema'

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
