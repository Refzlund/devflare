// =============================================================================
// Deploy Command — Deploy to Cloudflare
// =============================================================================

import { type ConsolaInstance } from 'consola'
import { join } from 'pathe'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { loadResolvedConfig } from '../../config'
import {
	getPrimaryAccount,
	getWorkerVersionDetail,
	listWorkerVersions,
	getWorkersSubdomain,
	listWorkerDeployments
} from '../../cloudflare/account'
import { getEffectiveAccountId } from '../../cloudflare/preferences'
import { compileConfig, stringifyConfig } from '../../config/compiler'
import { getDependencies } from '../dependencies'
import { prepareBuildArtifacts } from './build-artifacts'
import {
	formatWorkersDevUrl,
	mergeParsedWranglerDeployOutputs,
	parseWranglerDeployOutput,
	parseWranglerStructuredOutput
} from '../preview'
import {
	applyResolvedDeployTarget,
	resolveDeployTarget,
	withTemporaryEnvironment
} from '../deploy-target'
import { applyDeploymentStrategy, describeDeploymentStrategy } from '../deploy-strategy'
import { reconcilePreviewRegistry } from '../../cloudflare/preview-registry'
import { createCliTheme, dim, green, logLine, yellow, yellowBold } from '../ui'
import { resolvePackageSpecifier } from '../../utils/resolve-package'

async function getCurrentGitBranch(cwd: string): Promise<string | null> {
	const deps = await getDependencies()
	const gitResult = await deps.exec.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
	if (gitResult.exitCode !== 0) {
		return null
	}

	const branchName = gitResult.stdout.trim()
	if (!branchName || branchName === 'HEAD') {
		return null
	}

	return branchName
}

async function resolveLocalWranglerExecutable(
	cwd: string,
	fs: Awaited<ReturnType<typeof getDependencies>>['fs']
): Promise<string | null> {
	const wranglerExecutablePath = resolvePackageSpecifier('wrangler/bin/wrangler.js', cwd)

	try {
		await fs.access(wranglerExecutablePath)
		return wranglerExecutablePath
	} catch {
		return null
	}
}

function inferRecordSource(): 'cli' | 'github-action' {
	return process.env.GITHUB_ACTIONS === 'true' ? 'github-action' : 'cli'
}

function shouldVerifyDeployControlPlane(): boolean {
	const configured = process.env.DEVFLARE_VERIFY_DEPLOYMENT?.trim().toLowerCase()
	if (!configured) {
		return false
	}

	return !['0', 'false', 'no', 'off'].includes(configured)
}

function shouldRequireFreshProductionDeployment(): boolean {
	const configured = process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT?.trim().toLowerCase()
	if (!configured) {
		return false
	}

	return !['0', 'false', 'no', 'off'].includes(configured)
}

function getDeployVerificationSettings(): { attempts: number; delayMs: number } {
	const attempts = Number.parseInt(process.env.DEVFLARE_VERIFY_DEPLOYMENT_ATTEMPTS ?? '', 10)
	const delayMs = Number.parseInt(process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS ?? '', 10)

	return {
		attempts: Number.isFinite(attempts) && attempts > 0 ? attempts : 5,
		delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 1500
	}
}

const DEPLOYMENT_LOOKBACK_TOLERANCE_MS = 2 * 60 * 1000

function normalizeCloudflareAccountId(value: string | undefined): string | undefined {
	const trimmed = value?.trim()
	if (!trimmed) {
		return undefined
	}

	return /^[a-f0-9]{32}$/i.test(trimmed) ? trimmed : undefined
}

async function waitForDeployVerification(delayMs: number): Promise<void> {
	if (delayMs <= 0) {
		return
	}

	await new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function retryDeployVerification<T>(
	description: string,
	operation: () => Promise<T>
): Promise<T> {
	const { attempts, delayMs } = getDeployVerificationSettings()
	let lastError: unknown

	for (let attempt = 1;attempt <= attempts;attempt++) {
		try {
			return await operation()
		} catch (error) {
			lastError = error
			if (attempt < attempts) {
				await waitForDeployVerification(delayMs)
			}
		}
	}

	const message = lastError instanceof Error ? lastError.message : String(lastError)
	throw new Error(
		`Cloudflare could not verify ${description} after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${message}`
	)
}

async function resolveDeployAccountId(
	preferredAccountId: string | undefined
): Promise<string | undefined> {
	if (preferredAccountId !== undefined) {
		return normalizeCloudflareAccountId(preferredAccountId)
	}

	const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
	const apiKey = process.env.CLOUDFLARE_API_KEY?.trim()
	const apiEmail = process.env.CLOUDFLARE_EMAIL?.trim()
	if (!apiToken && !(apiKey && apiEmail)) {
		return undefined
	}

	try {
		const primaryAccount = await getPrimaryAccount()
		if (!primaryAccount) {
			return undefined
		}

		const effective = await getEffectiveAccountId(primaryAccount.id)
		return normalizeCloudflareAccountId(effective.accountId)
	} catch {
		return undefined
	}
}

function selectDeploymentVersionId(deployment: {
	versions: Array<{
		percentage: number
		versionId: string
	}>
}): string | undefined {
	return deployment.versions.find((version) => version.percentage === 100)?.versionId
		?? deployment.versions[0]?.versionId
}

function getWorkerVersionTimestamp(version: {
	metadata: {
		createdOn?: Date
		modifiedOn?: Date
	}
}): Date | undefined {
	return version.metadata.modifiedOn ?? version.metadata.createdOn
}

async function resolveVersionIdFromLatestDeployment(options: {
	accountId: string
	workerName: string
	verificationDescription: string
	deploymentLabel: 'Latest deployment' | 'Current deployment'
	deployedAfter?: Date
}): Promise<{
	deploymentId: string
	versionId: string
}> {
	return retryDeployVerification(options.verificationDescription, async () => {
		const deployments = await listWorkerDeployments(options.accountId, options.workerName)
		const latestDeployment = [...deployments].sort(
			(a, b) => b.createdOn.getTime() - a.createdOn.getTime()
		)[0]

		if (!latestDeployment) {
			throw new Error(`No deployments were found for Worker "${options.workerName}".`)
		}

		if (
			options.deployedAfter
			&& latestDeployment.createdOn.getTime() < options.deployedAfter.getTime() - DEPLOYMENT_LOOKBACK_TOLERANCE_MS
		) {
			throw new Error(
				`${options.deploymentLabel} ${latestDeployment.id} was created before this deploy started.`
			)
		}

		const versionId = selectDeploymentVersionId(latestDeployment)
		if (!versionId) {
			throw new Error(
				`${options.deploymentLabel} ${latestDeployment.id} does not reference any version ids.`
			)
		}

		return {
			deploymentId: latestDeployment.id,
			versionId
		}
	})
}

async function resolveVersionIdFromLatestWorkerVersion(options: {
	accountId: string
	workerName: string
	preview: boolean
	deployedAfter: Date
}): Promise<string> {
	return retryDeployVerification(
		`the latest ${options.preview ? 'preview ' : ''}version for Worker "${options.workerName}"`,
		async () => {
			const versions = await listWorkerVersions(options.accountId, options.workerName)
			const latestVersion = [...versions]
				.filter((version) => version.id)
				.filter((version) => version.metadata.hasPreview === options.preview)
				.sort((a, b) => {
					const left = getWorkerVersionTimestamp(a)?.getTime() ?? 0
					const right = getWorkerVersionTimestamp(b)?.getTime() ?? 0
					return right - left
				})[0]

			if (!latestVersion) {
				throw new Error(
					`No ${options.preview ? 'preview ' : ''}versions were found for Worker "${options.workerName}".`
				)
			}

			const latestVersionTimestamp = getWorkerVersionTimestamp(latestVersion)
			if (!latestVersionTimestamp) {
				throw new Error(
					`Latest version ${latestVersion.id} did not include a creation timestamp.`
				)
			}

			if (latestVersionTimestamp.getTime() < options.deployedAfter.getTime() - DEPLOYMENT_LOOKBACK_TOLERANCE_MS) {
				throw new Error(
					`Latest version ${latestVersion.id} was created before this deploy started.`
				)
			}

			return latestVersion.id
		}
	)
}

async function resolveVersionIdFromLatestProductionDeployment(options: {
	accountId: string
	workerName: string
	deployedAfter: Date
}): Promise<{
	deploymentId: string
	versionId: string
}> {
	return resolveVersionIdFromLatestDeployment({
		accountId: options.accountId,
		workerName: options.workerName,
		verificationDescription: `the latest deployment for Worker "${options.workerName}"`,
		deploymentLabel: 'Latest deployment',
		deployedAfter: options.deployedAfter
	})
}

async function resolveVersionIdFromCurrentProductionDeployment(options: {
	accountId: string
	workerName: string
}): Promise<{
	deploymentId: string
	versionId: string
}> {
	return resolveVersionIdFromLatestDeployment({
		accountId: options.accountId,
		workerName: options.workerName,
		verificationDescription: `the current active deployment for Worker "${options.workerName}"`,
		deploymentLabel: 'Current deployment'
	})
}

async function verifyDeployControlPlane(options: {
	accountId: string
	workerName: string
	versionId: string
	preview: boolean
	logger: ConsolaInstance
	theme: ReturnType<typeof createCliTheme>
}): Promise<void> {
	logLine(options.logger, dim('Verifying Cloudflare control-plane state…', options.theme))

	await retryDeployVerification(`Worker version ${options.versionId}`, async () => {
		const version = await getWorkerVersionDetail(
			options.accountId,
			options.workerName,
			options.versionId
		)

		if (!version.id) {
			throw new Error(`Cloudflare returned an empty version record for ${options.versionId}.`)
		}

		return version
	})

	if (options.preview) {
		options.logger.success(
			`Verified preview upload in Cloudflare control plane for version ${options.versionId}`
		)
		return
	}

	const deployment = await retryDeployVerification(
		`a deployment that references version ${options.versionId}`,
		async () => {
			const deployments = await listWorkerDeployments(options.accountId, options.workerName)
			const match = deployments.find((item) =>
				item.versions.some((version) => version.versionId === options.versionId)
			)

			if (!match) {
				throw new Error(
					`No deployment for Worker "${options.workerName}" references version ${options.versionId} yet.`
				)
			}

			return match
		}
	)

	options.logger.success(
		`Verified Cloudflare deployment ${deployment.id} for version ${options.versionId}`
	)
}

export async function runDeployCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	let deployTarget = {
		mode: 'implicit',
		envOverrides: {}
	} as ReturnType<typeof resolveDeployTarget>
	let resolvedParsed = parsed
	const cwd = options.cwd || process.cwd()
	let configPath: string | undefined
	let environment: string | undefined
	let dryRun = false
	let preview = false
	let branchName: string | undefined
	let deployMessage: string | undefined
	let deployTag: string | undefined
	let previewScopeName: string | undefined
	let requireFreshProductionDeployment = false
	const theme = createCliTheme(parsed.options)

	logLine(logger)
	logLine(logger, `${yellowBold('deploy', theme)} ${dim('Shipping to Cloudflare', theme)}`)

	try {
		deployTarget = resolveDeployTarget(parsed, {
			requireExplicitTarget: options.requireExplicitDeployTarget === true
		})
		resolvedParsed = applyResolvedDeployTarget(parsed, deployTarget)
		configPath = resolvedParsed.options.config as string | undefined
		environment = resolvedParsed.options.env as string | undefined
		dryRun = resolvedParsed.options['dry-run'] === true
		preview = deployTarget.mode === 'preview-upload'
		branchName = resolvedParsed.options['branch-name'] as string | undefined
		deployMessage = resolvedParsed.options.message as string | undefined
		deployTag = resolvedParsed.options.tag as string | undefined
		previewScopeName = branchName?.trim() || deployTarget.previewScopeRaw || undefined
		requireFreshProductionDeployment = !preview && shouldRequireFreshProductionDeployment()

		return await withTemporaryEnvironment(deployTarget.envOverrides, async () => {
			const resolvedPreviewScopeName = previewScopeName || process.env.DEVFLARE_PREVIEW_BRANCH?.trim() || undefined
			if (dryRun) {
				const config = await loadResolvedConfig({ cwd, configFile: configPath, environment })
				const deploymentStrategy = applyDeploymentStrategy(config, {
					environment,
					preview,
					branchName,
					previewBranch: process.env.DEVFLARE_PREVIEW_BRANCH
				})
				const wranglerConfig = compileConfig(deploymentStrategy.config)

				logLine(logger, `${yellow('dry run', theme)} ${dim('Skipping actual deployment', theme)}`)
				const deploymentStrategyMessage = describeDeploymentStrategy(deploymentStrategy)
				if (deploymentStrategyMessage) {
					logLine(logger, dim(deploymentStrategyMessage, theme))
				}
				logLine(logger, dim('Would deploy with wrangler config:', theme))
				logLine(logger, stringifyConfig(wranglerConfig))
				return { exitCode: 0 }
			}

			const deps = await getDependencies()
			const prepared = await prepareBuildArtifacts(resolvedParsed, logger, options)
			logLine(logger, `${dim('worker', theme)} ${green(prepared.config.name, theme)}`)
			const localWranglerExecutable = await resolveLocalWranglerExecutable(cwd, deps.fs)

			const isBranchScopedPreviewDeployment = !preview
				&& environment === 'preview'
				&& typeof resolvedPreviewScopeName === 'string'
				&& resolvedPreviewScopeName.length > 0

			if (preview) {
				logger.warn('Cloudflare preview uploads cannot be the first upload for a brand-new Worker.')
				if (prepared.config.bindings?.durableObjects && Object.keys(prepared.config.bindings.durableObjects).length > 0) {
					logger.warn('Cloudflare does not currently generate preview URLs for Workers that implement Durable Objects.')
				}
				if (prepared.config.migrations && prepared.config.migrations.length > 0) {
					logger.warn('Cloudflare versions upload does not currently support Durable Object migrations.')
				}
			}

			// Deploy with wrangler
			logLine(logger, dim(preview ? 'Uploading preview version with Wrangler…' : 'Deploying with Wrangler…', theme))
			const deployStartedAt = new Date()

			const wranglerOutputDirectory = join(cwd, '.devflare')
			const wranglerOutputFilePath = join(
				wranglerOutputDirectory,
				`wrangler-output-${Date.now()}-${process.pid}.ndjson`
			)
			await deps.fs.mkdir(wranglerOutputDirectory, { recursive: true })

			const wranglerCommand = localWranglerExecutable ? 'bun' : 'bunx'
			const wranglerArgs = preview
				? localWranglerExecutable
					? [localWranglerExecutable, 'versions', 'upload']
					: ['wrangler', 'versions', 'upload']
				: localWranglerExecutable
					? [localWranglerExecutable, 'deploy']
					: ['wrangler', 'deploy']

			if (deployMessage?.trim()) {
				wranglerArgs.push('--message', deployMessage.trim())
			}

			if (deployTag?.trim()) {
				wranglerArgs.push('--tag', deployTag.trim())
			}

			const deployProc = await deps.exec.exec(wranglerCommand, wranglerArgs, {
				cwd,
				stdio: 'inherit',
				env: {
					...process.env,
					WRANGLER_OUTPUT_FILE_PATH: wranglerOutputFilePath,
					FORCE_COLOR: process.env.FORCE_COLOR ?? '0'
				}
			})

			if (deployProc.exitCode !== 0) {
				logger.error('Deployment failed')
				return { exitCode: 1 }
			}

			let structuredOutput = ''
			try {
				structuredOutput = await deps.fs.readFile(wranglerOutputFilePath, 'utf8') as string
			} catch {
				structuredOutput = ''
			} finally {
				try {
					await deps.fs.unlink(wranglerOutputFilePath)
				} catch {
					// Ignore cleanup failures.
				}
			}

			const parsedConsoleOutput = parseWranglerDeployOutput(
				[deployProc.stdout, deployProc.stderr].filter((value): value is string => typeof value === 'string' && value.length > 0).join('\n')
			)
			const parsedStructuredOutput = structuredOutput
				? parseWranglerStructuredOutput(structuredOutput)
				: { urls: [], versionId: undefined, previewUrl: undefined }
			const parsedOutput = mergeParsedWranglerDeployOutputs(parsedConsoleOutput, parsedStructuredOutput)
			const configuredAccountId = normalizeCloudflareAccountId(prepared.config.accountId)
				?? normalizeCloudflareAccountId(process.env.CLOUDFLARE_ACCOUNT_ID)
			let resolvedAccountId = configuredAccountId
			let didAttemptAccountResolution = false
			const versionRecoveryDiagnostics: string[] = []
			const ensureResolvedAccountId = async (): Promise<string | undefined> => {
				if (resolvedAccountId || didAttemptAccountResolution) {
					return resolvedAccountId
				}

				didAttemptAccountResolution = true
				resolvedAccountId = await resolveDeployAccountId(undefined)
				return resolvedAccountId
			}
			let resolvedVersionId = parsedOutput.versionId
			let resolvedPreviewUrl = parsedOutput.previewUrl
			let loggedVersionId = false

			if (!preview && !resolvedVersionId && !isBranchScopedPreviewDeployment) {
				resolvedAccountId = await ensureResolvedAccountId()
			}

			if (isBranchScopedPreviewDeployment && !resolvedPreviewUrl) {
				resolvedAccountId = await ensureResolvedAccountId()
			}

			if (
				isBranchScopedPreviewDeployment
				&& !resolvedPreviewUrl
				&& resolvedAccountId
			) {
				const workersSubdomain = await getWorkersSubdomain(resolvedAccountId)
				if (workersSubdomain) {
					resolvedPreviewUrl = formatWorkersDevUrl(prepared.config.name, workersSubdomain)
				}
			}

			if (
				!resolvedVersionId
				&& resolvedAccountId
				&& !(isBranchScopedPreviewDeployment && resolvedPreviewUrl)
			) {
				try {
					resolvedVersionId = await resolveVersionIdFromLatestWorkerVersion({
						accountId: resolvedAccountId,
						workerName: prepared.config.name,
						preview,
						deployedAfter: deployStartedAt
					})

					logger.success(`Version ID: ${resolvedVersionId}`)
					loggedVersionId = true
					logLine(
						logger,
						dim('Resolved version id from Cloudflare version metadata', theme)
					)
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)
					versionRecoveryDiagnostics.push(`version lookup: ${message}`)
				}
			}

			if (!preview && !isBranchScopedPreviewDeployment && !resolvedVersionId && resolvedAccountId) {
				try {
					const fallbackDeployment = await resolveVersionIdFromLatestProductionDeployment({
						accountId: resolvedAccountId,
						workerName: prepared.config.name,
						deployedAfter: deployStartedAt
					})

					resolvedVersionId = fallbackDeployment.versionId
					logger.success(`Version ID: ${resolvedVersionId}`)
					loggedVersionId = true
					logLine(
						logger,
						dim(
							`Resolved version id from Cloudflare deployment ${fallbackDeployment.deploymentId}`,
							theme
						)
					)
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)
					versionRecoveryDiagnostics.push(`deployment lookup: ${message}`)
					// Fall back to the existing verification error below when Cloudflare does not
					// expose a fresh deployment with version metadata yet.
				}
			}

			if (!preview && !isBranchScopedPreviewDeployment && !resolvedVersionId && resolvedAccountId) {
				try {
					const currentDeployment = await resolveVersionIdFromCurrentProductionDeployment({
						accountId: resolvedAccountId,
						workerName: prepared.config.name
					})

					resolvedVersionId = currentDeployment.versionId
					logger.success(`Version ID: ${resolvedVersionId}`)
					loggedVersionId = true
					const reuseMessage = `Cloudflare did not expose a fresh deployment or version after verification retries, and the current active deployment ${currentDeployment.deploymentId} still points at version ${resolvedVersionId}. This usually means the built Worker code and configuration were unchanged, so Cloudflare kept the existing live version.`

					if (requireFreshProductionDeployment) {
						logger.error(
							`Deployment verification failed: ${reuseMessage} This run requires a fresh production deployment, so Devflare is treating the reused live version as a failure.`
						)
						return { exitCode: 1, output: structuredOutput }
					}

					logger.warn(`Deployment verification note: ${reuseMessage}`)
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)
					versionRecoveryDiagnostics.push(`current production deployment: ${message}`)
				}
			}

			if (resolvedVersionId && !loggedVersionId) {
				logger.success(`Version ID: ${resolvedVersionId}`)
			}

			if (
				isBranchScopedPreviewDeployment
				&& !resolvedPreviewUrl
				&& resolvedAccountId
			) {
				const workersSubdomain = await getWorkersSubdomain(resolvedAccountId)
				if (workersSubdomain) {
					resolvedPreviewUrl = formatWorkersDevUrl(prepared.config.name, workersSubdomain)
				}
			}

			if ((preview || isBranchScopedPreviewDeployment) && resolvedPreviewUrl) {
				logger.success(`Preview URL: ${resolvedPreviewUrl}`)
			}

			if (shouldVerifyDeployControlPlane()) {
				if (!resolvedVersionId) {
					if (isBranchScopedPreviewDeployment && resolvedPreviewUrl) {
						logger.warn(
							`Deployment verification note: Wrangler completed the named preview-scope deploy for Worker "${prepared.config.name}" and exposed ${resolvedPreviewUrl}, but Cloudflare did not return a Worker version id. Devflare is treating this preview-scope deploy as successful because named preview workers can lag in control-plane version metadata.`
						)
					} else {
						const recoveryDetails = versionRecoveryDiagnostics.length > 0
							? ` Cloudflare fallback checks also failed: ${versionRecoveryDiagnostics.join(' | ')}`
							: ''
						logger.error(
							`Deployment verification failed: Wrangler did not return a Worker version id, so Devflare could not prove which version Cloudflare accepted.${recoveryDetails}`
						)
						return { exitCode: 1, output: structuredOutput }
					}
				} else {
					resolvedAccountId = await ensureResolvedAccountId()

					if (!resolvedAccountId) {
						logger.error(
							'Deployment verification failed: Devflare could not resolve a Cloudflare account id. Pass cloudflare-account-id to the action or set accountId in devflare.config.ts.'
						)
						return { exitCode: 1, output: structuredOutput }
					}

					try {
						await verifyDeployControlPlane({
							accountId: resolvedAccountId,
							workerName: prepared.config.name,
							versionId: resolvedVersionId,
							preview,
							logger,
							theme
						})
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error)
						logger.error(`Deployment verification failed: ${message}`)
						return { exitCode: 1, output: structuredOutput }
					}
				}
			}

			if (resolvedAccountId) {
				const previewRegistryScope = isBranchScopedPreviewDeployment
					? deployTarget.previewScope
					: undefined
				const previewRegistryUrl = preview || isBranchScopedPreviewDeployment
					? resolvedPreviewUrl
					: undefined

				try {
					await reconcilePreviewRegistry({
						accountId: resolvedAccountId,
						workerName: prepared.config.name,
						versionId: resolvedVersionId,
						previewScope: previewRegistryScope,
						previewUrl: previewRegistryUrl,
						branchName: resolvedPreviewScopeName,
						commitSha: process.env.GITHUB_SHA,
						source: inferRecordSource(),
						deploymentMessage: process.env.GITHUB_EVENT_NAME,
						logger
					})
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)
					logger.warn(`Devflare preview registry sync failed: ${message}`)
				}
			}

			logger.success('Deployed successfully!')
			return { exitCode: 0, output: structuredOutput }
		})
	} catch (error) {
		if (error instanceof Error) {
			logger.error('Deployment failed:', error.message)
			if (resolvedParsed.options.debug) {
				logger.error(error.stack)
			}
		}
		return { exitCode: 1 }
	}
}
