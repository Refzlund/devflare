// =============================================================================
// Deploy Command: deploy to Cloudflare
// =============================================================================

import type { ConsolaInstance } from 'consola'
import { join } from 'pathe'
import { getWorkersSubdomain } from '../../cloudflare/account'
import { reconcilePreviewRegistry } from '../../cloudflare/preview-registry'
import {
	compileBuildConfig,
	compileConfig,
	loadConfig,
	prepareConfigResourcesForDeploy,
	resolveConfigForEnvironment
} from '../../config'
import { stringifyConfig } from '../../config/compiler'
import { getDependencies } from '../dependencies'
import { applyDeploymentStrategy, describeDeploymentStrategy } from '../deploy-strategy'
import {
	applyResolvedDeployTarget,
	resolveDeployTarget,
	withTemporaryEnvironment
} from '../deploy-target'
import type { CliOptions, CliResult, ParsedArgs } from '../index'
import {
	formatWorkersDevUrl,
	mergeParsedWranglerDeployOutputs,
	parseWranglerDeployOutput,
	parseWranglerStructuredOutput
} from '../preview'
import { createCliTheme, dim, green, logLine, yellow, yellowBold } from '../ui'
import { prepareBuildArtifacts } from './build-artifacts'
import { inferRecordSource, writeDeployResultMetadata } from './deploy/metadata'
import {
	prepareDeployConfig,
	resolveBuildArtifactConfigPath,
	summarizeDeployResourceNames
} from './deploy/prepare'
import { resolveLocalWranglerExecutable } from './deploy/runtime'
import {
	normalizeCloudflareAccountId,
	resolveDeployAccountId,
	resolveVersionIdFromCurrentProductionDeployment,
	resolveVersionIdFromLatestProductionDeployment,
	resolveVersionIdFromLatestWorkerVersion,
	shouldRequireFreshProductionDeployment,
	shouldVerifyDeployControlPlane,
	verifyDeployControlPlane
} from './deploy/verification'

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
	let resolvedPreviewScopeName = process.env.DEVFLARE_PREVIEW_BRANCH?.trim() || undefined
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
		resolvedPreviewScopeName =
			previewScopeName || process.env.DEVFLARE_PREVIEW_BRANCH?.trim() || undefined
		requireFreshProductionDeployment = !preview && shouldRequireFreshProductionDeployment()

		return await withTemporaryEnvironment(deployTarget.envOverrides, async () => {
			resolvedPreviewScopeName =
				previewScopeName || process.env.DEVFLARE_PREVIEW_BRANCH?.trim() || undefined
			if (dryRun) {
				const config = await loadConfig({ cwd, configFile: configPath })
				const deploymentStrategy = applyDeploymentStrategy(
					resolveConfigForEnvironment(config, environment),
					{
						environment,
						preview,
						branchName,
						previewBranch: process.env.DEVFLARE_PREVIEW_BRANCH
					}
				)
				const wranglerConfig = compileBuildConfig(deploymentStrategy.config, undefined, {
					alreadyResolved: true
				})

				logLine(logger, `${yellow('dry run', theme)} ${dim('Skipping actual deployment', theme)}`)
				const deploymentStrategyMessage = describeDeploymentStrategy(deploymentStrategy)
				if (deploymentStrategyMessage) {
					logLine(logger, dim(deploymentStrategyMessage, theme))
				}
				logLine(logger, dim('Would deploy with wrangler config:', theme))
				logLine(logger, stringifyConfig(wranglerConfig))

				// C6 — also render the resolved view (post-resource-resolution).
				// Best-effort: if no Cloudflare credentials or the account
				// cannot be reached, fall back to the build-config view above.
				try {
					const describeResult = await prepareConfigResourcesForDeploy(deploymentStrategy.config, {
						environment,
						describeOnly: true
					})
					const resolvedWranglerConfig = compileConfig(describeResult.config)
					logLine(
						logger,
						dim('Resolved view (would-create placeholders for missing resources):', theme)
					)
					logLine(logger, stringifyConfig(resolvedWranglerConfig))
					const wouldCreate = [
						...describeResult.created.kv.map((n) => `KV: ${n}`),
						...describeResult.created.d1.map((n) => `D1: ${n}`),
						...describeResult.created.r2.map((n) => `R2: ${n}`),
						...describeResult.created.queues.map((n) => `Queue: ${n}`)
					]
					if (wouldCreate.length > 0) {
						logLine(logger, dim(`Would create:\n  - ${wouldCreate.join('\n  - ')}`, theme))
					}
				} catch (describeErr) {
					logLine(
						logger,
						dim(`(resolved view unavailable: ${(describeErr as Error).message})`, theme)
					)
				}
				return { exitCode: 0 }
			}

			const deps = await getDependencies()
			const requestedBuildPath = resolvedParsed.options.build as string | undefined
			const buildConfigPath = requestedBuildPath
				? await resolveBuildArtifactConfigPath(requestedBuildPath, cwd)
				: (await prepareBuildArtifacts(resolvedParsed, logger, options)).deployConfigPath
			const prepared = await prepareDeployConfig({
				cwd,
				configPath,
				environment,
				buildConfigPath,
				preview,
				branchName,
				logger,
				force: resolvedParsed.options.force === true
			})

			const createdPreviewResourcesSummary = prepared.previewScopedResources
				? summarizeDeployResourceNames(prepared.previewScopedResources.created)
				: null
			if (createdPreviewResourcesSummary) {
				logLine(logger, `Provisioned preview-scoped resources: ${createdPreviewResourcesSummary}`)
			}

			const existingPreviewResourcesSummary = prepared.previewScopedResources
				? summarizeDeployResourceNames(prepared.previewScopedResources.existing)
				: null
			if (existingPreviewResourcesSummary) {
				logLine(logger, `Reused preview-scoped resources: ${existingPreviewResourcesSummary}`)
			}

			const createdDeployResourcesSummary = summarizeDeployResourceNames(
				prepared.deployResources.created
			)
			if (createdDeployResourcesSummary) {
				logLine(logger, `Provisioned deploy resources: ${createdDeployResourcesSummary}`)
			}

			const existingDeployResourcesSummary = summarizeDeployResourceNames(
				prepared.deployResources.existing
			)
			if (existingDeployResourcesSummary) {
				logLine(logger, `Reused deploy resources: ${existingDeployResourcesSummary}`)
			}

			for (const warning of prepared.previewScopedResources?.warnings ?? []) {
				logger.warn(warning)
			}

			for (const warning of prepared.deployResources.warnings) {
				logger.warn(warning)
			}

			if (requestedBuildPath) {
				logLine(logger, `${dim('build', theme)} ${green(buildConfigPath, theme)}`)
			}

			logLine(logger, `${dim('worker', theme)} ${green(prepared.config.name, theme)}`)
			const localWranglerExecutable = await resolveLocalWranglerExecutable(cwd, deps.fs)

			const isBranchScopedPreviewDeployment =
				!preview &&
				environment === 'preview' &&
				typeof resolvedPreviewScopeName === 'string' &&
				resolvedPreviewScopeName.length > 0

			if (preview) {
				logger.warn('Cloudflare preview uploads cannot be the first upload for a brand-new Worker.')
				if (
					prepared.config.bindings?.durableObjects &&
					Object.keys(prepared.config.bindings.durableObjects).length > 0
				) {
					logger.warn(
						'Cloudflare does not currently generate preview URLs for Workers that implement Durable Objects.'
					)
				}
				if (prepared.config.migrations && prepared.config.migrations.length > 0) {
					logger.warn(
						'Cloudflare versions upload does not currently support Durable Object migrations.'
					)
				}
			}

			// Deploy with wrangler
			logLine(
				logger,
				dim(
					preview ? 'Uploading preview version with Wrangler…' : 'Deploying with Wrangler…',
					theme
				)
			)
			const deployStartedAt = new Date()

			const wranglerOutputDirectory = join(cwd, '.devflare')
			const wranglerOutputFilePath = join(
				wranglerOutputDirectory,
				`wrangler-output-${Date.now()}-${process.pid}.ndjson`
			)
			await deps.fs.mkdir(wranglerOutputDirectory, { recursive: true })

			const wranglerCommand = localWranglerExecutable ? 'node' : 'bunx'
			const wranglerArgs = preview
				? localWranglerExecutable
					? [localWranglerExecutable, 'versions', 'upload']
					: ['wrangler', 'versions', 'upload']
				: localWranglerExecutable
					? [localWranglerExecutable, 'deploy']
					: ['wrangler', 'deploy']

			wranglerArgs.push('--config', prepared.deployConfigPath)

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

			let structuredOutput = ''
			try {
				structuredOutput = (await deps.fs.readFile(wranglerOutputFilePath, 'utf8')) as string
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
				[deployProc.stdout, deployProc.stderr]
					.filter((value): value is string => typeof value === 'string' && value.length > 0)
					.join('\n')
			)
			const parsedStructuredOutput = structuredOutput
				? parseWranglerStructuredOutput(structuredOutput)
				: { urls: [], versionId: undefined, previewUrl: undefined }
			const parsedOutput = mergeParsedWranglerDeployOutputs(
				parsedConsoleOutput,
				parsedStructuredOutput
			)
			const workersDevUrl = parsedOutput.urls.find((url) => url.includes('workers.dev'))
			const configuredAccountId =
				normalizeCloudflareAccountId(prepared.config.accountId) ??
				normalizeCloudflareAccountId(process.env.CLOUDFLARE_ACCOUNT_ID)
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
			let verificationNote: string | undefined

			const persistDeployMetadata = async (input: {
				status: 'success' | 'failure'
				exitCode: number
				error?: string
			}): Promise<void> => {
				await writeDeployResultMetadata({
					status: input.status,
					exitCode: input.exitCode,
					workerName: prepared.config.name,
					preview,
					branchScopedPreview: isBranchScopedPreviewDeployment,
					previewScope: resolvedPreviewScopeName,
					versionId: resolvedVersionId,
					previewUrl: resolvedPreviewUrl,
					workersDevUrl,
					verificationNote,
					outputUrls: parsedOutput.urls,
					structuredOutput,
					...(input.error ? { error: input.error } : {})
				})
			}

			if (deployProc.exitCode !== 0) {
				await persistDeployMetadata({
					status: 'failure',
					exitCode: 1,
					error: deployProc.stderr || deployProc.stdout || 'Wrangler deploy failed'
				})
				logger.error('Deployment failed')
				return { exitCode: 1, output: structuredOutput }
			}

			if (!preview && !resolvedVersionId && !isBranchScopedPreviewDeployment) {
				resolvedAccountId = await ensureResolvedAccountId()
			}

			if (isBranchScopedPreviewDeployment && !resolvedPreviewUrl) {
				resolvedAccountId = await ensureResolvedAccountId()
			}

			if (isBranchScopedPreviewDeployment && !resolvedPreviewUrl && resolvedAccountId) {
				const workersSubdomain = await getWorkersSubdomain(resolvedAccountId)
				if (workersSubdomain) {
					resolvedPreviewUrl = formatWorkersDevUrl(prepared.config.name, workersSubdomain)
				}
			}

			if (!resolvedVersionId && resolvedAccountId) {
				try {
					resolvedVersionId = await resolveVersionIdFromLatestWorkerVersion({
						accountId: resolvedAccountId,
						workerName: prepared.config.name,
						preview: preview || isBranchScopedPreviewDeployment,
						deployedAfter: deployStartedAt
					})

					logger.success(`Version ID: ${resolvedVersionId}`)
					loggedVersionId = true
					logLine(logger, dim('Resolved version id from Cloudflare version metadata', theme))
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)
					versionRecoveryDiagnostics.push(`version lookup: ${message}`)
				}
			}

			if (isBranchScopedPreviewDeployment && !resolvedVersionId && resolvedAccountId) {
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
					verificationNote = reuseMessage

					if (requireFreshProductionDeployment) {
						await persistDeployMetadata({
							status: 'failure',
							exitCode: 1,
							error: reuseMessage
						})
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

			if (isBranchScopedPreviewDeployment && !resolvedPreviewUrl && resolvedAccountId) {
				const workersSubdomain = await getWorkersSubdomain(resolvedAccountId)
				if (workersSubdomain) {
					resolvedPreviewUrl = formatWorkersDevUrl(prepared.config.name, workersSubdomain)
				}
			}

			if ((preview || isBranchScopedPreviewDeployment) && resolvedPreviewUrl) {
				logLine(logger, `Preview URL: ${resolvedPreviewUrl}`)
			}

			if (shouldVerifyDeployControlPlane()) {
				if (!resolvedVersionId) {
					const recoveryDetails =
						versionRecoveryDiagnostics.length > 0
							? ` Cloudflare fallback checks also failed: ${versionRecoveryDiagnostics.join(' | ')}`
							: ''
					await persistDeployMetadata({
						status: 'failure',
						exitCode: 1,
						error: `Wrangler did not return a Worker version id, so Devflare could not prove which version Cloudflare accepted.${recoveryDetails}`
					})
					logger.error(
						`Deployment verification failed: Wrangler did not return a Worker version id, so Devflare could not prove which version Cloudflare accepted.${recoveryDetails}`
					)
					return { exitCode: 1, output: structuredOutput }
				}

				resolvedAccountId = await ensureResolvedAccountId()

				if (!resolvedAccountId) {
					await persistDeployMetadata({
						status: 'failure',
						exitCode: 1,
						error: 'Devflare could not resolve a Cloudflare account id.'
					})
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
					await persistDeployMetadata({
						status: 'failure',
						exitCode: 1,
						error: message
					})
					logger.error(`Deployment verification failed: ${message}`)
					return { exitCode: 1, output: structuredOutput }
				}
			}

			if (resolvedAccountId) {
				const previewRegistryScope = isBranchScopedPreviewDeployment
					? deployTarget.previewScope
					: undefined
				const previewRegistryUrl =
					preview || isBranchScopedPreviewDeployment ? resolvedPreviewUrl : undefined

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

			await persistDeployMetadata({
				status: 'success',
				exitCode: 0
			})
			logger.success('Deployed successfully!')
			return { exitCode: 0, output: structuredOutput }
		})
	} catch (error) {
		await writeDeployResultMetadata({
			status: 'failure',
			exitCode: 1,
			preview,
			branchScopedPreview:
				!preview && environment === 'preview' && Boolean(resolvedPreviewScopeName),
			previewScope: resolvedPreviewScopeName,
			outputUrls: [],
			...(error instanceof Error ? { error: error.message } : { error: String(error) })
		})
		if (error instanceof Error) {
			logger.error('Deployment failed:', error.message)
			if (resolvedParsed.options.debug) {
				logger.error(error.stack)
			}
		}
		return { exitCode: 1 }
	}
}
