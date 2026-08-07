import { mkdir, open, readFile, rm } from 'node:fs/promises'
import type { ConsolaInstance } from 'consola'
import { basename, dirname, isAbsolute, resolve } from 'pathe'
import { listWorkers } from '../../../cloudflare/account-workers'
import {
	type DeployResourceNames,
	type DevflareConfig,
	type PrepareConfigResourcesForDeployResult,
	ServiceBindingValidationError,
	type WranglerConfig,
	compileConfig,
	loadConfig,
	prepareConfigResourcesForDeploy,
	readWranglerConfig,
	resolveConfigEnvVars,
	validateServiceBindings
} from '../../../config'
import { rebaseWranglerConfigPaths, writeWranglerConfig } from '../../../config/compiler'
import { preparePreviewScopedResourcesForDeploy } from '../../../config/preview-resources'
import {
	compareManifests,
	createBuildManifest,
	formatDriftWarning,
	readBuildManifest
} from '../../build-manifest'
import { applyDeploymentStrategy } from '../../deploy-strategy'
import { getPackageVersion } from '../../package-metadata'
import { logLine } from '../../ui'

export interface PreparedDeployConfigResult {
	config: DevflareConfig
	deployConfigPath: string
	previewScopedResources: Awaited<ReturnType<typeof preparePreviewScopedResourcesForDeploy>> | null
	deployResources: PrepareConfigResourcesForDeployResult
	wranglerConfig: WranglerConfig
}

/**
 * What this summary can count.
 *
 * `zones` is OPTIONAL because preview-scoped resources deliberately have none: a preview branch
 * must not mint Email Routing rules or DNS records on a real zone, since those are shared by the
 * whole domain and would outlive the branch that created them. So the same summary serves both,
 * and the preview shape stays honest about not having them rather than carrying an empty array.
 */
type SummarizableResourceNames = Omit<DeployResourceNames, 'zones'> & { zones?: string[] }

export function summarizeDeployResourceNames(resources: SummarizableResourceNames): string | null {
	const segments = [
		resources.kv.length > 0 ? `KV ${resources.kv.length}` : null,
		resources.d1.length > 0 ? `D1 ${resources.d1.length}` : null,
		resources.r2.length > 0 ? `R2 ${resources.r2.length}` : null,
		resources.queues.length > 0 ? `Queues ${resources.queues.length}` : null,
		resources.vectorize.length > 0 ? `Vectorize ${resources.vectorize.length}` : null,
		resources.hyperdrive.length > 0 ? `Hyperdrive ${resources.hyperdrive.length}` : null,
		resources.zones && resources.zones.length > 0 ? `Zones ${resources.zones.length}` : null
	].filter((segment): segment is string => segment !== null)

	return segments.length > 0 ? segments.join(' · ') : null
}

async function readDeployRedirectPath(filePath: string): Promise<string | null> {
	const fs = await import('node:fs/promises')

	try {
		const rawConfig = await fs.readFile(filePath, 'utf-8')
		const parsed = JSON.parse(rawConfig) as { configPath?: unknown }
		if (typeof parsed.configPath !== 'string' || parsed.configPath.length === 0) {
			return null
		}

		return resolve(dirname(filePath), parsed.configPath)
	} catch {
		return null
	}
}

export async function resolveBuildArtifactConfigPath(
	buildPath: string,
	cwd: string
): Promise<string> {
	const fs = await import('node:fs/promises')
	const absoluteBuildPath = isAbsolute(buildPath) ? buildPath : resolve(cwd, buildPath)

	let stat: Awaited<ReturnType<typeof fs.stat>>
	try {
		stat = await fs.stat(absoluteBuildPath)
	} catch {
		throw new Error(`Could not find build artifact path: ${absoluteBuildPath}`)
	}

	if (stat.isFile()) {
		if (basename(absoluteBuildPath) === 'config.json') {
			const redirectedConfigPath = await readDeployRedirectPath(absoluteBuildPath)
			if (!redirectedConfigPath) {
				throw new Error(`Build redirect ${absoluteBuildPath} did not contain a valid configPath.`)
			}

			return redirectedConfigPath
		}

		return absoluteBuildPath
	}

	const candidates = [
		resolve(absoluteBuildPath, 'wrangler.jsonc'),
		resolve(absoluteBuildPath, '.wrangler', 'deploy', 'config.json'),
		resolve(absoluteBuildPath, 'config.json'),
		resolve(absoluteBuildPath, '.devflare', 'build', 'wrangler.jsonc')
	]

	for (const candidatePath of candidates) {
		try {
			const candidateStat = await fs.stat(candidatePath)
			if (!candidateStat.isFile()) {
				continue
			}

			if (basename(candidatePath) === 'config.json') {
				const redirectedConfigPath = await readDeployRedirectPath(candidatePath)
				if (redirectedConfigPath) {
					return redirectedConfigPath
				}
				continue
			}

			return candidatePath
		} catch {
			// Try the next candidate.
		}
	}

	throw new Error(
		`Could not resolve a Wrangler build config from ${absoluteBuildPath}. Pass a .devflare/build directory, a generated wrangler.jsonc, or a .wrangler/deploy/config.json redirect.`
	)
}

function withBuildArtifactPaths(
	compiledConfig: WranglerConfig,
	buildConfig: WranglerConfig
): WranglerConfig {
	return {
		...compiledConfig,
		...(buildConfig.main ? { main: buildConfig.main } : {}),
		...(buildConfig.assets ? { assets: buildConfig.assets } : {})
	}
}

export async function prepareDeployConfig(options: {
	cwd: string
	configPath?: string
	environment?: string
	buildConfigPath: string
	preview: boolean
	branchName?: string
	logger?: ConsolaInstance
	force?: boolean
}): Promise<PreparedDeployConfigResult> {
	const loadedConfig = await loadConfig({
		cwd: options.cwd,
		configFile: options.configPath
	})
	const rawConfig = await resolveConfigEnvVars(loadedConfig, {
		cwd: options.cwd,
		configPath: options.configPath,
		mode: 'build'
	})

	// R2: detect drift between the build artefact manifest and the current
	// source/target. Fixes C5 (bindings drift), C8 (preview->production
	// silent flip), C11 (cross-version artefact reuse).
	const manifestDir = dirname(options.buildConfigPath)
	const manifest = await readBuildManifest(manifestDir)
	if (manifest) {
		const currentManifest = createBuildManifest(rawConfig, {
			devflareVersion: await getPackageVersion(),
			intendedTarget: {
				environment: options.environment,
				preview: options.preview,
				branchName: options.branchName
			}
		})
		const drift = compareManifests(manifest, currentManifest)
		const warning = formatDriftWarning(drift)
		if (warning && options.logger) {
			if (options.force) {
				logLine(options.logger, warning)
				logLine(options.logger, 'Continuing because --force was passed.')
			} else {
				// Drift is a warning, not a hard error - surface it loudly so
				// CI logs flag it, but don't block the deploy. Hard-blocking
				// would be a behaviour change for existing pipelines that
				// build then deploy with slightly different env vars.
				logLine(options.logger, warning)
			}
		}
	}

	const previewScopedResources =
		options.environment === 'preview'
			? await preparePreviewScopedResourcesForDeploy(rawConfig, {
					environment: options.environment
				})
			: null
	const deployResources = await prepareConfigResourcesForDeploy(
		previewScopedResources?.config ?? rawConfig,
		{
			environment: options.environment,
			accountId: previewScopedResources?.accountId,
			cloudflare: previewScopedResources?.resourceResolutionCloudflare
		}
	)
	const deploymentStrategy = applyDeploymentStrategy(deployResources.config, {
		environment: options.environment,
		preview: options.preview,
		branchName: options.branchName,
		previewBranch: process.env.DEVFLARE_PREVIEW_BRANCH
	})

	// C16: deploy-time service-binding preflight. Surface typos in
	// `bindings.services[*].service` before invoking Wrangler so users get
	// a clear error pointing at the config instead of a runtime dispatch
	// failure on the deployed worker.
	const validationAccountId =
		previewScopedResources?.accountId ??
		deploymentStrategy.config.accountId ??
		process.env.CLOUDFLARE_ACCOUNT_ID
	if (validationAccountId) {
		try {
			await validateServiceBindings(deploymentStrategy.config, validationAccountId, {
				listWorkers: (accountId) => listWorkers(accountId),
				selfWorkerName: deploymentStrategy.config.name
			})
		} catch (error) {
			if (error instanceof ServiceBindingValidationError) {
				throw error
			}
			// Non-validation failures (network/credentials) are non-fatal
			// preflight noise - Wrangler's own deploy will surface auth
			// problems clearly, and we don't want preflight to block when
			// the validation account lookup itself fails.
		}
	}

	const buildWranglerConfig = await readWranglerConfig(options.buildConfigPath)
	const compiledWranglerConfig = compileConfig(deploymentStrategy.config)

	// C4: write the resolved (ID-substituted) wrangler config to a sibling
	// `.devflare/deploy/wrangler.jsonc` instead of overwriting the build
	// artefact in place. Re-running `devflare deploy --build <path>` is
	// non-destructive to the original build output.
	const buildDir = dirname(options.buildConfigPath)
	const deployArtefactDir = resolve(buildDir, '..', 'deploy')
	await mkdir(deployArtefactDir, { recursive: true })
	const deployArtefactPath = resolve(deployArtefactDir, 'wrangler.jsonc')

	// `withBuildArtifactPaths` inherits `main`/`assets` from the build
	// artefact when present (paths relative to `buildDir`), otherwise
	// keeps the compiled values (paths relative to `options.cwd`). Rebase
	// each path field relative to its true origin so wrangler can resolve
	// the bundled entry-point and assets directory from the new
	// `.devflare/deploy/wrangler.jsonc` location.
	const compiledRebased = rebaseWranglerConfigPaths(
		options.cwd,
		deployArtefactDir,
		compiledWranglerConfig
	)
	const buildRebased = rebaseWranglerConfigPaths(buildDir, deployArtefactDir, buildWranglerConfig)
	const wranglerConfig = withBuildArtifactPaths(compiledRebased, buildRebased)

	// C10: serialize concurrent deploys against the same artefact. Exclusive
	// `wx` lock file with bounded wait so two `devflare deploy` invocations
	// targeting the same `.devflare/deploy/` cannot tear each other's writes.
	const lockPath = resolve(deployArtefactDir, '.lock')
	const lockHandle = await acquireDeployArtefactLock(lockPath)
	try {
		await writeWranglerConfig(deployArtefactDir, wranglerConfig, 'wrangler.jsonc')
	} finally {
		await releaseDeployArtefactLock(lockHandle, lockPath)
	}

	return {
		config: deploymentStrategy.config,
		deployConfigPath: deployArtefactPath,
		previewScopedResources,
		deployResources,
		wranglerConfig
	}
}

/**
 * C10 — bounded-wait exclusive lock around the deploy artefact directory.
 *
 * Uses `open(path, 'wx')` (O_EXCL) which atomically fails when the file
 * already exists, so the only way to acquire the lock is to be the process
 * that successfully created it. Stale locks (older than 60s) are forcibly
 * cleared so a crashed deploy cannot wedge subsequent runs.
 */
async function acquireDeployArtefactLock(
	lockPath: string,
	options: { maxWaitMs?: number; staleAfterMs?: number } = {}
): Promise<{ close: () => Promise<void> }> {
	const maxWaitMs = options.maxWaitMs ?? 30_000
	const staleAfterMs = options.staleAfterMs ?? 60_000
	const pollMs = 100
	const start = Date.now()
	while (true) {
		try {
			const handle = await open(lockPath, 'wx')
			await handle.writeFile(`${process.pid}\n${Date.now()}`)
			return handle
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
			try {
				const existing = await readFile(lockPath, 'utf-8')
				const ts = Number.parseInt(existing.split('\n')[1] ?? '0', 10)
				if (Number.isFinite(ts) && Date.now() - ts > staleAfterMs) {
					await rm(lockPath, { force: true })
					continue
				}
			} catch {
				continue
			}
			if (Date.now() - start > maxWaitMs) {
				throw new Error(
					`Timed out waiting for deploy artefact lock at ${lockPath}. Another \`devflare deploy\` may be running against the same artefact directory.`
				)
			}
			await new Promise((r) => setTimeout(r, pollMs))
		}
	}
}

async function releaseDeployArtefactLock(
	handle: { close: () => Promise<void> },
	lockPath: string
): Promise<void> {
	try {
		await handle.close()
	} catch {
		// Already closed.
	}
	await rm(lockPath, { force: true })
}
