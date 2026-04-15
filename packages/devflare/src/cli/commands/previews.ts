import type { ConsolaInstance } from 'consola'
import {
	account,
	type APIClientOptions
} from '../../cloudflare'
import { loadResolvedConfig, resolvePreviewIdentifier } from '../../config'
import { cleanupPreviewScopedResources } from '../../config/preview-resources'
import { ConfigNotFoundError, loadConfig, resolveConfigPath } from '../../config/loader'
import {
	asOptionalString,
	resolveCloudflareAccountId,
	resolveNamedSelection
} from '../command-utils'
import { findConfigPathsUnderDirectory } from '../config-path'
import { getDependencies } from '../dependencies'
import type { CliOptions, CliResult, ParsedArgs } from '../index'
import { inspectBindingAssociations } from '../preview-bindings'
import {
	buildPreviewCleanupTarget,
	buildPreviewCleanupTargets,
	getPreviewCleanupResourceCandidateCount,
	logPreviewCleanupScopeBreakdown,
	logResolvedPreviewScopes,
	retireDeletedPreviewWorkers,
	showNoPreviewCleanupCandidatesHint
} from './previews-support/cleanup'
import {
	buildPreviewWorkerCandidatesByScope,
	collectConfiguredWorkerFamilies,
	loadTrackedPreviewScopeRows,
	orderPreviewWorkerNamesForDeletion
} from './previews-support/family'
import {
	showBindingAssociations,
	showWorkspaceWorkerFamilyOverviewFromLiveWorkers,
	showWorkerFamilyOverviewFromLiveWorkers
} from './previews-support/render'
import { dim, green, logLine, shouldUseColor } from './previews-support/theme'
import {
	type ConfiguredWorkerFamilyMember,
	PREVIEW_SUBCOMMANDS,
	type PreviewCommandContext,
	type PreviewConfiguredFamilyGroup,
	type PreviewCleanupExecution,
	type PreviewConfigSummary,
	type PreviewListDiscovery,
	type PreviewOutputTheme,
	type PreviewScopeSelection,
	type PreviewSubcommand,
	type WorkerNameSource
} from './previews-support/types'

const CLI_API_OPTIONS: APIClientOptions = {
	timeout: 10000
}

function compareConfiguredWorkerFamilies(
	left: ConfiguredWorkerFamilyMember,
	right: ConfiguredWorkerFamilyMember
): number {
	if (left.role === 'primary' && right.role !== 'primary') {
		return -1
	}

	if (left.role !== 'primary' && right.role === 'primary') {
		return 1
	}

	return left.baseName.localeCompare(right.baseName)
}

function sortConfiguredWorkerFamilies(
	families: ConfiguredWorkerFamilyMember[]
): ConfiguredWorkerFamilyMember[] {
	return [...families].sort(compareConfiguredWorkerFamilies)
}

function resolvePrimaryWorkerFamilyName(
	families: ConfiguredWorkerFamilyMember[]
): string | undefined {
	return families.find((family) => family.role === 'primary')?.baseName ?? families[0]?.baseName
}

function shouldReplaceConfiguredWorkerFamily(
	existing: ConfiguredWorkerFamilyMember | undefined,
	candidate: ConfiguredWorkerFamilyMember
): boolean {
	return !existing || (candidate.role === 'primary' && existing.role !== 'primary')
}

function mergeConfiguredWorkerFamilies(
	existing: ConfiguredWorkerFamilyMember[],
	candidates: ConfiguredWorkerFamilyMember[]
): ConfiguredWorkerFamilyMember[] {
	const merged = new Map(existing.map((family) => [family.baseName, family]))

	for (const candidate of candidates) {
		if (shouldReplaceConfiguredWorkerFamily(merged.get(candidate.baseName), candidate)) {
			merged.set(candidate.baseName, candidate)
		}
	}

	return sortConfiguredWorkerFamilies(Array.from(merged.values()))
}

function comparePreviewConfiguredFamilyGroups(
	left: PreviewConfiguredFamilyGroup,
	right: PreviewConfiguredFamilyGroup
): number {
	const leftName = resolvePrimaryWorkerFamilyName(left.families) ?? left.configPath ?? ''
	const rightName = resolvePrimaryWorkerFamilyName(right.families) ?? right.configPath ?? ''
	return leftName.localeCompare(rightName)
}

function upsertPreviewConfiguredFamilyGroup(
	groups: Map<string, PreviewConfiguredFamilyGroup>,
	candidate: PreviewConfiguredFamilyGroup
): void {
	const primaryFamilyName = resolvePrimaryWorkerFamilyName(candidate.families)
	const groupKey = primaryFamilyName ?? candidate.configPath ?? `group-${groups.size}`
	const existing = groups.get(groupKey)

	if (!existing) {
		groups.set(groupKey, {
			...candidate,
			families: sortConfiguredWorkerFamilies(candidate.families)
		})
		return
	}

	groups.set(groupKey, {
		accountId: existing.accountId ?? candidate.accountId,
		configPath: existing.configPath ?? candidate.configPath,
		families: mergeConfiguredWorkerFamilies(existing.families, candidate.families)
	})
}

async function discoverPreviewListConfigs(
	cwd: string,
	configFile: string | undefined,
	environment: string | undefined
): Promise<PreviewListDiscovery> {
	const groups = new Map<string, PreviewConfiguredFamilyGroup>()
	const accountIds = new Set<string>()

	const loadAndCollect = async (candidateConfigFile?: string): Promise<boolean> => {
		try {
			const config = await loadConfig({ cwd, configFile: candidateConfigFile })
			const families = collectConfiguredWorkerFamilies(config, environment)
			const accountId = config.accountId?.trim() || undefined

			if (accountId) {
				accountIds.add(accountId)
			}

			upsertPreviewConfiguredFamilyGroup(groups, {
				accountId,
				configPath: candidateConfigFile,
				families
			})

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
		const directConfigPath = await resolveConfigPath(cwd)
		const loadedDirectly = directConfigPath
			? await loadAndCollect()
			: false
		if (!loadedDirectly) {
			const configPaths = await findConfigPathsUnderDirectory(cwd)
			for (const configPath of configPaths) {
				await loadAndCollect(configPath)
			}
		}
	}

	return {
		accountIds: Array.from(accountIds).sort((left, right) => left.localeCompare(right)),
		familyGroups: Array.from(groups.values()).sort(comparePreviewConfiguredFamilyGroups)
	}
}

function isPreviewSubcommand(value: string): value is PreviewSubcommand {
	return PREVIEW_SUBCOMMANDS.includes(value as PreviewSubcommand)
}

function resolvePreviewScopeSelection(
	parsed: ParsedArgs,
	environment: string | undefined
): PreviewScopeSelection {
	const explicitScope = asOptionalString(parsed.options.scope)
		|| asOptionalString(parsed.options.identifier)

	if (explicitScope) {
		return {
			identifier: resolvePreviewIdentifier({ identifier: explicitScope }).identifier,
			source: 'scope-option'
		}
	}

	const resolved = resolvePreviewIdentifier({
		environment,
		env: process.env
	})

	return {
		identifier: resolved.identifier,
		source: resolved.source
	}
}

function formatPreviewScopeSource(source: PreviewScopeSelection['source']): string {
	switch (source) {
		case 'scope-option':
			return '--scope'
		case 'identifier':
			return 'explicit identifier'
		case 'env-identifier':
			return 'DEVFLARE_PREVIEW_IDENTIFIER'
		case 'env-pr':
			return 'DEVFLARE_PREVIEW_PR'
		case 'env-branch':
			return 'DEVFLARE_PREVIEW_BRANCH'
		case 'environment':
			return 'default preview scope'
		default:
			return 'no explicit preview scope'
	}
}

function logResolvedPreviewScope(
	logger: ConsolaInstance,
	selection: PreviewScopeSelection,
	theme: PreviewOutputTheme
): void {
	if (!selection.identifier) {
		return
	}

	logLine(
		logger,
		`${dim('preview scope', theme)} ${green(selection.identifier, theme)} ${dim(`(${formatPreviewScopeSource(selection.source)})`, theme)}`
	)
	logLine(logger)
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

		try {
			const config = await loadConfig({
				cwd
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
	return resolveCloudflareAccountId({
		explicitAccountId: asOptionalString(parsed.options.account),
		configuredAccountId: config?.accountId,
		apiOptions: CLI_API_OPTIONS
	})
}

function resolveWorkerName(
	parsed: ParsedArgs,
	config: PreviewConfigSummary | undefined
): { workerName?: string; source: WorkerNameSource } {
	const selection = resolveNamedSelection({
		explicitValue: asOptionalString(parsed.options.worker),
		configuredValue: config?.name
	})

	return {
		workerName: selection.value,
		source: selection.source
	}
}

async function resolveContext(
	parsed: ParsedArgs,
	options: CliOptions,
	subcommand: PreviewSubcommand
): Promise<PreviewCommandContext> {
	const cwd = options.cwd ?? process.cwd()
	const configFile = asOptionalString(parsed.options.config)
	const explicitAccountId = asOptionalString(parsed.options.account)
	const environment = asOptionalString(parsed.options.env)

	if (subcommand === 'list') {
		const listDiscovery = await discoverPreviewListConfigs(cwd, configFile, environment)

		if (!explicitAccountId && listDiscovery.accountIds.length > 1) {
			throw new Error(
				'Multiple Cloudflare account ids were discovered across local Devflare configs. Pass --account to select one account explicitly for `devflare previews`.'
			)
		}

		const accountId = await resolveCloudflareAccountId({
			explicitAccountId,
			configuredAccountId: listDiscovery.accountIds[0],
			apiOptions: CLI_API_OPTIONS
		})

		if (!accountId) {
			throw new Error('No Cloudflare account could be resolved. Use --account or configure accountId in devflare.config.*.')
		}

		return {
			accountId,
			workerName: undefined,
			workerNameSource: 'none',
			config: undefined,
			listDiscovery
		}
	}

	const needsConfig = subcommand === 'cleanup'
		|| subcommand === 'bindings'
		|| !explicitAccountId
	const config = await loadLocalConfig(cwd, configFile, needsConfig)

	if (needsConfig && !config) {
		throw new Error('Preview commands now inspect and clean dedicated preview workers for the current package. Run inside a configured package or pass --config <path>.')
	}

	const accountId = await resolveAccountId(parsed, config)
	const workerSelection = resolveWorkerName(parsed, config)

	if (!accountId) {
		throw new Error('No Cloudflare account could be resolved. Use --account or configure accountId in devflare.config.*.')
	}

	return {
		accountId,
		workerName: workerSelection.workerName,
		workerNameSource: workerSelection.source,
		config
	}
}

async function runBindingsSubcommand(
	parsed: ParsedArgs,
	context: PreviewCommandContext,
	logger: ConsolaInstance,
	options: CliOptions,
	environment: string | undefined,
	configFile: string | undefined,
	theme: PreviewOutputTheme
): Promise<CliResult> {
	const cwd = options.cwd ?? process.cwd()
	const previewScope = resolvePreviewScopeSelection(parsed, environment)
	logResolvedPreviewScope(logger, previewScope, theme)
	const resolvedConfig = await loadResolvedConfig({
		cwd,
		configFile,
		environment,
		identifier: previewScope.identifier,
		accountId: context.accountId
	})
	const deps = await getDependencies()
	const inspection = await inspectBindingAssociations({
		accountId: context.accountId,
		config: resolvedConfig,
		workerName: context.workerName ?? resolvedConfig.name,
		cwd,
		exec: deps.exec,
		apiOptions: CLI_API_OPTIONS
	})

	showBindingAssociations(logger, inspection, theme)
	return { exitCode: 0 }
}

async function runCleanupSubcommand(
	parsed: ParsedArgs,
	context: PreviewCommandContext,
	logger: ConsolaInstance,
	options: CliOptions,
	databaseName: string | undefined,
	environment: string | undefined,
	configFile: string | undefined,
	includeAll: boolean,
	theme: PreviewOutputTheme
): Promise<CliResult> {
	const cwd = options.cwd ?? process.cwd()
	const resolvedEnvironment = environment ?? 'preview'
	const explicitScope = asOptionalString(parsed.options.scope)
		|| asOptionalString(parsed.options.identifier)

	if (includeAll && explicitScope) {
		logger.error('Choose either --scope <name> or --all for preview cleanup, not both.')
		return { exitCode: 1 }
	}

	const previewScope = resolvePreviewScopeSelection(parsed, resolvedEnvironment)
	const config = await loadConfig({ cwd, configFile })
	const configuredFamilies = collectConfiguredWorkerFamilies(config, resolvedEnvironment)
	const liveWorkers = await account.workers(context.accountId, CLI_API_OPTIONS)
	const workerCandidatesByScope = buildPreviewWorkerCandidatesByScope(configuredFamilies, liveWorkers)
	const trackedScopeRows = includeAll || previewScope.identifier
		? await loadTrackedPreviewScopeRows(context.accountId, databaseName, configuredFamilies, CLI_API_OPTIONS)
		: []
	const cleanupTargets = includeAll
		? buildPreviewCleanupTargets(trackedScopeRows, workerCandidatesByScope, resolvedEnvironment)
		: previewScope.identifier
			? [buildPreviewCleanupTarget(previewScope.identifier, trackedScopeRows, workerCandidatesByScope, resolvedEnvironment)]
			: []
	const cleanupRuns = cleanupTargets.length > 0
		? cleanupTargets.map((target) => ({
			scope: target.scope,
			target
		}))
		: [{
			scope: previewScope.identifier,
			target: undefined
		}]
	const applyCleanup = parsed.options.apply === true
	const executions: PreviewCleanupExecution[] = []

	if (includeAll) {
		logResolvedPreviewScopes(logger, cleanupTargets, theme)
	} else {
		logResolvedPreviewScope(logger, previewScope, theme)
	}

	for (const cleanupRun of cleanupRuns) {
		if (applyCleanup) {
			const orderedWorkerNames = cleanupRun.target
				? orderPreviewWorkerNamesForDeletion(cleanupRun.target.workerNames, cleanupRun.target.scope, configuredFamilies)
				: []

			for (const workerName of orderedWorkerNames) {
				await account.deleteWorker(context.accountId, workerName, CLI_API_OPTIONS)
			}

			if (cleanupRun.target && orderedWorkerNames.length > 0) {
				await retireDeletedPreviewWorkers(
					context.accountId,
					databaseName,
					cleanupRun.target.scope,
					orderedWorkerNames
				)
			}
		}

		const result = await cleanupPreviewScopedResources(config, {
			environment: resolvedEnvironment,
			identifier: cleanupRun.scope,
			accountId: context.accountId,
			apply: applyCleanup
		})

		executions.push({
			target: cleanupRun.target,
			result
		})
	}

	const totalWorkerCandidates = executions.reduce((sum, execution) => {
		return sum + (execution.target?.workerNames.length ?? 0)
	}, 0)
	const totalKvCandidates = executions.reduce((sum, execution) => sum + execution.result.candidates.kv.length, 0)
	const totalD1Candidates = executions.reduce((sum, execution) => sum + execution.result.candidates.d1.length, 0)
	const totalR2Candidates = executions.reduce((sum, execution) => sum + execution.result.candidates.r2.length, 0)
	const totalQueueCandidates = executions.reduce((sum, execution) => sum + execution.result.candidates.queues.length, 0)
	const totalVectorizeCandidates = executions.reduce((sum, execution) => sum + execution.result.candidates.vectorize.length, 0)
	const totalHyperdriveCandidates = executions.reduce((sum, execution) => sum + execution.result.candidates.hyperdrive.length, 0)
	const totalResourceCandidates = executions.reduce((sum, execution) => {
		return sum + getPreviewCleanupResourceCandidateCount(execution.result)
	}, 0)
	const totalCandidates = totalWorkerCandidates + totalResourceCandidates
	const scopeCountSuffix = includeAll || previewScope.identifier
		? ` across ${cleanupRuns.length} preview scope${cleanupRuns.length === 1 ? '' : 's'}`
		: ''

	logger.success(
		applyCleanup
			? `Deleted ${totalCandidates} preview-only cleanup candidate${totalCandidates === 1 ? '' : 's'}${scopeCountSuffix}`
			: `Preview cleanup dry run complete with ${totalCandidates} candidate${totalCandidates === 1 ? '' : 's'}${scopeCountSuffix}`
	)

	const resourceSummary = [
		totalWorkerCandidates > 0 ? `Workers ${totalWorkerCandidates}` : null,
		totalKvCandidates > 0 ? `KV ${totalKvCandidates}` : null,
		totalD1Candidates > 0 ? `D1 ${totalD1Candidates}` : null,
		totalR2Candidates > 0 ? `R2 ${totalR2Candidates}` : null,
		totalQueueCandidates > 0 ? `Queues ${totalQueueCandidates}` : null,
		totalVectorizeCandidates > 0 ? `Vectorize ${totalVectorizeCandidates}` : null,
		totalHyperdriveCandidates > 0 ? `Hyperdrive ${totalHyperdriveCandidates}` : null
	].filter((segment): segment is string => segment !== null)

	if (resourceSummary.length > 0) {
		logger.info(`Candidates: ${resourceSummary.join(' · ')}`)
	} else {
		logger.info('Candidates: none')
		showNoPreviewCleanupCandidatesHint(logger, previewScope, includeAll, theme)
	}

	if (includeAll || executions.some((execution) => Boolean(execution.target?.workerNames.length))) {
		logPreviewCleanupScopeBreakdown(logger, executions, theme)
	}

	const warnings = Array.from(new Set(executions.flatMap((execution) => execution.result.warnings)))
	for (const warning of warnings) {
		logger.warn(warning)
	}

	return { exitCode: 0 }
}

async function runListSubcommand(
	context: PreviewCommandContext,
	logger: ConsolaInstance,
	theme: PreviewOutputTheme
): Promise<CliResult> {
	const discoveredFamilyGroups = context.listDiscovery?.familyGroups ?? []
	if (discoveredFamilyGroups.length === 0) {
		throw new Error('Preview listing needs a resolvable devflare config in the current package or workspace so Devflare can identify worker families.')
	}

	const matchingFamilyGroups = discoveredFamilyGroups.filter((group) => {
		return !group.accountId || group.accountId === context.accountId
	})

	if (matchingFamilyGroups.length === 0) {
		throw new Error(
			`No configured preview worker families matched Cloudflare account ${context.accountId}. Pass --account or --config <path> to narrow the selection.`
		)
	}

	const liveWorkers = await account.workers(context.accountId, CLI_API_OPTIONS)
	const workersSubdomain = await account.workersSubdomain(context.accountId, CLI_API_OPTIONS)

	if (matchingFamilyGroups.length === 1) {
		showWorkerFamilyOverviewFromLiveWorkers(
			matchingFamilyGroups[0]!.families,
			liveWorkers,
			workersSubdomain,
			logger,
			theme
		)
		return { exitCode: 0 }
	}

	showWorkspaceWorkerFamilyOverviewFromLiveWorkers(
		matchingFamilyGroups.map((group) => group.families),
		liveWorkers,
		workersSubdomain,
		logger,
		theme
	)
	return { exitCode: 0 }
}

function resolvePreviewSubcommand(rawSubcommand: string | undefined): PreviewSubcommand | undefined {
	if (!rawSubcommand) {
		return undefined
	}

	if (isPreviewSubcommand(rawSubcommand)) {
		return rawSubcommand
	}

	return undefined
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
	const subcommand = resolvePreviewSubcommand(rawSubcommand) ?? 'list'
	const includeAll = parsed.options.all === true
	const theme: PreviewOutputTheme = {
		useColor: shouldUseColor(parsed.options as Record<string, string | boolean>)
	}

	if (rawSubcommand && !resolvePreviewSubcommand(rawSubcommand)) {
		logger.error(`Unknown previews subcommand: ${rawSubcommand}`)
		logger.info(`Available previews subcommands: ${PREVIEW_SUBCOMMANDS.join(', ')}`)
		return { exitCode: 1 }
	}

	try {
		const context = await resolveContext(parsed, options, subcommand)
		const databaseName = asOptionalString(parsed.options.database)
		const environment = asOptionalString(parsed.options.env)
		const configFile = asOptionalString(parsed.options.config)

		switch (subcommand) {
			case 'bindings':
				return runBindingsSubcommand(parsed, context, logger, options, environment, configFile, theme)

			case 'cleanup':
				return runCleanupSubcommand(
					parsed,
					context,
					logger,
					options,
					databaseName,
					environment,
					configFile,
					includeAll,
					theme
				)

			case 'list':
			default:
				return runListSubcommand(context, logger, theme)
		}
	} catch (error) {
		if (error instanceof Error) {
			logger.error(error.message)
			return { exitCode: 1 }
		}

		throw error
	}
}
