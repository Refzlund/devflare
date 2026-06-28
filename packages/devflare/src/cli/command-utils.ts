import { getPrimaryAccount } from '../cloudflare/account'
import type { APIClientOptions } from '../cloudflare/api'
import { getEffectiveAccountId, getWorkspaceAccountId } from '../cloudflare/preferences'
import { loadConfig, resolveConfigPath } from '../config/loader'

export type NamedSelectionSource = 'option' | 'arg' | 'config' | 'none'

export function asOptionalString(value: string | boolean | undefined): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function resolveNamedSelection(options: {
	explicitValue?: string
	fallbackValue?: string
	configuredValue?: string
}): {
	value?: string
	source: NamedSelectionSource
} {
	if (options.explicitValue) {
		return {
			value: options.explicitValue,
			source: 'option'
		}
	}

	if (options.fallbackValue) {
		return {
			value: options.fallbackValue,
			source: 'arg'
		}
	}

	if (options.configuredValue) {
		return {
			value: options.configuredValue,
			source: 'config'
		}
	}

	return {
		value: undefined,
		source: 'none'
	}
}

export async function getConfiguredAccountId(cwd: string): Promise<string | undefined> {
	const workspaceAccountId = getWorkspaceAccountId()
	if (workspaceAccountId) {
		return workspaceAccountId
	}

	const envAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
	if (envAccountId) {
		return envAccountId
	}

	const configPath = await resolveConfigPath(cwd)
	if (!configPath) {
		return undefined
	}

	try {
		const config = await loadConfig({ cwd })
		return config.accountId
	} catch {
		return undefined
	}
}

export async function resolveCloudflareAccountId(options: {
	explicitAccountId?: string
	configuredAccountId?: string
	apiOptions?: APIClientOptions
}): Promise<string | undefined> {
	if (options.explicitAccountId) {
		return options.explicitAccountId
	}

	if (options.configuredAccountId) {
		return options.configuredAccountId
	}

	const primaryAccount = await getPrimaryAccount(options.apiOptions)
	if (!primaryAccount) {
		return undefined
	}

	const effective = await getEffectiveAccountId(primaryAccount.id)
	return effective.accountId
}
