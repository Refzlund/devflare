import type { ConsolaInstance } from 'consola'
import {
	account,
	cleanupPreviewRegistry,
	ensurePreviewRegistry,
	reconcilePreviewRegistry,
	retirePreviewRegistry,
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
	loadConfiguredWorkerFamilies,
	loadTrackedPreviewScopeRows,
	orderPreviewWorkerNamesForDeletion
} from './previews-support/family'
import {
	showBindingAssociations,
	showMissingPreviewRegistryState,
	showTrackedState,
	showWorkerFamilyOverview
} from './previews-support/render'
import { dim, green, logLine, shouldUseColor } from './previews-support/theme'
import {
	PREVIEW_SUBCOMMANDS,
	type PreviewCommandContext,
	type PreviewCleanupExecution,
	type PreviewConfigSummary,
	type PreviewOutputTheme,
	type PreviewScopeSelection,
	type PreviewSubcommand,
	type WorkerNameSource
} from './previews-support/types'

const CLI_API_OPTIONS: APIClientOptions = {
	timeout: 10000
}

function isPreviewSubcommand(value: string): value is PreviewSubcommand {
	return PREVIEW_SUBCOMMANDS.includes(value as PreviewSubcommand)
}

function asPositiveNumber(value: string | boolean | undefined, fallback: number): number {
	if (typeof value !== 'string') {
		return fallback
	}

	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
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
	config: PreviewConfigSummary | undefined,
	fallbackArg: string | undefined
): { workerName?: string; source: WorkerNameSource } {
	const selection = resolveNamedSelection({
		explicitValue: asOptionalString(parsed.options.worker),
		fallbackValue: fallbackArg,
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
	subcommand: PreviewSubcommand,
	fallbackArg: string | undefined
): Promise<PreviewCommandContext> {
	const cwd = options.cwd ?? process.cwd()
	const configFile = asOptionalString(parsed.options.config)
	const needsConfig = subcommand === 'cleanup-resources'
		|| subcommand === 'bindings'
		|| !asOptionalString(parsed.options.account)
		|| (!asOptionalString(parsed.options.worker) && !fallbackArg)
	const config = await loadLocalConfig(cwd, configFile, needsConfig)
	const accountId = await resolveAccountId(parsed, config)
	const workerSelection = resolveWorkerName(parsed, config, fallbackArg)

	if (!accountId) {
		throw new Error('No Cloudflare account could be resolved. Use --account or configure accountId in devflare.config.*.')
	}

	if (subcommand === 'reconcile' && !workerSelection.workerName) {
		throw new Error('A worker name is required for preview reconciliation. Use --worker or run inside a configured package.')
	}

	if ((subcommand === 'reconcile' || subcommand === 'retire') && !workerSelection.workerName) {
		throw new Error(`A worker name is required for preview ${subcommand}. Use --worker or run inside a configured package.`)
	}

	return {
		accountId,
		workerName: workerSelection.workerName,
		workerNameSource: workerSelection.source,
		config
	}
}

async function runProvisionSubcommand(
	context: PreviewCommandContext,
	databaseName: string | undefined,
	logger: ConsolaInstance
): Promise<CliResult> {
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

async function runReconcileSubcommand(
	context: PreviewCommandContext,
	databaseName: string | undefined,
	logger: ConsolaInstance,
	includeAll: boolean,
	theme: PreviewOutputTheme
): Promise<CliResult> {
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
	await showTrackedState(result.registry, { workerName: context.workerName }, logger, includeAll, theme, CLI_API_OPTIONS)
	return { exitCode: 0 }
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
	databaseName: string | undefined,
	logger: ConsolaInstance
): Promise<CliResult> {
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

async function runRetireSubcommand(
	parsed: ParsedArgs,
	context: PreviewCommandContext,
	databaseName: string | undefined,
	logger: ConsolaInstance
): Promise<CliResult> {
	if (!context.workerName) {
		logger.error('A worker name is required for preview retirement')
		return { exitCode: 1 }
	}

	if (parsed.options['preview-alias'] !== undefined) {
		logger.error('Preview retirement no longer accepts --preview-alias. Use --alias <alias> instead.')
		return { exitCode: 1 }
	}

	const branchName = asOptionalString(parsed.options.branch)
	const previewAlias = asOptionalString(parsed.options.alias)
	const versionId = asOptionalString(parsed.options.version)
		|| asOptionalString(parsed.options['version-id'])
	const commitSha = asOptionalString(parsed.options.sha)
		|| asOptionalString(parsed.options['commit-sha'])

	if (!branchName && !previewAlias && !versionId && !commitSha) {
		logger.error('Preview retirement needs at least one selector: --branch, --alias, --version-id, or --commit-sha')
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

async function runCleanupResourcesSubcommand(
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
	options: CliOptions,
	databaseName: string | undefined,
	environment: string | undefined,
	configFile: string | undefined,
	includeAll: boolean,
	theme: PreviewOutputTheme
): Promise<CliResult> {
	const cwd = options.cwd ?? process.cwd()
	const configuredFamilies = context.workerNameSource === 'config' && context.config?.name
		? await loadConfiguredWorkerFamilies(cwd, configFile, environment)
		: undefined
	const registry = await account.getPreviewRegistryContext({
		accountId: context.accountId,
		databaseName,
		apiOptions: CLI_API_OPTIONS,
		skipContextCache: true
	})

	if (!registry) {
		showMissingPreviewRegistryState(logger, configuredFamilies, theme)
		return { exitCode: 0 }
	}

	if (configuredFamilies && configuredFamilies.length > 0) {
		await showWorkerFamilyOverview(registry, configuredFamilies, logger, includeAll, theme, CLI_API_OPTIONS)
		return { exitCode: 0 }
	}

	const scope = context.workerNameSource === 'config' && context.config?.name
		? { workerFamilyName: context.config.name }
		: { workerName: context.workerName }
	await showTrackedState(registry, scope, logger, includeAll, theme, CLI_API_OPTIONS)
	return { exitCode: 0 }
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
		useColor: shouldUseColor(parsed.options as Record<string, string | boolean>)
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
		const configFile = asOptionalString(parsed.options.config)

		switch (subcommand) {
			case 'provision':
				return runProvisionSubcommand(context, databaseName, logger)

			case 'reconcile':
				return runReconcileSubcommand(context, databaseName, logger, includeAll, theme)

			case 'bindings':
				return runBindingsSubcommand(parsed, context, logger, options, environment, configFile, theme)

			case 'cleanup':
				return runCleanupSubcommand(parsed, context, databaseName, logger)

			case 'retire':
				return runRetireSubcommand(parsed, context, databaseName, logger)

			case 'cleanup-resources':
				return runCleanupResourcesSubcommand(
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
				return runListSubcommand(context, logger, options, databaseName, environment, configFile, includeAll, theme)
		}
	} catch (error) {
		if (error instanceof Error) {
			logger.error(error.message)
			return { exitCode: 1 }
		}

		throw error
	}
}
