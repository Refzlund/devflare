import type { ConsolaInstance } from 'consola'
import {
	type APIClientOptions,
	type WorkerDeploymentInfo,
	type WorkerInfo,
	type WorkerVersionInfo,
	account
} from '../../cloudflare'
import { ConfigNotFoundError, loadConfig } from '../../config/loader'
import { findFiles } from '../../utils/glob'
import {
	asOptionalString,
	resolveCloudflareAccountId,
	resolveNamedSelection
} from '../command-utils'
import { getDependencies } from '../dependencies'
import type { CliOptions, CliResult, ParsedArgs } from '../index'
import {
	type CliTableColumn,
	type CliTheme,
	bold,
	createCliTheme,
	cyanBold,
	dim,
	formatLabelValue,
	green,
	logLine,
	logTable,
	red,
	whiteDim,
	yellow
} from '../ui'
import { collectConfiguredWorkerFamilies } from './previews-support/family'
import type { ConfiguredWorkerFamilyMember } from './previews-support/types'

const CLI_API_OPTIONS: APIClientOptions = { timeout: 10000 }
const PRODUCTION_SUBCOMMANDS = ['list', 'versions', 'deployments', 'rollback', 'delete'] as const
const VERSION_LIST_LIMIT = 10

type ProductionSubcommand = (typeof PRODUCTION_SUBCOMMANDS)[number]
type WorkerNameSource = 'option' | 'arg' | 'config' | 'none'

interface ProductionDiscoveryResult {
	accountId?: string
	defaultWorkerName?: string
	defaultWorkerNameSource: WorkerNameSource
	families: ConfiguredWorkerFamilyMember[]
	primaryFamilyNames: string[]
}

interface ProductionCommandContext {
	accountId: string
	workerName?: string
	workerNameSource: WorkerNameSource
	discovery: ProductionDiscoveryResult
}

interface ProductionWorkerRow {
	workerName: string
	role: string
	status: 'active' | 'missing' | 'undeployed'
	deployedAt?: Date
	versionId?: string
	source?: string
	url?: string
}

interface ProductionVersionRow {
	versionId: string
	status: 'active' | 'stored'
	updatedAt?: Date
	deployedAt?: Date
	source?: string
}

interface WorkerVersionOverview {
	workerName: string
	rows: ProductionVersionRow[]
}

interface ProductionDeploymentRow {
	createdOn: Date
	deploymentId: string
	strategy: string
	split: string
	source: string
	message?: string
	triggeredBy?: string
}

interface WorkerDeploymentOverview {
	workerName: string
	rows: ProductionDeploymentRow[]
}

function isProductionSubcommand(value: string): value is ProductionSubcommand {
	return PRODUCTION_SUBCOMMANDS.includes(value as ProductionSubcommand)
}

function shortenVersionId(versionId: string, length = 12): string {
	return versionId.length <= length ? versionId : `${versionId.slice(0, length)}…`
}

function selectDeploymentVersionId(deployment: WorkerDeploymentInfo): string | undefined {
	return (
		deployment.versions.find((version) => version.percentage === 100)?.versionId ??
		deployment.versions[0]?.versionId
	)
}

function formatDeploymentSplit(deployment: WorkerDeploymentInfo): string {
	if (deployment.versions.length === 0) {
		return 'N/A'
	}

	return deployment.versions
		.map((version) => `${version.percentage}% → ${shortenVersionId(version.versionId, 8)}`)
		.join(', ')
}

function getWorkerVersionTimestamp(version: WorkerVersionInfo): Date | undefined {
	return version.metadata.modifiedOn ?? version.metadata.createdOn
}

function formatRecordDate(date: Date | undefined): string {
	return date ? date.toISOString().slice(0, 19).replace('T', ' ') : 'N/A'
}

function formatWorkerStatus(status: ProductionWorkerRow['status'], theme: CliTheme): string {
	switch (status) {
		case 'active':
			return green(status, theme)
		case 'undeployed':
			return yellow(status, theme)
		default:
			return red(status, theme)
	}
}

function formatVersionStatus(status: ProductionVersionRow['status'], theme: CliTheme): string {
	switch (status) {
		case 'active':
			return green(status, theme)
		default:
			return whiteDim(status, theme)
	}
}

function shouldReplaceConfiguredWorkerFamily(
	existing: ConfiguredWorkerFamilyMember | undefined,
	candidate: ConfiguredWorkerFamilyMember
): boolean {
	return !existing || (candidate.role === 'primary' && existing.role !== 'primary')
}

function mergeConfiguredWorkerFamily(
	families: Map<string, ConfiguredWorkerFamilyMember>,
	candidate: ConfiguredWorkerFamilyMember
): void {
	if (shouldReplaceConfiguredWorkerFamily(families.get(candidate.baseName), candidate)) {
		families.set(candidate.baseName, candidate)
	}
}

async function discoverProductionConfigs(
	cwd: string,
	configFile: string | undefined,
	environment: string
): Promise<ProductionDiscoveryResult> {
	const families = new Map<string, ConfiguredWorkerFamilyMember>()
	const primaryFamilyNames = new Set<string>()
	const accountIds = new Set<string>()
	let defaultWorkerName: string | undefined
	let defaultWorkerNameSource: WorkerNameSource = 'none'

	const loadAndCollect = async (candidateConfigFile?: string): Promise<boolean> => {
		try {
			const config = await loadConfig({ cwd, configFile: candidateConfigFile })
			const resolvedFamilies = collectConfiguredWorkerFamilies(config, environment)
			for (const family of resolvedFamilies) {
				mergeConfiguredWorkerFamily(families, family)
				if (family.role === 'primary') {
					primaryFamilyNames.add(family.baseName)
				}
			}

			if (config.accountId?.trim()) {
				accountIds.add(config.accountId.trim())
			}

			if (!defaultWorkerName) {
				defaultWorkerName = resolvedFamilies.find((family) => family.role === 'primary')?.baseName
				defaultWorkerNameSource = defaultWorkerName ? 'config' : 'none'
			}

			return true
		} catch (error) {
			if (error instanceof ConfigNotFoundError) {
				return false
			}

			throw error
		}
	}

	if (configFile) {
		await loadAndCollect(configFile)
	} else {
		const loadedDirectly = await loadAndCollect()
		if (!loadedDirectly) {
			const configPaths = (
				await findFiles('**/devflare.config.{ts,js,mjs,cjs}', {
					cwd,
					absolute: true
				})
			).sort((left, right) => left.localeCompare(right))

			for (const configPath of configPaths) {
				await loadAndCollect(configPath)
			}
		}
	}

	if (accountIds.size > 1) {
		throw new Error(
			'Multiple Cloudflare account ids were discovered across local Devflare configs. Pass --account to select one account explicitly for `devflare productions`.'
		)
	}

	return {
		accountId: Array.from(accountIds)[0],
		defaultWorkerName,
		defaultWorkerNameSource,
		families: Array.from(families.values()).sort((left, right) => {
			if (left.role === 'primary' && right.role !== 'primary') {
				return -1
			}

			if (left.role !== 'primary' && right.role === 'primary') {
				return 1
			}

			return left.baseName.localeCompare(right.baseName)
		}),
		primaryFamilyNames: Array.from(primaryFamilyNames).sort((left, right) =>
			left.localeCompare(right)
		)
	}
}

async function resolveAccountId(
	parsed: ParsedArgs,
	discovery: ProductionDiscoveryResult
): Promise<string | undefined> {
	return resolveCloudflareAccountId({
		explicitAccountId: asOptionalString(parsed.options.account),
		configuredAccountId: discovery.accountId,
		apiOptions: CLI_API_OPTIONS
	})
}

function resolveWorkerName(
	parsed: ParsedArgs,
	discovery: ProductionDiscoveryResult,
	fallbackArg: string | undefined
): { workerName?: string; source: WorkerNameSource } {
	const selection = resolveNamedSelection({
		explicitValue: asOptionalString(parsed.options.worker),
		fallbackValue: fallbackArg,
		configuredValue: discovery.defaultWorkerName
	})

	return {
		workerName: selection.value,
		source:
			selection.value === discovery.defaultWorkerName
				? discovery.defaultWorkerNameSource
				: selection.source
	}
}

async function resolveContext(
	parsed: ParsedArgs,
	options: CliOptions,
	subcommand: ProductionSubcommand,
	fallbackArg: string | undefined
): Promise<ProductionCommandContext> {
	const cwd = options.cwd ?? process.cwd()
	const configFile = asOptionalString(parsed.options.config)
	const environment = asOptionalString(parsed.options.env) ?? 'production'
	const explicitAccountId = asOptionalString(parsed.options.account)
	const explicitWorkerName = asOptionalString(parsed.options.worker) ?? fallbackArg
	const shouldDiscoverConfigs = Boolean(configFile) || !explicitAccountId || !explicitWorkerName
	const discovery = shouldDiscoverConfigs
		? await discoverProductionConfigs(cwd, configFile, environment)
		: {
				accountId: undefined,
				defaultWorkerName: undefined,
				defaultWorkerNameSource: 'none' as const,
				families: [],
				primaryFamilyNames: []
			}
	const accountId = await resolveAccountId(parsed, discovery)
	const workerSelection = resolveWorkerName(parsed, discovery, fallbackArg)

	if (!accountId) {
		throw new Error(
			'No Cloudflare account could be resolved. Use --account or configure accountId in devflare.config.*.'
		)
	}

	if ((subcommand === 'rollback' || subcommand === 'delete') && !workerSelection.workerName) {
		throw new Error(
			`A worker name is required for productions ${subcommand}. Use --worker or run inside a configured package with a single primary worker.`
		)
	}

	return {
		accountId,
		workerName: workerSelection.workerName,
		workerNameSource: workerSelection.source,
		discovery
	}
}

function getProductionUrl(workerName: string, workersSubdomain: string | null): string | undefined {
	if (!workersSubdomain) {
		return undefined
	}

	const normalizedSubdomain = workersSubdomain
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\.workers\.dev\/?$/i, '')

	return `https://${workerName}.${normalizedSubdomain}.workers.dev`
}

async function buildProductionRows(
	accountId: string,
	families: ConfiguredWorkerFamilyMember[],
	apiOptions: APIClientOptions
): Promise<ProductionWorkerRow[]> {
	const [liveWorkers, workersSubdomain] = await Promise.all([
		account.workers(accountId, apiOptions),
		account.workersSubdomain(accountId, apiOptions)
	])
	const workersByName = new Map(liveWorkers.map((worker) => [worker.name, worker]))

	return Promise.all(
		families.map(async (family) => {
			const worker = workersByName.get(family.baseName)
			if (!worker) {
				return {
					workerName: family.baseName,
					role: family.roleLabel,
					status: 'missing' as const,
					url: getProductionUrl(family.baseName, workersSubdomain)
				}
			}

			const deployments = await account.workerDeployments(accountId, family.baseName, apiOptions)
			const latestDeployment = [...deployments].sort((left, right) => {
				return right.createdOn.getTime() - left.createdOn.getTime()
			})[0]
			const activeVersionId = latestDeployment
				? selectDeploymentVersionId(latestDeployment)
				: undefined

			return {
				workerName: family.baseName,
				role: family.roleLabel,
				status: latestDeployment ? 'active' : 'undeployed',
				deployedAt: latestDeployment?.createdOn ?? worker.modifiedOn,
				versionId: activeVersionId,
				source: latestDeployment?.source,
				url: getProductionUrl(family.baseName, workersSubdomain)
			}
		})
	)
}

function buildProductionColumns(theme: CliTheme): CliTableColumn<ProductionWorkerRow>[] {
	return [
		{
			label: 'Worker',
			width: 34,
			value: (row) => row.workerName
		},
		{
			label: 'Role',
			width: 18,
			value: (row) => row.role
		},
		{
			label: 'Status',
			width: 10,
			value: (row) => formatWorkerStatus(row.status, theme)
		},
		{
			label: 'Deployed',
			width: 19,
			value: (row) => whiteDim(formatRecordDate(row.deployedAt), theme)
		},
		{
			label: 'Version',
			width: 13,
			value: (row) => (row.versionId ? shortenVersionId(row.versionId) : dim('N/A', theme))
		},
		{
			label: 'Source',
			width: 14,
			value: (row) => row.source ?? dim('N/A', theme)
		},
		{
			label: 'URL',
			value: (row) => row.url ?? 'N/A'
		}
	]
}

function buildVersionColumns(theme: CliTheme): CliTableColumn<ProductionVersionRow>[] {
	return [
		{
			label: 'Version',
			width: 13,
			value: (row) => shortenVersionId(row.versionId)
		},
		{
			label: 'Status',
			width: 8,
			value: (row) => formatVersionStatus(row.status, theme)
		},
		{
			label: 'Updated',
			width: 19,
			value: (row) => whiteDim(formatRecordDate(row.updatedAt), theme)
		},
		{
			label: 'Last deployed',
			width: 19,
			value: (row) => whiteDim(formatRecordDate(row.deployedAt), theme)
		},
		{
			label: 'Source',
			value: (row) => row.source ?? dim('N/A', theme)
		}
	]
}

async function loadWorkerVersionOverview(
	accountId: string,
	workerName: string,
	apiOptions: APIClientOptions
): Promise<WorkerVersionOverview> {
	const [versions, deployments] = await Promise.all([
		account.workerVersions(accountId, workerName, apiOptions),
		account.workerDeployments(accountId, workerName, apiOptions)
	])
	const productionVersions = versions
		.filter((version) => version.id)
		.filter((version) => version.metadata.hasPreview !== true)
		.sort((left, right) => {
			const leftTime = getWorkerVersionTimestamp(left)?.getTime() ?? 0
			const rightTime = getWorkerVersionTimestamp(right)?.getTime() ?? 0
			return rightTime - leftTime
		})
		.slice(0, VERSION_LIST_LIMIT)
	const activeVersionIds = new Set(
		(deployments[0]?.versions ?? []).map((version) => version.versionId)
	)
	const latestDeploymentByVersionId = new Map<string, Date>()

	for (const deployment of deployments) {
		for (const version of deployment.versions) {
			const existing = latestDeploymentByVersionId.get(version.versionId)
			if (!existing || deployment.createdOn.getTime() > existing.getTime()) {
				latestDeploymentByVersionId.set(version.versionId, deployment.createdOn)
			}
		}
	}

	return {
		workerName,
		rows: productionVersions.map((version) => ({
			versionId: version.id,
			status: activeVersionIds.has(version.id) ? 'active' : 'stored',
			updatedAt: getWorkerVersionTimestamp(version),
			deployedAt: latestDeploymentByVersionId.get(version.id),
			source: version.metadata.source
		}))
	}
}

function showProductionOverview(
	logger: ConsolaInstance,
	context: ProductionCommandContext,
	rows: ProductionWorkerRow[],
	theme: CliTheme
): void {
	logLine(logger)

	if (context.discovery.primaryFamilyNames.length === 1) {
		logLine(
			logger,
			formatLabelValue(
				'worker family',
				green(context.discovery.primaryFamilyNames[0], theme),
				theme
			)
		)
		logLine(
			logger,
			formatLabelValue(
				'related',
				whiteDim(String(Math.max(context.discovery.families.length - 1, 0)), theme),
				theme
			)
		)
	} else if (context.discovery.primaryFamilyNames.length > 1) {
		logLine(
			logger,
			formatLabelValue(
				'configured',
				whiteDim(`${context.discovery.primaryFamilyNames.length} primary workers`, theme),
				theme
			)
		)
		logLine(
			logger,
			formatLabelValue(
				'tracked',
				whiteDim(`${context.discovery.families.length} workers`, theme),
				theme
			)
		)
	} else if (context.workerName) {
		logLine(logger, formatLabelValue('worker', green(context.workerName, theme), theme))
	}

	if (rows.length === 0) {
		logLine(logger)
		logLine(logger, dim('No production Workers matched the current selection.', theme))
		logLine(logger)
		return
	}

	logLine(logger)
	logTable(logger, {
		title: 'Productions',
		rows,
		columns: buildProductionColumns(theme),
		theme,
		titleAccent: 'green'
	})
	logLine(logger)
	logLine(
		logger,
		dim(
			'Use `devflare productions versions` for recent production versions, `deployments` for the full deployment history, or `rollback` / `delete` to mutate one Worker.',
			theme
		)
	)
	logLine(logger)
}

function showWorkerVersions(
	logger: ConsolaInstance,
	overviews: WorkerVersionOverview[],
	theme: CliTheme
): void {
	logLine(logger)

	if (overviews.length === 0) {
		logLine(logger, dim('No production versions were found for the current selection.', theme))
		logLine(logger)
		return
	}

	for (const [index, overview] of overviews.entries()) {
		if (index > 0) {
			logLine(logger)
		}

		logLine(logger, `${bold('worker', theme)} ${green(overview.workerName, theme)}`)
		if (overview.rows.length === 0) {
			logLine(logger, dim('No stored production versions were found for this Worker.', theme))
			continue
		}

		logTable(logger, {
			title: 'Versions',
			rows: overview.rows,
			columns: buildVersionColumns(theme),
			theme,
			titleAccent: 'cyan'
		})
	}

	logLine(logger)
}

function buildDeploymentColumns(theme: CliTheme): CliTableColumn<ProductionDeploymentRow>[] {
	return [
		{
			label: 'Deployed',
			width: 19,
			value: (row) => whiteDim(formatRecordDate(row.createdOn), theme)
		},
		{
			label: 'Deployment',
			width: 12,
			value: (row) => shortenVersionId(row.deploymentId, 11)
		},
		{
			label: 'Strategy',
			width: 12,
			value: (row) => row.strategy || dim('N/A', theme)
		},
		{
			label: 'Traffic split',
			width: 28,
			value: (row) => row.split
		},
		{
			label: 'Source',
			width: 12,
			value: (row) => row.source || dim('N/A', theme)
		},
		{
			label: 'Triggered by',
			width: 18,
			value: (row) => (row.triggeredBy ? whiteDim(row.triggeredBy, theme) : dim('N/A', theme))
		},
		{
			label: 'Message',
			value: (row) => (row.message ? row.message : dim('N/A', theme))
		}
	]
}

async function loadWorkerDeploymentHistory(
	accountId: string,
	workerName: string,
	apiOptions: APIClientOptions
): Promise<WorkerDeploymentOverview> {
	const deployments = await account.workerDeployments(accountId, workerName, apiOptions)
	const sorted = [...deployments].sort(
		(left, right) => right.createdOn.getTime() - left.createdOn.getTime()
	)

	return {
		workerName,
		rows: sorted.map((deployment) => ({
			createdOn: deployment.createdOn,
			deploymentId: deployment.id,
			strategy: deployment.strategy,
			split: formatDeploymentSplit(deployment),
			source: deployment.source,
			message: deployment.message,
			triggeredBy: deployment.triggeredBy ?? deployment.authorEmail
		}))
	}
}

function showWorkerDeployments(
	logger: ConsolaInstance,
	overviews: WorkerDeploymentOverview[],
	theme: CliTheme
): void {
	logLine(logger)

	if (overviews.length === 0) {
		logLine(logger, dim('No production deployments were found for the current selection.', theme))
		logLine(logger)
		return
	}

	for (const [index, overview] of overviews.entries()) {
		if (index > 0) {
			logLine(logger)
		}

		logLine(logger, `${bold('worker', theme)} ${green(overview.workerName, theme)}`)
		if (overview.rows.length === 0) {
			logLine(logger, dim('No production deployments were found for this Worker.', theme))
			continue
		}

		logTable(logger, {
			title: 'Deployments',
			rows: overview.rows,
			columns: buildDeploymentColumns(theme),
			theme,
			titleAccent: 'cyan'
		})
	}

	logLine(logger)
}

async function runRollback(
	context: ProductionCommandContext,
	parsed: ParsedArgs,
	options: CliOptions,
	logger: ConsolaInstance,
	theme: CliTheme
): Promise<CliResult> {
	if (!context.workerName) {
		logger.error('A worker name is required for production rollback.')
		return { exitCode: 1 }
	}

	const versionId =
		asOptionalString(parsed.options.version) || asOptionalString(parsed.options['version-id'])
	const apply = parsed.options.apply === true

	if (!apply) {
		logger.success(`Production rollback dry run complete for ${context.workerName}`)
		logger.info(
			versionId
				? `Would roll back ${context.workerName} to version ${versionId}`
				: `Would roll back ${context.workerName} to the previously deployed production version`
		)
		return { exitCode: 0 }
	}

	const rollbackMessage =
		asOptionalString(parsed.options.message) ??
		`Rolled back ${context.workerName} via devflare productions rollback`
	const rollbackArgs = ['wrangler', 'rollback']
	if (versionId) {
		rollbackArgs.push(versionId)
	}
	rollbackArgs.push('--name', context.workerName, '--message', rollbackMessage)

	logLine(logger)
	logLine(
		logger,
		`${cyanBold('productions rollback', theme)} ${dim(`Rolling back ${context.workerName}`, theme)}`
	)

	const deps = await getDependencies()
	const cwd = options.cwd ?? process.cwd()
	const rollbackResult = await deps.exec.exec('bunx', rollbackArgs, {
		cwd,
		stdio: 'inherit'
	})

	if (rollbackResult.exitCode !== 0) {
		logger.error(`Rollback failed for ${context.workerName}`)
		return { exitCode: 1 }
	}

	const deployments = await account.workerDeployments(
		context.accountId,
		context.workerName,
		CLI_API_OPTIONS
	)
	const activeVersionId = deployments[0] ? selectDeploymentVersionId(deployments[0]) : undefined

	logger.success(`Rolled back production deployment for ${context.workerName}`)
	if (activeVersionId) {
		logger.info(`Active version: ${activeVersionId}`)
	}

	return { exitCode: 0 }
}

async function runDelete(
	context: ProductionCommandContext,
	parsed: ParsedArgs,
	logger: ConsolaInstance
): Promise<CliResult> {
	if (!context.workerName) {
		logger.error('A worker name is required for production deletion.')
		return { exitCode: 1 }
	}

	const apply = parsed.options.apply === true
	if (!apply) {
		logger.success(`Production delete dry run complete for ${context.workerName}`)
		logger.info(`Would delete Worker script ${context.workerName}`)
		logger.warn(
			'Deleting a production Worker script does not automatically delete KV, D1, R2, queue, or other account resources.'
		)
		return { exitCode: 0 }
	}

	await account.deleteWorker(context.accountId, context.workerName, CLI_API_OPTIONS)
	logger.success(`Deleted production Worker script ${context.workerName}`)
	logger.warn(
		'Devflare deleted the Worker script only. Review any shared account resources separately before cleaning them up.'
	)
	return { exitCode: 0 }
}

function resolveSelectedWorkerNames(
	context: ProductionCommandContext,
	selectedFamilies: ConfiguredWorkerFamilyMember[]
): string[] {
	return Array.from(
		new Set(
			context.workerName ? [context.workerName] : selectedFamilies.map((family) => family.baseName)
		)
	).sort((left, right) => left.localeCompare(right))
}

export async function runProductionsCommand(
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
	const fallbackWorkerArg =
		rawSubcommand && !isProductionSubcommand(rawSubcommand) ? rawSubcommand : parsed.args[1]
	const subcommand: ProductionSubcommand =
		rawSubcommand && isProductionSubcommand(rawSubcommand) ? rawSubcommand : 'list'
	const theme = createCliTheme(parsed.options)

	if (rawSubcommand && !isProductionSubcommand(rawSubcommand) && parsed.args.length > 2) {
		logger.error(`Unknown productions subcommand: ${rawSubcommand}`)
		logger.info(`Available productions subcommands: ${PRODUCTION_SUBCOMMANDS.join(', ')}`)
		return { exitCode: 1 }
	}

	try {
		const context = await resolveContext(parsed, options, subcommand, fallbackWorkerArg)
		const selectedFamilies =
			context.discovery.families.length > 0
				? context.discovery.families
				: context.workerName
					? [
							{
								baseName: context.workerName,
								roleLabel: 'selected worker',
								role: 'primary' as const
							}
						]
					: []

		switch (subcommand) {
			case 'versions': {
				const workerNames = resolveSelectedWorkerNames(context, selectedFamilies)
				if (workerNames.length === 0) {
					logger.error(
						'No production Workers could be resolved. Use --worker or run inside a configured package.'
					)
					return { exitCode: 1 }
				}

				const overviews = await Promise.all(
					workerNames.map((workerName) =>
						loadWorkerVersionOverview(context.accountId, workerName, CLI_API_OPTIONS)
					)
				)
				showWorkerVersions(logger, overviews, theme)
				return { exitCode: 0 }
			}

			case 'deployments': {
				const workerNames = resolveSelectedWorkerNames(context, selectedFamilies)
				if (workerNames.length === 0) {
					logger.error(
						'No production Workers could be resolved. Use --worker or run inside a configured package.'
					)
					return { exitCode: 1 }
				}

				const overviews = await Promise.all(
					workerNames.map((workerName) =>
						loadWorkerDeploymentHistory(context.accountId, workerName, CLI_API_OPTIONS)
					)
				)
				showWorkerDeployments(logger, overviews, theme)
				return { exitCode: 0 }
			}

			case 'rollback':
				return runRollback(context, parsed, options, logger, theme)

			case 'delete':
				return runDelete(context, parsed, logger)

			default: {
				if (selectedFamilies.length === 0) {
					logger.error(
						'No production Workers could be resolved. Use --worker, --config, or run inside a configured package.'
					)
					return { exitCode: 1 }
				}

				const rows = await buildProductionRows(context.accountId, selectedFamilies, CLI_API_OPTIONS)
				showProductionOverview(logger, context, rows, theme)
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
