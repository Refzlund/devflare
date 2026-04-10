// =============================================================================
// CLI Account Command
// =============================================================================
// `devflare account` — View account info, usage, and limits
// =============================================================================

import type { ConsolaInstance } from 'consola'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { CYAN, CYAN_BOLD, DIM, RESET } from '../colors'
import {
	account,
	CloudflareAPIError,
	AuthenticationError,
	type APIClientOptions
} from '../../cloudflare'
import { loadConfig, resolveConfigPath } from '../../config/loader'
import {
	getGlobalDefaultAccountId,
	setGlobalDefaultAccountId,
	getWorkspaceAccountId,
	setWorkspaceAccountId,
} from '../../cloudflare/preferences'
import {
	type CliTheme,
	bold,
	createCliTheme,
	dim,
	formatCommand,
	formatLabelValue,
	green,
	logLine,
	logTable,
	whiteDim,
	yellow
} from '../ui'

// -----------------------------------------------------------------------------
// Subcommands
// -----------------------------------------------------------------------------

type AccountSubcommand =
	| 'info'
	| 'workers'
	| 'kv'
	| 'd1'
	| 'r2'
	| 'vectorize'
	| 'limits'
	| 'usage'
	| 'global'
	| 'workspace'

const ACCOUNT_SUBCOMMANDS: AccountSubcommand[] = [
	'info',
	'workers',
	'kv',
	'd1',
	'r2',
	'vectorize',
	'limits',
	'usage',
	'global',
	'workspace'
]

function isAccountSubcommand(value: string): value is AccountSubcommand {
	return ACCOUNT_SUBCOMMANDS.includes(value as AccountSubcommand)
}

// CLI commands use a 10-second timeout to avoid long hangs
const CLI_API_OPTIONS: APIClientOptions = { timeout: 10000 }

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function getConfiguredAccountId(cwd: string): Promise<string | undefined> {
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

function formatDate(date: Date | undefined): string {
	if (!date) return 'N/A'
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	})
}

function formatPercent(value: number | undefined): string {
	if (value === undefined) return 'N/A'
	return `${value.toFixed(1)}%`
}

function formatUsageBar(used: number, limit: number | undefined): string {
	if (!limit) return '━'.repeat(20)

	const percent = Math.min((used / limit) * 100, 100)
	const filled = Math.round((percent / 100) * 20)
	const empty = 20 - filled

	const color = percent > 90 ? '🔴' : percent > 70 ? '🟠' : '🟢'
	return `${color} ${'█'.repeat(filled)}${'░'.repeat(empty)} ${used}/${limit}`
}

function logSection(
	logger: ConsolaInstance,
	title: string,
	theme: CliTheme,
	count?: number,
	accent: 'cyan' | 'yellow' | 'green' = 'cyan'
): void {
	logLine(logger)
	const heading = accent === 'yellow'
		? yellow(title, theme)
		: accent === 'green'
			? green(title, theme)
			: bold(title, theme)
	logLine(logger, `${heading}${count === undefined ? '' : ` ${dim(`(${count})`, theme)}`}`)
}

function logEmptyState(logger: ConsolaInstance, message: string, theme: CliTheme): CliResult {
	logLine(logger)
	logLine(logger, dim(message, theme))
	logLine(logger)
	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// Main Command
// -----------------------------------------------------------------------------

export async function runAccountCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const theme = createCliTheme(parsed.options)
	// Check authentication first
	const isAuth = await account.isAuthenticated()
	if (!isAuth) {
		logger.error('Not authenticated with Cloudflare')
		logLine(logger, dim('Run: devflare login', theme))
		return { exitCode: 1 }
	}

	// Get subcommand
	const subcommand = parsed.args[0] as AccountSubcommand | undefined
	const rawSubcommand = parsed.args[0]

	if (rawSubcommand && !isAccountSubcommand(rawSubcommand)) {
		logger.error(`Unknown account subcommand: ${rawSubcommand}`)
		logLine(logger, dim(`Available account subcommands: ${ACCOUNT_SUBCOMMANDS.join(', ')}`, theme))
		return { exitCode: 1 }
	}

	if (subcommand === 'global') {
		return await selectGlobalAccount(logger, theme)
	}

	if (subcommand === 'workspace') {
		return await selectWorkspaceAccount(logger, theme)
	}

	try {
		// Get account ID from args or use primary account
		let accountId = parsed.options.account as string | undefined

		if (!accountId) {
			accountId = await getConfiguredAccountId(options.cwd ?? process.cwd())
		}

		if (!accountId) {
			const primary = await account.getPrimaryAccount()
			if (!primary) {
				logger.error('No Cloudflare accounts found')
				return { exitCode: 1 }
			}
			accountId = primary.id
		}

		switch (subcommand) {
			case 'workers':
					return await showWorkers(accountId, logger, theme)

			case 'kv':
					return await showKV(accountId, logger, theme)

			case 'd1':
					return await showD1(accountId, logger, theme)

			case 'r2':
					return await showR2(accountId, logger, theme)

			case 'vectorize':
					return await showVectorize(accountId, logger, theme)

			case 'limits':
					return await handleLimits(accountId, parsed, logger, theme)

			case 'usage':
					return await showUsage(accountId, logger, theme)

			case 'info':
			default:
					return await showAccountOverview(accountId, logger, theme)
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

		// Handle timeout errors (AbortError or our custom timeout message)
		if (error instanceof Error) {
			if (error.name === 'AbortError' || error.message.includes('timed out')) {
				logger.error('Request timed out. The Cloudflare API is slow or unavailable.')
				return { exitCode: 1 }
			}
			// Log unexpected errors
			logger.error(`Error: ${error.message}`)
			return { exitCode: 1 }
		}

		throw error
	}
}

// -----------------------------------------------------------------------------
// Account Overview
// -----------------------------------------------------------------------------

async function showAccountOverview(
	accountId: string,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	logSection(logger, 'Accounts', theme)

	let accounts = [] as Awaited<ReturnType<typeof account.getAccounts>>
	let limitedAccountView = false

	try {
		accounts = await account.getAccounts()
	} catch {
		const fallbackAccount = await account.getAccountById(accountId)
		if (!fallbackAccount) {
			logger.error('Could not inspect Cloudflare accounts with the current credentials')
			return { exitCode: 1 }
		}

		accounts = [fallbackAccount]
		limitedAccountView = true
	}

	if (accounts.length === 0) {
		logger.error('No Cloudflare accounts found')
		return { exitCode: 1 }
	}

	// Get workspace and global defaults
	const workspaceId = getWorkspaceAccountId()
	const globalId = await getGlobalDefaultAccountId(accountId)

	if (limitedAccountView) {
		logLine(logger, dim('Using the configured account directly because the current credentials cannot enumerate all Cloudflare accounts.', theme))
	}

	// Show all accounts with proper badges
	for (let i = 0; i < accounts.length; i++) {
		const acc = accounts[i]
		const isWorkspace = acc.id === workspaceId
		const isGlobal = acc.id === globalId

		// Build badge string
		let badge = ''
		if (isWorkspace) {
			badge = ` ${CYAN_BOLD}(workspace)${RESET}`
		} else if (isGlobal) {
			// If another account is workspace, dim the global badge
			badge = workspaceId
				? ` ${DIM}(global)${RESET}`
				: ` ${CYAN}(global)${RESET}`
		}

		if (i > 0) {
			logLine(logger)
		}
		logLine(logger, `${dim('account', theme)} ${green(acc.name, theme)}${badge}`)
		logLine(logger, formatLabelValue('id', whiteDim(acc.id, theme), theme, 10))
		logLine(logger, formatLabelValue('type', acc.type, theme, 10))
	}

	logSection(logger, 'Commands', theme)
	logLine(logger, formatCommand('devflare account global', 'Set global default account', theme))
	logLine(logger, formatCommand('devflare account workspace', 'Set workspace account', theme))
	logLine(logger, formatCommand('devflare account workers', 'List Workers', theme))
	logLine(logger, formatCommand('devflare account kv', 'List KV namespaces', theme))
	logLine(logger, formatCommand('devflare account d1', 'List D1 databases', theme))
	logLine(logger, formatCommand('devflare account r2', 'List R2 buckets', theme))
	logLine(logger, formatCommand('devflare account vectorize', 'List Vectorize indexes', theme))
	logLine(logger, formatCommand('devflare account limits', 'View or set usage limits', theme))
	logLine(logger, formatCommand('devflare account usage', 'View detailed usage', theme))
	logLine(logger, formatCommand('devflare ai', 'View AI models and pricing', theme))
	logLine(logger)

	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// Account Selection (Global)
// -----------------------------------------------------------------------------

async function selectGlobalAccount(
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const accounts = await account.getAccounts()
	if (accounts.length === 0) {
		logger.error('No Cloudflare accounts found')
		return { exitCode: 1 }
	}

	if (accounts.length === 1) {
		// Only one account - auto-select it
		await setGlobalDefaultAccountId(accounts[0].id)
		logger.success(`Global default set to: ${accounts[0].name}`)
		return { exitCode: 0 }
	}

	// Get current global default for initial selection
	const currentGlobal = await getGlobalDefaultAccountId(accounts[0].id)

	// Build options for prompt
	const options = accounts.map((acc) => {
		const isCurrent = acc.id === currentGlobal
		return {
			label: isCurrent
				? `${acc.name} ${CYAN}(default)${RESET}`
				: acc.name,
			value: acc.id,
			hint: acc.id.substring(0, 8) + '...'
		}
	})

	// Show interactive select
	const selected = await logger.prompt('Select global default account:', {
		type: 'select',
		options,
		initial: currentGlobal ?? accounts[0].id
	})

	// Handle cancel
	if (!selected || typeof selected === 'symbol') {
		logLine(logger, dim('Cancelled', theme))
		return { exitCode: 0 }
	}

	// Save the selection
	await setGlobalDefaultAccountId(selected, accounts[0].id)

	// Find the account name
	const selectedAccount = accounts.find((a) => a.id === selected)
	logger.success(`Global default set to: ${selectedAccount?.name}`)
	logLine(logger, `${dim('saved to', theme)} ~/.devflare/preferences.json + cloud KV`)

	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// Account Selection (Workspace)
// -----------------------------------------------------------------------------

async function selectWorkspaceAccount(
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const accounts = await account.getAccounts()
	if (accounts.length === 0) {
		logger.error('No Cloudflare accounts found')
		return { exitCode: 1 }
	}

	if (accounts.length === 1) {
		// Only one account - auto-select it
		const pkgPath = setWorkspaceAccountId(accounts[0].id)
		logger.success(`Workspace account set to: ${accounts[0].name}`)
		logLine(logger, `${dim('saved to', theme)} ${pkgPath}`)
		return { exitCode: 0 }
	}

	// Get current workspace default for initial selection
	const currentWorkspace = getWorkspaceAccountId()

	// Build options for prompt
	const options = accounts.map((acc) => {
		const isCurrent = acc.id === currentWorkspace
		return {
			label: isCurrent
				? `${acc.name} ${CYAN}(workspace)${RESET}`
				: acc.name,
			value: acc.id,
			hint: acc.id.substring(0, 8) + '...'
		}
	})

	// Show interactive select
	const selected = await logger.prompt('Select workspace account:', {
		type: 'select',
		options,
		initial: currentWorkspace ?? accounts[0].id
	})

	// Handle cancel
	if (!selected || typeof selected === 'symbol') {
		logLine(logger, dim('Cancelled', theme))
		return { exitCode: 0 }
	}

	// Save the selection to package.json
	const pkgPath = setWorkspaceAccountId(selected)

	// Find the account name
	const selectedAccount = accounts.find((a) => a.id === selected)
	logger.success(`Workspace account set to: ${selectedAccount?.name}`)
	logLine(logger, `${dim('saved to', theme)} ${pkgPath}`)

	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// Workers
// -----------------------------------------------------------------------------

async function showWorkers(
	accountId: string,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const workers = await account.workers(accountId, CLI_API_OPTIONS)

	if (workers.length === 0) {
		return logEmptyState(logger, 'No Workers found', theme)
	}

	logSection(logger, 'Workers', theme, workers.length, 'green')
	logTable(logger, {
		title: 'Worker list',
		rows: workers,
		columns: [
			{ label: 'Name', width: 30, value: (worker) => worker.name },
			{ label: 'Modified', width: 20, value: (worker) => whiteDim(formatDate(worker.modifiedOn), theme) }
		],
		theme,
		titleAccent: 'green'
	})
	logLine(logger)

	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// KV
// -----------------------------------------------------------------------------

async function showKV(
	accountId: string,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const namespaces = await account.kv(accountId, CLI_API_OPTIONS)

	if (namespaces.length === 0) {
		return logEmptyState(logger, 'No KV namespaces found', theme)
	}

	logSection(logger, 'KV namespaces', theme, namespaces.length)
	logTable(logger, {
		title: 'Namespace list',
		rows: namespaces,
		columns: [
			{ label: 'Name', width: 35, value: (ns) => ns.name },
			{ label: 'ID', width: 35, value: (ns) => whiteDim(ns.id, theme) }
		],
		theme,
		titleAccent: 'cyan'
	})
	logLine(logger)

	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// D1
// -----------------------------------------------------------------------------

async function showD1(
	accountId: string,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const databases = await account.d1(accountId, CLI_API_OPTIONS)

	if (databases.length === 0) {
		return logEmptyState(logger, 'No D1 databases found', theme)
	}

	logSection(logger, 'D1 databases', theme, databases.length, 'yellow')
	logTable(logger, {
		title: 'Database list',
		rows: databases,
		columns: [
			{ label: 'Name', width: 25, value: (db) => db.name },
			{ label: 'ID', width: 40, value: (db) => whiteDim(db.id, theme) },
			{ label: 'Tables', width: 8, value: (db) => String(db.tableCount ?? 'N/A') }
		],
		theme,
		titleAccent: 'yellow'
	})
	logLine(logger)

	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// R2
// -----------------------------------------------------------------------------

async function showR2(
	accountId: string,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const buckets = await account.r2(accountId, CLI_API_OPTIONS)

	if (buckets.length === 0) {
		return logEmptyState(logger, 'No R2 buckets found', theme)
	}

	logSection(logger, 'R2 buckets', theme, buckets.length, 'green')
	logTable(logger, {
		title: 'Bucket list',
		rows: buckets,
		columns: [
			{ label: 'Name', width: 30, value: (bucket) => bucket.name },
			{ label: 'Created', width: 20, value: (bucket) => whiteDim(formatDate(bucket.createdOn), theme) },
			{ label: 'Location', width: 10, value: (bucket) => bucket.location ?? 'auto' }
		],
		theme,
		titleAccent: 'green'
	})
	logLine(logger)

	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// Vectorize
// -----------------------------------------------------------------------------

async function showVectorize(
	accountId: string,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const indexes = await account.vectorize(accountId, CLI_API_OPTIONS)

	if (indexes.length === 0) {
		return logEmptyState(logger, 'No Vectorize indexes found', theme)
	}

	logSection(logger, 'Vectorize indexes', theme, indexes.length, 'yellow')
	logTable(logger, {
		title: 'Index list',
		rows: indexes,
		columns: [
			{ label: 'Name', width: 25, value: (idx) => idx.name },
			{ label: 'Dimensions', width: 12, value: (idx) => String(idx.dimensions) },
			{ label: 'Metric', width: 15, value: (idx) => idx.metric }
		],
		theme,
		titleAccent: 'yellow'
	})
	logLine(logger)

	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// Usage
// -----------------------------------------------------------------------------

async function showUsage(
	accountId: string,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const usages = await account.getAllUsageSummaries(accountId)
	const limits = await account.getLimits(accountId)

	logSection(logger, 'Usage', theme, undefined, 'yellow')
	logLine(logger, formatLabelValue('limits', limits.enabled ? green('enabled', theme) : dim('disabled', theme), theme, 12))

	if (usages.length === 0) {
		return logEmptyState(logger, 'No usage tracked yet', theme)
	}

	logTable(logger, {
		title: 'Usage by service',
		rows: usages,
		columns: [
			{ label: 'Service', width: 15, value: (usage) => usage.service },
			{ label: 'Today', width: 10, value: (usage) => String(usage.today) },
			{ label: 'Limit', width: 10, value: (usage) => usage.limit?.toString() ?? '∞' },
			{ label: '%', width: 10, value: (usage) => formatPercent(usage.percentUsed) },
			{ label: 'Status', width: 10, value: (usage) => usage.withinLimit ? green('ok', theme) : yellow('limit', theme) }
		],
		theme,
		titleAccent: 'yellow'
	})
	logLine(logger)

	return { exitCode: 0 }
}

// -----------------------------------------------------------------------------
// Limits
// -----------------------------------------------------------------------------

async function handleLimits(
	accountId: string,
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const action = parsed.args[1] as 'set' | 'enable' | 'disable' | undefined

	switch (action) {
		case 'set':
			return await setLimit(accountId, parsed, logger, theme)

		case 'enable':
			await account.setLimitsEnabled(accountId, true)
			logger.success('Usage limits enabled')
			return { exitCode: 0 }

		case 'disable':
			await account.setLimitsEnabled(accountId, false)
			logger.success('Usage limits disabled')
			return { exitCode: 0 }

		default:
			return await showLimits(accountId, logger, theme)
	}
}

async function showLimits(
	accountId: string,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const limits = await account.getLimits(accountId)

	logSection(logger, 'Usage limits', theme, undefined, 'yellow')
	logLine(logger, formatLabelValue('status', limits.enabled ? green('enabled', theme) : dim('disabled', theme), theme, 16))
	logLine(logger)
	logLine(logger, dim('current limits', theme))
	logLine(logger, formatLabelValue('AI Requests/Day', String(limits.aiRequestsPerDay ?? 'Unlimited'), theme, 18))
	logLine(logger, formatLabelValue('AI Tokens/Day', String(limits.aiTokensPerDay ?? 'Unlimited'), theme, 18))
	logLine(logger, formatLabelValue('Vectorize Ops/Day', String(limits.vectorizeOpsPerDay ?? 'Unlimited'), theme, 18))
	logSection(logger, 'Commands', theme)
	logLine(logger, formatCommand('devflare account limits set ai-requests 50', 'Set the AI request daily limit', theme))
	logLine(logger, formatCommand('devflare account limits set ai-tokens 5000', 'Set the AI token daily limit', theme))
	logLine(logger, formatCommand('devflare account limits set vectorize-ops 500', 'Set the Vectorize daily limit', theme))
	logLine(logger, formatCommand('devflare account limits enable', 'Enable usage limits', theme))
	logLine(logger, formatCommand('devflare account limits disable', 'Disable usage limits', theme))
	logLine(logger)

	return { exitCode: 0 }
}

async function setLimit(
	accountId: string,
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	const limitName = parsed.args[2] as string | undefined
	const limitValue = parsed.args[3] as string | undefined

	if (!limitName || !limitValue) {
		logger.error('Usage: devflare account limits set <limit-name> <value>')
		logLine(logger, dim('Limit names: ai-requests, ai-tokens, vectorize-ops', theme))
		return { exitCode: 1 }
	}

	const value = parseInt(limitValue, 10)
	if (isNaN(value) || value < 0) {
		logger.error('Limit value must be a positive number')
		return { exitCode: 1 }
	}

	switch (limitName) {
		case 'ai-requests':
			await account.setLimits(accountId, { aiRequestsPerDay: value })
			logger.success(`AI requests limit set to ${value}/day`)
			break

		case 'ai-tokens':
			await account.setLimits(accountId, { aiTokensPerDay: value })
			logger.success(`AI tokens limit set to ${value}/day`)
			break

		case 'vectorize-ops':
			await account.setLimits(accountId, { vectorizeOpsPerDay: value })
			logger.success(`Vectorize ops limit set to ${value}/day`)
			break

		default:
			logger.error(`Unknown limit: ${limitName}`)
			logLine(logger, dim('Valid limits: ai-requests, ai-tokens, vectorize-ops', theme))
			return { exitCode: 1 }
	}

	return { exitCode: 0 }
}
