import { type ConsolaInstance } from 'consola'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { getPrimaryAccount } from '../../cloudflare/account'
import { CloudflareAPIError, AuthenticationError, type APIClientOptions } from '../../cloudflare/api'
import { getWorkspaceAccountId } from '../../cloudflare/preferences'
import type { AccountOwnedAPIToken } from '../../cloudflare/types'
import { createCliTheme, dim, green, logLine, logTable, whiteDim, yellow } from '../ui'
import {
	createAccountOwnedAPIToken,
	deleteAccountOwnedAPIToken,
	filterDevflareManagedTokens,
	listAccountOwnedAPITokens,
	listAccountTokenPermissionGroups,
	normalizeDevflareTokenName,
	selectAllReusablePermissionGroups,
	selectDevflarePermissionGroups
} from '../../cloudflare/tokens'

const CLI_API_OPTIONS: APIClientOptions = { timeout: 10000 }
const TOKENS_USAGE = 'Usage: devflare tokens <bootstrap-token> (--list | --new [token-name] | --delete [token-name] | --delete-all) [--account <id>] [--all-flags]'

type TokenOperation =
	| { kind: 'list' }
	| { kind: 'new'; requestedName?: string }
	| { kind: 'delete'; requestedName?: string }
	| { kind: 'delete-all' }

function getTrimmedStringOption(
	options: ParsedArgs['options'],
	key: string
): string | undefined {
	const value = options[key]
	if (typeof value !== 'string') {
		return undefined
	}

	const trimmedValue = value.trim()
	return trimmedValue || undefined
}

function formatTokenTimestamp(value?: Date): string {
	if (!value) {
		return '—'
	}

	return value.toISOString().replace(/:\d{2}\.\d{3}Z$/, 'Z').replace('T', ' ')
}

function sortTokens(tokens: AccountOwnedAPIToken[]): AccountOwnedAPIToken[] {
	return [...tokens].sort((left, right) => {
		const nameComparison = left.name.localeCompare(right.name)
		if (nameComparison !== 0) {
			return nameComparison
		}

		return (right.modifiedOn?.getTime() ?? 0) - (left.modifiedOn?.getTime() ?? 0)
	})
}

function logUsage(logger: ConsolaInstance, theme: ReturnType<typeof createCliTheme>): void {
	logger.error(TOKENS_USAGE)
	logLine(logger, dim('The bootstrap token must include Cloudflare API token management permissions.', theme))
}

function resolveTokenOperation(parsed: ParsedArgs): TokenOperation | string {
	const newOption = parsed.options.new ?? parsed.options.name
	const deleteOption = parsed.options.delete
	const requestedOperations = [
		newOption !== undefined ? 'new' : null,
		deleteOption !== undefined ? 'delete' : null,
		parsed.options.list === true ? 'list' : null,
		parsed.options['delete-all'] === true ? 'delete-all' : null
	].filter(Boolean) as Array<'new' | 'delete' | 'list' | 'delete-all'>
	const useLegacyCreateAlias = parsed.command === 'token' && requestedOperations.length === 0

	if (parsed.options['all-flags'] && !requestedOperations.includes('new') && !useLegacyCreateAlias) {
		return '--all-flags can only be used together with --new.'
	}

	if (requestedOperations.length === 0) {
		if (useLegacyCreateAlias) {
			return {
				kind: 'new',
				requestedName: getTrimmedStringOption(parsed.options, 'name')
			}
		}

		return 'Choose one token operation: --list, --new, --delete, or --delete-all.'
	}

	if (requestedOperations.length > 1) {
		return 'Choose only one token operation at a time.'
	}

	switch (requestedOperations[0]) {
		case 'new':
			return {
				kind: 'new',
				requestedName: typeof newOption === 'string' ? newOption.trim() || undefined : undefined
			}

		case 'delete':
			return {
				kind: 'delete',
				requestedName: typeof deleteOption === 'string' ? deleteOption.trim() || undefined : undefined
			}

		case 'list':
			return { kind: 'list' }

		case 'delete-all':
			return { kind: 'delete-all' }
	}
}

async function promptForTokenName(
	logger: ConsolaInstance,
	theme: ReturnType<typeof createCliTheme>,
	message: string
): Promise<string | null> {
	while (true) {
		const selected = await logger.prompt(message, {
			type: 'text',
			placeholder: 'preview',
			cancel: 'symbol'
		})

		if (typeof selected === 'symbol') {
			logLine(logger, dim('Cancelled', theme))
			return null
		}

		const trimmedValue = selected.trim()
		if (trimmedValue) {
			return trimmedValue
		}

		logger.error('Token name is required.')
	}
}

async function resolveTokenName(
	requestedName: string | undefined,
	logger: ConsolaInstance,
	theme: ReturnType<typeof createCliTheme>,
	promptMessage: string
): Promise<string | null> {
	const rawName = requestedName ?? await promptForTokenName(logger, theme, promptMessage)
	if (!rawName) {
		return null
	}

	return normalizeDevflareTokenName(rawName)
}

async function resolveRequestedAccountId(
	requestedAccountId: string | undefined,
	bootstrapToken: string
): Promise<{ accountId: string; source: string }> {
	if (requestedAccountId) {
		return { accountId: requestedAccountId, source: 'flag' }
	}

	const workspaceAccountId = getWorkspaceAccountId()
	if (workspaceAccountId) {
		return {
			accountId: workspaceAccountId,
			source: 'workspace'
		}
	}

	const primaryAccount = await getPrimaryAccount({
		...CLI_API_OPTIONS,
		token: bootstrapToken
	})
	if (!primaryAccount) {
		throw new Error('No Cloudflare accounts found for this bootstrap token')
	}

	return {
		accountId: primaryAccount.id,
		source: 'primary'
	}
}

async function createManagedToken(
	accountId: string,
	accountSource: string,
	bootstrapToken: string,
	requestedName: string | undefined,
	includeAllFlags: boolean,
	logger: ConsolaInstance,
	theme: ReturnType<typeof createCliTheme>
): Promise<CliResult> {
	const tokenName = await resolveTokenName(
		requestedName,
		logger,
		theme,
		'Enter a Devflare token name:'
	)
	if (!tokenName) {
		return { exitCode: 0 }
	}

	logLine(logger)
	logLine(logger, `${yellow('tokens', theme)} ${dim('Creating an account-owned Devflare token…', theme)}`)
	logLine(logger, `${dim('Account:', theme)} ${green(accountId, theme)} ${whiteDim(`(${accountSource})`, theme)}`)
	logLine(logger, `${dim('Name:', theme)} ${green(tokenName, theme)}`)

	const permissionGroups = await listAccountTokenPermissionGroups(accountId, {
		...CLI_API_OPTIONS,
		token: bootstrapToken
	})

	if (permissionGroups.length === 0) {
		logger.error('Cloudflare returned zero account token permission groups for this account.')
		return { exitCode: 1 }
	}

	const selectedPermissionGroups = includeAllFlags
		? selectAllReusablePermissionGroups(permissionGroups)
		: selectDevflarePermissionGroups(permissionGroups)

	const createdToken = await createAccountOwnedAPIToken(
		accountId,
		{
			name: tokenName,
			permissionGroupIds: selectedPermissionGroups.map((group) => group.id)
		},
		{
			...CLI_API_OPTIONS,
			token: bootstrapToken
		}
	)

	if (!createdToken.value) {
		logger.error('Cloudflare created the token but did not return a token value.')
		return { exitCode: 1 }
	}

	logger.success(`Created ${createdToken.name || tokenName}`)
	logLine(
		logger,
		`${dim('Permission groups:', theme)} ${selectedPermissionGroups.length} ${includeAllFlags ? 'reusable account-scoped' : 'Devflare-relevant account-scoped'} selected from ${permissionGroups.length} available`
	)
	if (includeAllFlags) {
		logLine(
			logger,
			dim(
				'Account-owned tokens only accept account-scoped permission groups, so zone/user-scoped groups are skipped automatically.',
				theme
			)
		)
		logLine(
			logger,
			dim(
				'Account API Tokens permissions are still excluded because Cloudflare does not allow sub-tokens to manage other tokens.',
				theme
			)
		)
	}
	logger.warn('Cloudflare only returns the token secret once. Store it safely now.')
	logger.log(createdToken.value)

	return {
		exitCode: 0,
		output: createdToken.value
	}
}

async function listManagedTokens(
	accountId: string,
	accountSource: string,
	bootstrapToken: string,
	logger: ConsolaInstance,
	theme: ReturnType<typeof createCliTheme>
): Promise<CliResult> {
	logLine(logger)
	logLine(logger, `${yellow('tokens', theme)} ${dim('Listing Devflare-managed account-owned tokens…', theme)}`)
	logLine(logger, `${dim('Account:', theme)} ${green(accountId, theme)} ${whiteDim(`(${accountSource})`, theme)}`)

	const accountTokens = await listAccountOwnedAPITokens(accountId, {
		...CLI_API_OPTIONS,
		token: bootstrapToken
	})
	const managedTokens = sortTokens(filterDevflareManagedTokens(accountTokens))

	if (managedTokens.length === 0) {
		logLine(logger, dim('No Devflare-managed account-owned tokens found for this account.', theme))
		return { exitCode: 0, output: '' }
	}

	logTable(logger, {
		title: 'Devflare-managed tokens',
		rows: managedTokens,
		columns: [
			{
				label: 'Name',
				value: (token) => token.name,
				width: 46
			},
			{
				label: 'Status',
				value: (token) => token.status ?? 'unknown',
				width: 10
			},
			{
				label: 'Token ID',
				value: (token) => token.id.slice(0, 12),
				width: 12
			},
			{
				label: 'Modified',
				value: (token) => formatTokenTimestamp(token.modifiedOn)
			}
		],
		theme
	})

	const untouchedTokenCount = accountTokens.length - managedTokens.length
	if (untouchedTokenCount > 0) {
		logLine(
			logger,
			dim(`Left ${untouchedTokenCount} non-Devflare token(s) out of this list.`, theme)
		)
	}

	return {
		exitCode: 0,
		output: managedTokens.map((token) => token.name).join('\n')
	}
}

async function deleteManagedTokensByName(
	accountId: string,
	accountSource: string,
	bootstrapToken: string,
	requestedName: string | undefined,
	logger: ConsolaInstance,
	theme: ReturnType<typeof createCliTheme>
): Promise<CliResult> {
	const tokenName = await resolveTokenName(
		requestedName,
		logger,
		theme,
		'Enter the Devflare token name to delete:'
	)
	if (!tokenName) {
		return { exitCode: 0 }
	}

	logLine(logger)
	logLine(logger, `${yellow('tokens', theme)} ${dim('Deleting a Devflare-managed account-owned token…', theme)}`)
	logLine(logger, `${dim('Account:', theme)} ${green(accountId, theme)} ${whiteDim(`(${accountSource})`, theme)}`)
	logLine(logger, `${dim('Name:', theme)} ${green(tokenName, theme)}`)

	const accountTokens = await listAccountOwnedAPITokens(accountId, {
		...CLI_API_OPTIONS,
		token: bootstrapToken
	})
	const matchingTokens = filterDevflareManagedTokens(accountTokens).filter((token) => token.name === tokenName)

	if (matchingTokens.length === 0) {
		logger.error(`No Devflare-managed token named ${tokenName} was found.`)
		return { exitCode: 1 }
	}

	if (matchingTokens.length > 1) {
		logLine(
			logger,
			dim(`Found ${matchingTokens.length} tokens with that name. Deleting all exact matches.`, theme)
		)
	}

	for (const token of matchingTokens) {
		await deleteAccountOwnedAPIToken(accountId, token.id, {
			...CLI_API_OPTIONS,
			token: bootstrapToken
		})
	}

	logger.success(`Deleted ${matchingTokens.length} Devflare-managed token(s) named ${tokenName}`)

	return {
		exitCode: 0,
		output: matchingTokens.map((token) => token.id).join('\n')
	}
}

async function deleteAllManagedTokens(
	accountId: string,
	accountSource: string,
	bootstrapToken: string,
	logger: ConsolaInstance,
	theme: ReturnType<typeof createCliTheme>
): Promise<CliResult> {
	logLine(logger)
	logLine(logger, `${yellow('tokens', theme)} ${dim('Deleting all Devflare-managed account-owned tokens…', theme)}`)
	logLine(logger, `${dim('Account:', theme)} ${green(accountId, theme)} ${whiteDim(`(${accountSource})`, theme)}`)

	const accountTokens = await listAccountOwnedAPITokens(accountId, {
		...CLI_API_OPTIONS,
		token: bootstrapToken
	})
	const managedTokens = filterDevflareManagedTokens(accountTokens)

	if (managedTokens.length === 0) {
		logger.success('No Devflare-managed tokens were found, so nothing was deleted.')
		return { exitCode: 0 }
	}

	for (const token of managedTokens) {
		await deleteAccountOwnedAPIToken(accountId, token.id, {
			...CLI_API_OPTIONS,
			token: bootstrapToken
		})
	}

	logger.success(`Deleted ${managedTokens.length} Devflare-managed token(s)`)

	const untouchedTokenCount = accountTokens.length - managedTokens.length
	if (untouchedTokenCount > 0) {
		logLine(
			logger,
			dim(`Left ${untouchedTokenCount} non-Devflare token(s) untouched.`, theme)
		)
	}

	return {
		exitCode: 0,
		output: managedTokens.map((token) => token.id).join('\n')
	}
}

export async function runTokenCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	_options: CliOptions
): Promise<CliResult> {
	const bootstrapToken = parsed.args[0]?.trim()
	const theme = createCliTheme(parsed.options)
	if (!bootstrapToken) {
		logUsage(logger, theme)
		return { exitCode: 1 }
	}

	const tokenOperation = resolveTokenOperation(parsed)
	if (typeof tokenOperation === 'string') {
		logger.error(tokenOperation)
		logUsage(logger, theme)
		return { exitCode: 1 }
	}

	const requestedAccountId = getTrimmedStringOption(parsed.options, 'account')

	try {
		const { accountId, source } = await resolveRequestedAccountId(requestedAccountId, bootstrapToken)

		switch (tokenOperation.kind) {
			case 'new':
				return createManagedToken(
					accountId,
					source,
					bootstrapToken,
					tokenOperation.requestedName,
					parsed.options['all-flags'] === true,
					logger,
					theme
				)

			case 'list':
				return listManagedTokens(accountId, source, bootstrapToken, logger, theme)

			case 'delete':
				return deleteManagedTokensByName(
					accountId,
					source,
					bootstrapToken,
					tokenOperation.requestedName,
					logger,
					theme
				)

			case 'delete-all':
				return deleteAllManagedTokens(accountId, source, bootstrapToken, logger, theme)
		}
	} catch (error) {
		if (error instanceof AuthenticationError) {
			logger.error(error.message)
			return { exitCode: 1 }
		}

		if (error instanceof CloudflareAPIError) {
			logger.error(`API Error: ${error.message}`)
			return { exitCode: 1 }
		}

		if (error instanceof Error) {
			logger.error(error.message)
			return { exitCode: 1 }
		}

		throw error
	}
}