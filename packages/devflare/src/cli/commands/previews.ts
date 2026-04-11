import type { ConsolaInstance } from 'consola'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { BOLD, CYAN, CYAN_BOLD, DIM, GREEN, RED, RESET, WHITE, YELLOW } from '../colors'
import {
	account,
	cleanupPreviewRegistry,
	ensurePreviewRegistry,
	listTrackedRegistryState,
	reconcilePreviewRegistry,
	retirePreviewRegistry,
	type APIClientOptions,
	type DevflareDeploymentRecord,
	type DevflarePreviewAliasRecord,
	type DevflarePreviewRecord,
	type PreviewRegistryContext
} from '../../cloudflare'
import { cleanupPreviewScopedResources } from '../../config/preview-resources'
import { loadConfig, ConfigNotFoundError, resolveConfigPath } from '../../config/loader'

// CLI commands use a 10-second timeout to avoid long hangs
const CLI_API_OPTIONS: APIClientOptions = { timeout: 10000 }

const DEVFLARE_CACHE_DIR = '.devflare'
const PREVIEW_CONFIG_CACHE_FILE = 'preview-command-config.json'

const PREVIEW_SUBCOMMANDS = ['list', 'provision', 'reconcile', 'cleanup', 'retire', 'cleanup-resources'] as const
const ANSI_REGEX = /\x1b\[[0-9;]*m/g

type PreviewSubcommand = typeof PREVIEW_SUBCOMMANDS[number]

interface PreviewConfigSummary {
	accountId?: string
	name?: string
}

interface PreviewConfigCacheEntry extends PreviewConfigSummary {
	mtimeMs: number
}

interface PreviewConfigCacheFile {
	configs?: Record<string, PreviewConfigCacheEntry>
}

interface PreviewCommandContext {
	accountId: string
	workerName?: string
	config?: PreviewConfigSummary
}

function getDevflareCacheDir(): string {
	const override = process.env.DEVFLARE_CACHE_DIR?.trim()
	if (override) {
		return override
	}

	return join(homedir(), DEVFLARE_CACHE_DIR)
}

function getPreviewConfigCachePath(): string {
	return join(getDevflareCacheDir(), PREVIEW_CONFIG_CACHE_FILE)
}

function readPreviewConfigCache(): PreviewConfigCacheFile {
	const cachePath = getPreviewConfigCachePath()
	if (!existsSync(cachePath)) {
		return {}
	}

	try {
		const content = readFileSync(cachePath, 'utf-8')
		return JSON.parse(content) as PreviewConfigCacheFile
	} catch {
		return {}
	}
}

function writePreviewConfigCache(cache: PreviewConfigCacheFile): void {
	try {
		const cacheDir = getDevflareCacheDir()
		if (!existsSync(cacheDir)) {
			mkdirSync(cacheDir, { recursive: true })
		}

		writeFileSync(getPreviewConfigCachePath(), JSON.stringify(cache, null, '\t'), 'utf-8')
	} catch {
		// Best-effort local cache only.
	}
}

function readCachedPreviewConfigSummary(configPath: string): PreviewConfigSummary | undefined {
	if (!existsSync(configPath)) {
		return undefined
	}

	const entry = readPreviewConfigCache().configs?.[configPath]
	if (!entry) {
		return undefined
	}

	try {
		if (statSync(configPath).mtimeMs !== entry.mtimeMs) {
			return undefined
		}
	} catch {
		return undefined
	}

	return {
		accountId: entry.accountId,
		name: entry.name
	}
}

function cachePreviewConfigSummary(configPath: string, summary: PreviewConfigSummary): void {
	if (!existsSync(configPath)) {
		return
	}

	let mtimeMs = 0
	try {
		mtimeMs = statSync(configPath).mtimeMs
	} catch {
		return
	}

	const cache = readPreviewConfigCache()
	const configs = cache.configs ?? {}
	configs[configPath] = {
		accountId: summary.accountId,
		name: summary.name,
		mtimeMs
	}
	writePreviewConfigCache({
		...cache,
		configs
	})
}

function isPreviewSubcommand(value: string): value is PreviewSubcommand {
	return PREVIEW_SUBCOMMANDS.includes(value as PreviewSubcommand)
}

function asOptionalString(value: string | boolean | undefined): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asPositiveNumber(value: string | boolean | undefined, fallback: number): number {
	if (typeof value !== 'string') {
		return fallback
	}

	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function loadLocalConfig(
	cwd: string,
	configFile: string | undefined,
	needsConfig: boolean
): Promise<PreviewConfigSummary | undefined> {
	if (!needsConfig) {
		return undefined
	}

	if (!configFile) {
		const resolvedConfigPath = await resolveConfigPath(cwd)
		if (!resolvedConfigPath) {
			return undefined
		}

		const cached = readCachedPreviewConfigSummary(resolvedConfigPath)
		if (cached) {
			return cached
		}

		try {
			const config = await loadConfig({
				cwd
			})
			const summary = {
				accountId: config.accountId,
				name: config.name
			}
			cachePreviewConfigSummary(resolvedConfigPath, summary)
			return summary
		} catch (error) {
			if (error instanceof ConfigNotFoundError) {
				return undefined
			}

			throw error
		}
	}

	try {
		const config = await loadConfig({
			cwd,
			configFile
		})
		return {
			accountId: config.accountId,
			name: config.name
		}
	} catch (error) {
		if (error instanceof ConfigNotFoundError) {
			return undefined
		}

		throw error
	}
}

async function resolveAccountId(
	parsed: ParsedArgs,
	config: PreviewConfigSummary | undefined
): Promise<string | undefined> {
	const explicitAccountId = asOptionalString(parsed.options.account)
	if (explicitAccountId) {
		return explicitAccountId
	}

	if (config?.accountId) {
		return config.accountId
	}

	const primary = await account.getPrimaryAccount(CLI_API_OPTIONS)
	if (!primary) {
		return undefined
	}

	const effective = await account.getEffectiveAccountId(primary.id)
	return effective.accountId
}

function resolveWorkerName(
	parsed: ParsedArgs,
	config: PreviewConfigSummary | undefined,
	fallbackArg: string | undefined
): string | undefined {
	return asOptionalString(parsed.options.worker) || fallbackArg || config?.name
}

function formatRecordDate(date: Date | undefined): string {
	return date ? date.toISOString().slice(0, 19).replace('T', ' ') : 'N/A'
}

interface PreviewOutputTheme {
	useColor: boolean
}

function shouldUseColor(parsed: ParsedArgs): boolean {
	if (parsed.options['no-color'] === true) {
		return false
	}

	if (process.env.NO_COLOR?.trim()) {
		return false
	}

	if (process.env.TERM === 'dumb') {
		return false
	}

	return process.stdout?.isTTY === true
}

function paint(value: string, code: string, theme: PreviewOutputTheme): string {
	return theme.useColor ? `${code}${value}${RESET}` : value
}

function dim(value: string, theme: PreviewOutputTheme): string {
	return paint(value, DIM, theme)
}

function bold(value: string, theme: PreviewOutputTheme): string {
	return paint(value, BOLD, theme)
}

function cyan(value: string, theme: PreviewOutputTheme): string {
	return paint(value, CYAN, theme)
}

function cyanBold(value: string, theme: PreviewOutputTheme): string {
	return paint(value, CYAN_BOLD, theme)
}

function green(value: string, theme: PreviewOutputTheme): string {
	return paint(value, GREEN, theme)
}

function yellow(value: string, theme: PreviewOutputTheme): string {
	return paint(value, YELLOW, theme)
}

function yellowBold(value: string, theme: PreviewOutputTheme): string {
	return paint(value, `${BOLD}${YELLOW}`, theme)
}

function whiteDim(value: string, theme: PreviewOutputTheme): string {
	return paint(value, `${DIM}${WHITE}`, theme)
}

function red(value: string, theme: PreviewOutputTheme): string {
	return paint(value, RED, theme)
}

function logLine(logger: ConsolaInstance, message: string = ''): void {
	logger.log(message)
}

function formatStatus(value: string, theme: PreviewOutputTheme): string {
	switch (value) {
		case 'active':
			return green(value, theme)
		case 'superseded':
		case 'reassigned':
		case 'orphaned':
			return yellow(value, theme)
		case 'deleted':
		case 'rolled_back':
			return red(value, theme)
		default:
			return value
	}
}

function formatChannel(value: string, theme: PreviewOutputTheme): string {
	switch (value) {
		case 'preview':
			return cyan(value, theme)
		case 'production':
			return green(value, theme)
		default:
			return value
	}
}

interface TableColumn<Row> {
	label: string
	width?: number
	value: (row: Row) => string
}

interface WorkerDisplayGroup {
	workerName: string
	previews: DevflarePreviewRecord[]
	aliases: DevflarePreviewAliasRecord[]
	deployments: DevflareDeploymentRecord[]
	latestTimestamp: number
}

function truncateCell(value: string, width: number): string {
	if (value.length <= width) {
		return value
	}

	if (width <= 1) {
		return '…'
	}

	return `${value.slice(0, width - 1)}…`
}

function stripAnsi(value: string): string {
	return value.replace(ANSI_REGEX, '')
}

function truncateStyledCell(value: string, width: number): string {
	const plainValue = stripAnsi(value)
	if (plainValue.length <= width) {
		return value
	}

	const truncatedPlainValue = truncateCell(plainValue, width)
	const prefixMatch = value.match(/^((?:\x1b\[[0-9;]*m)+)/)
	const suffixMatch = value.match(/((?:\x1b\[[0-9;]*m)+)$/)
	const prefix = prefixMatch?.[1] ?? ''
	const suffix = prefix ? RESET : suffixMatch?.[1] ?? ''

	return `${prefix}${truncatedPlainValue}${suffix}`
}

function padStyledCell(value: string, width: number): string {
	const truncatedValue = truncateStyledCell(value, width)
	const visibleLength = stripAnsi(truncatedValue).length
	return `${truncatedValue}${' '.repeat(Math.max(width - visibleLength, 0))}`
}

function formatTableLine(values: string[], widths: Array<number | undefined>): string {
	return values.map((value, index) => {
		const width = widths[index]
		if (width === undefined || index === values.length - 1) {
			return value
		}

		return padStyledCell(value, width)
	}).join('  ')
}

function shortenVersionId(versionId: string, length: number = 12): string {
	return versionId.length <= length
		? versionId
		: `${versionId.slice(0, length)}…`
}

function getPreviewDisplayTimestamp(record: DevflarePreviewRecord): number {
	return (record.updatedAt ?? record.createdAt).getTime()
}

function getAliasDisplayTimestamp(record: DevflarePreviewAliasRecord): number {
	return (record.updatedAt ?? record.createdAt).getTime()
}

function getDeploymentDisplayTimestamp(record: DevflareDeploymentRecord): number {
	return record.createdAt.getTime()
}

function buildWorkerGroups(
	previews: DevflarePreviewRecord[],
	aliases: DevflarePreviewAliasRecord[],
	deployments: DevflareDeploymentRecord[]
): WorkerDisplayGroup[] {
	const groups = new Map<string, WorkerDisplayGroup>()

	const ensureGroup = (workerName: string): WorkerDisplayGroup => {
		const existing = groups.get(workerName)
		if (existing) {
			return existing
		}

		const created: WorkerDisplayGroup = {
			workerName,
			previews: [],
			aliases: [],
			deployments: [],
			latestTimestamp: 0
		}
		groups.set(workerName, created)
		return created
	}

	for (const record of previews) {
		const group = ensureGroup(record.workerName)
		group.previews.push(record)
		group.latestTimestamp = Math.max(group.latestTimestamp, getPreviewDisplayTimestamp(record))
	}

	for (const record of aliases) {
		const group = ensureGroup(record.workerName)
		group.aliases.push(record)
		group.latestTimestamp = Math.max(group.latestTimestamp, getAliasDisplayTimestamp(record))
	}

	for (const record of deployments) {
		const group = ensureGroup(record.workerName)
		group.deployments.push(record)
		group.latestTimestamp = Math.max(group.latestTimestamp, getDeploymentDisplayTimestamp(record))
	}

	return Array.from(groups.values()).sort((left, right) => {
		if (right.latestTimestamp !== left.latestTimestamp) {
			return right.latestTimestamp - left.latestTimestamp
		}

		return left.workerName.localeCompare(right.workerName)
	})
}

function buildPreviewColumns(
	records: DevflarePreviewRecord[],
	theme: PreviewOutputTheme
): TableColumn<DevflarePreviewRecord>[] {
	const showStatus = records.some((record) => record.status !== 'active')
	const columns: TableColumn<DevflarePreviewRecord>[] = []

	columns.push({
		label: 'Alias',
		width: 24,
		value: (record) => record.alias ?? shortenVersionId(record.versionId)
	})

	if (showStatus) {
		columns.push({
			label: 'Status',
			width: 11,
			value: (record) => formatStatus(record.status, theme)
		})
	}

	columns.push({
		label: 'Updated',
		width: 19,
		value: (record) => whiteDim(formatRecordDate(record.updatedAt ?? record.createdAt), theme)
	})
	columns.push({
		label: 'URL',
		value: (record) => record.aliasPreviewUrl ?? record.previewUrl
	})

	return columns
}

function buildAliasColumns(
	records: DevflarePreviewAliasRecord[],
	theme: PreviewOutputTheme
): TableColumn<DevflarePreviewAliasRecord>[] {
	const showStatus = records.some((record) => record.status !== 'active')
	const columns: TableColumn<DevflarePreviewAliasRecord>[] = []

	columns.push({
		label: 'Alias',
		width: 24,
		value: (record) => record.alias
	})

	if (showStatus) {
		columns.push({
			label: 'Status',
			width: 11,
			value: (record) => formatStatus(record.status, theme)
		})
	}

	columns.push({
		label: 'Version',
		width: 13,
		value: (record) => shortenVersionId(record.versionId)
	})
	columns.push({
		label: 'URL',
		value: (record) => record.aliasPreviewUrl
	})

	return columns
}

function buildDeploymentColumns(
	records: DevflareDeploymentRecord[],
	includeAll: boolean,
	theme: PreviewOutputTheme
): TableColumn<DevflareDeploymentRecord>[] {
	const showStatus = records.some((record) => record.status !== 'active')
	const showVersion = includeAll || showStatus
	const columns: TableColumn<DevflareDeploymentRecord>[] = []

	columns.push({
		label: 'Channel',
		width: 10,
		value: (record) => formatChannel(record.channel, theme)
	})

	if (showStatus) {
		columns.push({
			label: 'Status',
			width: 11,
			value: (record) => formatStatus(record.status, theme)
		})
	}

	columns.push({
		label: 'Deployed',
		width: 19,
		value: (record) => whiteDim(formatRecordDate(record.createdAt), theme)
	})

	if (showVersion) {
		columns.push({
			label: 'Version',
			width: 13,
			value: (record) => shortenVersionId(record.versionId)
		})
	}

	columns.push({
		label: 'URL',
		value: (record) => record.url ?? 'N/A'
	})

	return columns
}

function buildSectionLines<Row>(
	title: string,
	records: Row[],
	columns: TableColumn<Row>[],
	theme: PreviewOutputTheme
): string[] {
	if (records.length === 0) {
		return []
	}

	const widths = columns.map((column) => column.width)
	const coloredTitle = title === 'Previews'
		? cyanBold(title, theme)
		: title === 'Aliases'
			? bold(title, theme)
			: yellowBold(title, theme)
	return [
		`${coloredTitle} ${dim(`(${records.length})`, theme)}`,
		formatTableLine(columns.map((column) => dim(column.label, theme)), widths),
		...records.map((record) => formatTableLine(columns.map((column) => column.value(record)), widths))
	]
}

function logWorkerGroup(
	logger: ConsolaInstance,
	group: WorkerDisplayGroup,
	includeAll: boolean,
	theme: PreviewOutputTheme
): void {
	const showAliases = shouldShowAliasSection(group.previews, group.aliases, includeAll)
	const lines: string[] = []
	const previewLines = buildSectionLines('Previews', group.previews, buildPreviewColumns(group.previews, theme), theme)
	const aliasLines = showAliases
		? buildSectionLines('Aliases', group.aliases, buildAliasColumns(group.aliases, theme), theme)
		: []
	const deploymentLines = buildSectionLines(
		'Deployments',
		group.deployments,
		buildDeploymentColumns(group.deployments, includeAll, theme),
		theme
	)

	for (const sectionLines of [previewLines, aliasLines, deploymentLines]) {
		if (sectionLines.length === 0) {
			continue
		}

		if (lines.length > 0) {
			lines.push('')
		}

		lines.push(...sectionLines)
	}

	if (lines.length === 0) {
		return
	}

	logLine(
		logger,
		`${dim('┌', theme)} ${dim('worker', theme)} ${green(group.workerName, theme)}`
	)

	for (const [index, line] of lines.entries()) {
		const isLastLine = index === lines.length - 1
		const connector = isLastLine ? '└' : '│'
		if (!line) {
			logLine(logger, dim(connector, theme))
			continue
		}

		logLine(logger, `${dim(connector, theme)}  ${line}`)
	}
}

function shouldShowAliasSection(
	previews: DevflarePreviewRecord[],
	aliases: DevflarePreviewAliasRecord[],
	includeAll: boolean
): boolean {
	if (aliases.length === 0) {
		return false
	}

	if (includeAll || previews.length === 0) {
		return true
	}

	const previewAliasKeys = new Set(
		previews
			.filter((record) => record.alias && record.aliasPreviewUrl)
			.map((record) => `${record.workerName}\u0000${record.alias}\u0000${record.versionId}\u0000${record.aliasPreviewUrl}`)
	)

	return aliases.some((record) => !previewAliasKeys.has(
		`${record.workerName}\u0000${record.alias}\u0000${record.versionId}\u0000${record.aliasPreviewUrl}`
	))
}

function isVisiblePreviewRecord(record: DevflarePreviewRecord, includeAll: boolean): boolean {
	return includeAll || (!record.deletedAt && record.status === 'active')
}

function isVisibleAliasRecord(record: DevflarePreviewAliasRecord, includeAll: boolean): boolean {
	return includeAll || (!record.deletedAt && record.status === 'active')
}

function isVisibleDeploymentRecord(record: DevflareDeploymentRecord, includeAll: boolean): boolean {
	return includeAll || (!record.deletedAt && record.status === 'active')
}

async function resolveContext(
	parsed: ParsedArgs,
	options: CliOptions,
	subcommand: PreviewSubcommand,
	fallbackArg: string | undefined
): Promise<PreviewCommandContext> {
	const cwd = options.cwd ?? process.cwd()
	const configFile = asOptionalString(parsed.options.config)
	const needsConfig = subcommand === 'cleanup-resources'
		|| !asOptionalString(parsed.options.account)
		|| (!asOptionalString(parsed.options.worker) && !fallbackArg)
	const config = await loadLocalConfig(cwd, configFile, needsConfig)
	const accountId = await resolveAccountId(parsed, config)
	const workerName = resolveWorkerName(parsed, config, fallbackArg)

	if (!accountId) {
		throw new Error('No Cloudflare account could be resolved. Use --account or configure accountId in devflare.config.*.')
	}

	if ((subcommand === 'reconcile' || subcommand === 'cleanup') && !workerName && subcommand === 'reconcile') {
		throw new Error('A worker name is required for preview reconciliation. Use --worker or run inside a configured package.')
	}

	if ((subcommand === 'reconcile' || subcommand === 'retire') && !workerName) {
		throw new Error(`A worker name is required for preview ${subcommand}. Use --worker or run inside a configured package.`)
	}

	return {
		accountId,
		workerName,
		config
	}
}

async function showTrackedState(
	registry: PreviewRegistryContext,
	workerName: string | undefined,
	logger: ConsolaInstance,
	includeAll: boolean,
	theme: PreviewOutputTheme
): Promise<void> {
	const { previews, aliases, deployments } = await listTrackedRegistryState({
		registry,
		workerName,
		apiOptions: CLI_API_OPTIONS
	})
	const filteredPreviews = previews.filter((record) => isVisiblePreviewRecord(record, includeAll))
	const filteredAliases = aliases.filter((record) => isVisibleAliasRecord(record, includeAll))
	const filteredDeployments = deployments.filter((record) => isVisibleDeploymentRecord(record, includeAll))
	const workerGroups = buildWorkerGroups(filteredPreviews, filteredAliases, filteredDeployments)
	const hasHistoricalRecords = !includeAll
		&& (
			filteredPreviews.length < previews.length
			|| filteredAliases.length < aliases.length
			|| filteredDeployments.length < deployments.length
		)

	if (filteredPreviews.length === 0 && filteredAliases.length === 0 && filteredDeployments.length === 0) {
		logLine(logger)
		if (hasHistoricalRecords) {
			logLine(
				logger,
				`${yellow(`No active preview records found${workerName ? ` for ${workerName}` : ''}.`, theme)} ${dim('Use --all to include historical records.', theme)}`
			)
		} else {
			logLine(logger, dim(`No tracked preview records found${workerName ? ` for ${workerName}` : ''}.`, theme))
		}
		logLine(logger)
		return
	}

	logLine(logger)
	for (const [index, group] of workerGroups.entries()) {
		if (index > 0) {
			logLine(logger)
		}

		logWorkerGroup(logger, group, includeAll, theme)
	}

	logLine(logger)
}

export async function runPreviewsCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const isAuth = await account.isAuthenticated()
	if (!isAuth) {
		logger.error('Not authenticated with Cloudflare')
		logger.info('Run `devflare login` first.')
		return { exitCode: 1 }
	}

	const rawSubcommand = parsed.args[0]
	const fallbackWorkerArg = rawSubcommand && !isPreviewSubcommand(rawSubcommand)
		? rawSubcommand
		: parsed.args[1]
	const subcommand: PreviewSubcommand = rawSubcommand && isPreviewSubcommand(rawSubcommand)
		? rawSubcommand
		: 'list'
	const includeAll = parsed.options.all === true
	const theme: PreviewOutputTheme = {
		useColor: shouldUseColor(parsed)
	}

	if (rawSubcommand && !isPreviewSubcommand(rawSubcommand) && parsed.args.length > 2) {
		logger.error(`Unknown previews subcommand: ${rawSubcommand}`)
		logger.info(`Available previews subcommands: ${PREVIEW_SUBCOMMANDS.join(', ')}`)
		return { exitCode: 1 }
	}

	try {
		const context = await resolveContext(parsed, options, subcommand, fallbackWorkerArg)
		const databaseName = asOptionalString(parsed.options.database)
		const environment = asOptionalString(parsed.options.env)

		switch (subcommand) {
			case 'provision': {
				const registry = await ensurePreviewRegistry({
					accountId: context.accountId,
					databaseName,
					apiOptions: CLI_API_OPTIONS,
					logger
				})
				logger.success(
					registry.created
						? `Provisioned preview registry database ${registry.databaseName}`
						: `Preview registry database ${registry.databaseName} is ready`
				)
				return { exitCode: 0 }
			}

			case 'reconcile': {
				if (!context.workerName) {
					logger.error('A worker name is required for preview reconciliation')
					return { exitCode: 1 }
				}

				const result = await reconcilePreviewRegistry({
					accountId: context.accountId,
					workerName: context.workerName,
					databaseName,
					apiOptions: CLI_API_OPTIONS,
					logger
				})
				logger.success(`Reconciled preview registry for ${context.workerName}`)
				logger.info(
					`Synced ${result.previews.length} preview(s) · ${result.previewAliases.length} alias record(s) · ${result.deployments.length} deployment record(s)`
				)
				await showTrackedState(result.registry, context.workerName, logger, includeAll, theme)
				return { exitCode: 0 }
			}

			case 'cleanup': {
				if (context.workerName) {
					await reconcilePreviewRegistry({
						accountId: context.accountId,
						workerName: context.workerName,
						databaseName,
						apiOptions: CLI_API_OPTIONS,
						logger
					})
				}

				const days = asPositiveNumber(parsed.options.days, 7)
				const result = await cleanupPreviewRegistry({
					accountId: context.accountId,
					workerName: context.workerName,
					databaseName,
					apiOptions: CLI_API_OPTIONS,
					days,
					apply: parsed.options.apply === true,
					logger
				})
				logger.success(
					parsed.options.apply === true
						? `Cleaned up preview registry records older than ${days} day(s)`
						: `Preview cleanup dry run complete for records older than ${days} day(s)`
				)
				logger.info(
					`Candidates: ${result.candidates.previews.length} preview(s) · ${result.candidates.aliases.length} alias record(s) · ${result.candidates.deployments.length} deployment record(s)`
				)
				return { exitCode: 0 }
			}

			case 'retire': {
				if (!context.workerName) {
					logger.error('A worker name is required for preview retirement')
					return { exitCode: 1 }
				}

				const branchName = asOptionalString(parsed.options.branch)
				const previewAlias = asOptionalString(parsed.options.alias)
					|| asOptionalString(parsed.options['preview-alias'])
				const versionId = asOptionalString(parsed.options.version)
					|| asOptionalString(parsed.options['version-id'])
				const commitSha = asOptionalString(parsed.options.sha)
					|| asOptionalString(parsed.options['commit-sha'])

				if (!branchName && !previewAlias && !versionId && !commitSha) {
					logger.error('Preview retirement needs at least one selector: --branch, --preview-alias, --version-id, or --commit-sha')
					return { exitCode: 1 }
				}

				const result = await retirePreviewRegistry({
					accountId: context.accountId,
					workerName: context.workerName,
					databaseName,
					apiOptions: CLI_API_OPTIONS,
					branchName,
					previewAlias,
					versionId,
					commitSha,
					apply: parsed.options.apply === true,
					logger
				})
				logger.success(
					parsed.options.apply === true
						? `Retired preview registry records for ${context.workerName}`
						: `Preview retirement dry run complete for ${context.workerName}`
				)
				logger.info(
					`Candidates: ${result.candidates.previews.length} preview(s) · ${result.candidates.aliases.length} alias record(s) · ${result.candidates.deployments.length} deployment record(s)`
				)
				return { exitCode: 0 }
			}

			case 'cleanup-resources': {
				const cwd = options.cwd ?? process.cwd()
				const configFile = asOptionalString(parsed.options.config)
				const config = await loadConfig({ cwd, configFile })
				const result = await cleanupPreviewScopedResources(config, {
					environment: environment ?? 'preview',
					accountId: context.accountId,
					apply: parsed.options.apply === true
				})

				const totalCandidates = result.candidates.kv.length
					+ result.candidates.d1.length
					+ result.candidates.r2.length
					+ result.candidates.queues.length
					+ result.candidates.vectorize.length
					+ result.candidates.hyperdrive.length

				logger.success(
					parsed.options.apply === true
						? `Deleted ${totalCandidates} preview-scoped Cloudflare resource${totalCandidates === 1 ? '' : 's'}`
						: `Preview-scoped resource cleanup dry run complete with ${totalCandidates} candidate${totalCandidates === 1 ? '' : 's'}`
				)

				const resourceSummary = [
					result.candidates.kv.length > 0 ? `KV ${result.candidates.kv.length}` : null,
					result.candidates.d1.length > 0 ? `D1 ${result.candidates.d1.length}` : null,
					result.candidates.r2.length > 0 ? `R2 ${result.candidates.r2.length}` : null,
					result.candidates.queues.length > 0 ? `Queues ${result.candidates.queues.length}` : null,
					result.candidates.vectorize.length > 0 ? `Vectorize ${result.candidates.vectorize.length}` : null,
					result.candidates.hyperdrive.length > 0 ? `Hyperdrive ${result.candidates.hyperdrive.length}` : null
				].filter((segment): segment is string => segment !== null)

				if (resourceSummary.length > 0) {
					logger.info(`Candidates: ${resourceSummary.join(' · ')}`)
				} else {
					logger.info('Candidates: none')
				}

				for (const warning of result.warnings) {
					logger.warn(warning)
				}

				return { exitCode: 0 }
			}

			case 'list':
			default: {
				const registry = await ensurePreviewRegistry({
					accountId: context.accountId,
					databaseName,
					apiOptions: CLI_API_OPTIONS,
					logger,
					skipSchemaIfExisting: true
				})
				await showTrackedState(registry, context.workerName, logger, includeAll, theme)
				return { exitCode: 0 }
			}
		}
	} catch (error) {
		if (error instanceof Error) {
			logger.error(error.message)
			return { exitCode: 1 }
		}

		throw error
	}
}
