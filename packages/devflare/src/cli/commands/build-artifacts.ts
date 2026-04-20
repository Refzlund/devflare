import { type ConsolaInstance } from 'consola'
import { dirname, relative, resolve } from 'pathe'
import type { CliOptions, ParsedArgs } from '../index'
import type { FileSystem } from '../dependencies'
import {
	compileBuildConfig,
	loadConfig,
	resolveConfigForEnvironment,
	type DevflareConfig
} from '../../config'
import {
	compileConfig,
	isolateViteBuildOutputPaths as isolateCompiledViteBuildOutputPaths,
	rebaseWranglerConfigPaths,
	writeWranglerConfig,
	type WranglerConfig
} from '../../config/compiler'
import { getDependencies } from '../dependencies'
import { ensureGeneratedDirectory, getGeneratedArtifactPaths } from '../generated-artifacts'
import { applyDeploymentStrategy, describeDeploymentStrategy } from '../deploy-strategy'
import { bundleWorkerEntry } from '../../bundler'
import { detectViteProject } from '../../dev-server/vite-utils'
import {
	resolveEffectiveViteProject,
	writeGeneratedViteConfig,
	type EffectiveViteProjectDetection
} from '../../vite'
import { prepareComposedWorkerEntrypoint } from '../../worker-entry/composed-worker'
import { resolvePackageSpecifier } from '../../utils/resolve-package'
import { logLine } from '../ui'
import {
	createBuildManifest,
	writeBuildManifest,
	type BuildManifest
} from '../build-manifest'
import { getPackageVersion } from '../package-metadata'

type BuildArtifactPaths = ReturnType<typeof getGeneratedArtifactPaths>

export interface PreparedBuildArtifactsResult {
	config: DevflareConfig
	wranglerConfig: WranglerConfig
	deployConfigPath: string
	viteProject: EffectiveViteProjectDetection
}

interface RetryableCleanupError {
	code?: string
}

interface CleanupFileSystem {
	access(path: string): Promise<void>
	rename(oldPath: string, newPath: string): Promise<void>
	rm(
		path: string,
		options: {
			recursive: boolean
			force: boolean
		}
	): Promise<void>
}

function getBuildArtifactPaths(cwd: string): BuildArtifactPaths {
	return getGeneratedArtifactPaths(cwd)
}

function isNestedPath(parentPath: string, candidatePath: string): boolean {
	const normalizedParentPath = parentPath.replace(/\\/g, '/')
	const normalizedCandidatePath = candidatePath.replace(/\\/g, '/')

	return normalizedCandidatePath.startsWith(`${normalizedParentPath}/`)
}

export function isolateViteBuildOutputPaths(
	cwd: string,
	wranglerConfig: WranglerConfig
): WranglerConfig {
	return isolateCompiledViteBuildOutputPaths(cwd, wranglerConfig)
}

export function getViteBuildCleanupTargets(cwd: string, wranglerConfig: WranglerConfig): string[] {
	const targets: string[] = []
	const assetsDirectory = wranglerConfig.assets?.directory
	const mainEntry = wranglerConfig.main

	if (assetsDirectory) {
		targets.push(resolve(cwd, assetsDirectory))
	}

	if (mainEntry) {
		const mainEntryPath = resolve(cwd, mainEntry)
		const isCoveredByAssetsDirectory = targets.some((targetPath) => {
			return mainEntryPath === targetPath || isNestedPath(targetPath, mainEntryPath)
		})

		if (!isCoveredByAssetsDirectory) {
			targets.push(mainEntryPath)
		}
	}

	return targets
}

function shouldRetryCleanup(error: unknown): error is RetryableCleanupError {
	if (!error || typeof error !== 'object') {
		return false
	}

	const errorCode = (error as RetryableCleanupError).code
	return errorCode === 'EBUSY' || errorCode === 'EPERM' || errorCode === 'ENOTEMPTY'
}

async function getCleanupFileSystem(): Promise<CleanupFileSystem> {
	return await import('node:fs/promises')
}

async function pathExists(cleanupFs: CleanupFileSystem, targetPath: string): Promise<boolean> {
	try {
		await cleanupFs.access(targetPath)
		return true
	} catch {
		return false
	}
}

export function createDeferredCleanupPath(targetPath: string, uniqueSuffix?: string): string {
	const suffix =
		uniqueSuffix ??
		`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

	return `${targetPath}.devflare-stale-${suffix}`
}

async function tryMoveLockedPathAside(
	targetPath: string,
	logger: ConsolaInstance,
	cleanupFs: CleanupFileSystem
): Promise<boolean> {
	if (!(await pathExists(cleanupFs, targetPath))) {
		return true
	}

	const deferredCleanupPath = createDeferredCleanupPath(targetPath)

	try {
		await cleanupFs.rename(targetPath, deferredCleanupPath)
	} catch {
		return false
	}

	logger.warn(
		`Moved locked build output aside to ${deferredCleanupPath} after repeated cleanup failures; continuing build`
	)

	try {
		await cleanupFs.rm(deferredCleanupPath, {
			recursive: true,
			force: true
		})
	} catch (error) {
		const cleanupErrorCode =
			error instanceof Error && 'code' in error && typeof error.code === 'string'
				? error.code
				: 'an unknown error'

		logger.warn(
			`Deferred cleanup for ${deferredCleanupPath} is still blocked by ${cleanupErrorCode}; you can remove it manually later`
		)
	}

	return true
}

export async function removePathWithRetries(
	targetPath: string,
	logger: ConsolaInstance,
	attempts: number = 5,
	cleanupFs?: CleanupFileSystem
): Promise<void> {
	const fs = cleanupFs ?? await getCleanupFileSystem()
	let lastError: unknown

	for (let attempt = 1;attempt <= attempts;attempt++) {
		try {
			await fs.rm(targetPath, {
				recursive: true,
				force: true
			})
			return
		} catch (error) {
			lastError = error

			if (!shouldRetryCleanup(error) || attempt === attempts) {
				break
			}

			logger.warn(
				`Retrying cleanup for ${targetPath} after ${error.code} (${attempt}/${attempts})`
			)
			await new Promise((resolveRetry) => setTimeout(resolveRetry, attempt * 100))
		}
	}

	if (
		shouldRetryCleanup(lastError) &&
		await tryMoveLockedPathAside(targetPath, logger, fs)
	) {
		return
	}

	if (shouldRetryCleanup(lastError)) {
		const cleanupErrorCode =
			lastError instanceof Error && 'code' in lastError && typeof lastError.code === 'string'
				? lastError.code
				: 'an unknown error'

		logger.warn(
			`Continuing build without pre-clean for ${targetPath} because cleanup is still blocked by ${cleanupErrorCode}`
		)
		return
	}

	throw lastError
}

export async function cleanupViteBuildOutputs(
	cwd: string,
	wranglerConfig: WranglerConfig,
	logger: ConsolaInstance
): Promise<void> {
	const cleanupTargets = getViteBuildCleanupTargets(cwd, wranglerConfig)

	for (const cleanupTarget of cleanupTargets) {
		await removePathWithRetries(cleanupTarget, logger)
	}
}

async function writeDeployRedirect(cwd: string, generatedConfigPath: string): Promise<void> {
	const fs = await import('node:fs/promises')
	const paths = getBuildArtifactPaths(cwd)
	await ensureGeneratedDirectory(paths.deployDir)

	const configPath = relative(paths.deployDir, generatedConfigPath).replace(/\\/g, '/')
	await fs.writeFile(
		paths.deployRedirectPath,
		`${JSON.stringify({ configPath }, null, '\t')}\n`,
		'utf-8'
	)
}

async function readDeployRedirect(cwd: string): Promise<string | null> {
	const fs = await import('node:fs/promises')
	const paths = getBuildArtifactPaths(cwd)

	try {
		const rawConfig = await fs.readFile(paths.deployRedirectPath, 'utf-8')
		const parsed = JSON.parse(rawConfig) as { configPath?: unknown }
		if (typeof parsed.configPath !== 'string' || parsed.configPath.length === 0) {
			return null
		}

		return resolve(dirname(paths.deployRedirectPath), parsed.configPath)
	} catch {
		return null
	}
}

async function writeGeneratedDeployWranglerConfig(
	cwd: string,
	wranglerConfig: WranglerConfig,
	options: {
		main?: string
	} = {}
): Promise<string> {
	const paths = getBuildArtifactPaths(cwd)
	await ensureGeneratedDirectory(paths.buildDir, true)

	const buildConfig = rebaseWranglerConfigPaths(cwd, paths.buildDir, wranglerConfig)

	if (options.main) {
		buildConfig.main = options.main
	}

	await writeWranglerConfig(paths.buildDir, buildConfig, 'wrangler.jsonc')
	return paths.buildWranglerConfigPath
}

async function writeGeneratedDevWranglerConfig(
	cwd: string,
	wranglerConfig: WranglerConfig
): Promise<string> {
	const paths = getGeneratedArtifactPaths(cwd)
	await ensureGeneratedDirectory(paths.devflareDir, true)

	const devConfig = rebaseWranglerConfigPaths(cwd, paths.devflareDir, wranglerConfig)

	await writeWranglerConfig(paths.devflareDir, devConfig, 'wrangler.jsonc')
	return paths.devWranglerConfigPath
}

async function buildWorkerOnlyDeployArtifact(
	cwd: string,
	wranglerConfig: WranglerConfig,
	config: DevflareConfig,
	logger: ConsolaInstance
): Promise<string> {
	if (!wranglerConfig.main) {
		return await writeGeneratedDeployWranglerConfig(cwd, wranglerConfig)
	}

	const paths = getBuildArtifactPaths(cwd)
	const bundledMainEntryPath = await bundleWorkerEntry({
		cwd,
		inputFile: resolve(cwd, wranglerConfig.main),
		outFile: paths.buildWorkerPath,
		rolldownOptions: config.rolldown?.options,
		sourcemap: config.rolldown?.sourcemap,
		minify: config.rolldown?.minify,
		logger
	})

	logLine(logger, `Generated deploy artifact: ${relative(cwd, bundledMainEntryPath).replace(/\\/g, '/')}`)
	return await writeGeneratedDeployWranglerConfig(cwd, wranglerConfig, {
		main: './worker.js'
	})
}

async function resolveLocalViteExecutable(cwd: string, fs: FileSystem): Promise<string> {
	const viteExecutablePath = resolvePackageSpecifier('vite/bin/vite.js', cwd)

	try {
		await fs.access(viteExecutablePath)
	} catch {
		throw new Error(
			`Could not resolve a local Vite CLI entrypoint from ${cwd}. Install vite in this package before running a Vite-backed Devflare build.`
		)
	}

	return viteExecutablePath
}

export async function prepareBuildArtifacts(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<PreparedBuildArtifactsResult> {
	const cwd = options.cwd || process.cwd()
	const configPath = parsed.options.config as string | undefined
	const environment = parsed.options.env as string | undefined

	const rawConfig = await loadConfig({ cwd, configFile: configPath })
	const config = resolveConfigForEnvironment(rawConfig, environment)

	logLine(logger, `Building: ${config.name}`)

	const composedMainEntry = await prepareComposedWorkerEntrypoint(cwd, config, environment)
	const deps = await getDependencies()
	const viteProject = resolveEffectiveViteProject(
		await detectViteProject(cwd, deps.fs as unknown as Parameters<typeof detectViteProject>[1]),
		config,
		environment
	)
	const deploymentStrategy = applyDeploymentStrategy(config, {
		environment,
		preview: parsed.options.preview === true,
		branchName: parsed.options['branch-name'] as string | undefined,
		previewBranch: process.env.DEVFLARE_PREVIEW_BRANCH
	})
	const deploymentStrategyMessage = describeDeploymentStrategy(deploymentStrategy)

	if (deploymentStrategyMessage) {
		logLine(logger, deploymentStrategyMessage)
	}

	const devWranglerConfig = viteProject.shouldStartVite
		? isolateViteBuildOutputPaths(cwd, compileBuildConfig(config))
		: compileBuildConfig(config)
	const deployWranglerConfig = viteProject.shouldStartVite
		? isolateViteBuildOutputPaths(cwd, compileBuildConfig(deploymentStrategy.config))
		: compileBuildConfig(deploymentStrategy.config)

	if (viteProject.shouldStartVite) {
		if (composedMainEntry) {
			deployWranglerConfig.main = composedMainEntry
			logLine(logger, `Generated composed worker entry: ${composedMainEntry}`)
		}
	} else if (composedMainEntry) {
		const bundledMainEntryPath = await bundleWorkerEntry({
			cwd,
			inputFile: resolve(cwd, composedMainEntry),
			outFile: resolve(cwd, '.devflare', 'worker-entrypoints', 'main.js'),
			rolldownOptions: config.rolldown?.options,
			sourcemap: config.rolldown?.sourcemap,
			minify: config.rolldown?.minify,
			logger
		})
		const bundledMainPath = relative(cwd, bundledMainEntryPath).replace(/\\/g, '/')
		devWranglerConfig.main = bundledMainPath
		deployWranglerConfig.main = bundledMainPath
		logLine(logger, `Generated bundled worker entry: ${bundledMainPath}`)
	}

	let deployConfigPath: string

	if (viteProject.shouldStartVite) {
		const generatedViteConfigPath = await writeGeneratedViteConfig({
			cwd,
			configPath,
			environment,
			localConfigPath: viteProject.viteConfigPath
		})
		const viteExecutablePath = await resolveLocalViteExecutable(cwd, deps.fs)

		await cleanupViteBuildOutputs(cwd, devWranglerConfig, logger)
		logLine(logger, 'Running vite build...')
		const buildProc = await deps.exec.exec(viteExecutablePath, ['build', '--config', generatedViteConfigPath], {
			cwd,
			stdio: 'inherit',
			env: {
				...process.env,
				DEVFLARE_BUILD: 'true'
			}
		})

		if (buildProc.exitCode !== 0) {
			throw new Error('Build failed')
		}

		const existingDeployConfigPath = await readDeployRedirect(cwd)
		const generatedDeployConfigPath = deployWranglerConfig.main && deployWranglerConfig.main !== devWranglerConfig.main
			? await buildWorkerOnlyDeployArtifact(cwd, deployWranglerConfig, config, logger)
			: await writeGeneratedDeployWranglerConfig(cwd, deployWranglerConfig)

		deployConfigPath = existingDeployConfigPath && existingDeployConfigPath !== generatedDeployConfigPath
			? existingDeployConfigPath
			: generatedDeployConfigPath
	} else {
		logLine(logger, 'Skipping Vite build (no effective Vite config found for this package)')
		deployConfigPath = await buildWorkerOnlyDeployArtifact(cwd, deployWranglerConfig, config, logger)
	}

	const generatedDevConfigPath = await writeGeneratedDevWranglerConfig(cwd, devWranglerConfig)
	logger.debug(`Generated dev Wrangler config: ${relative(cwd, generatedDevConfigPath).replace(/\\/g, '/')}`)

	await writeDeployRedirect(cwd, deployConfigPath)
	logLine(logger, `Generated deploy Wrangler config: ${relative(cwd, deployConfigPath).replace(/\\/g, '/')}`)
	logLine(logger, `Generated deploy redirect: ${relative(cwd, getBuildArtifactPaths(cwd).deployRedirectPath).replace(/\\/g, '/')}`)

	// R2: emit a build manifest alongside the artefact so deploy can detect
	// drift (config edits, version skew, target mismatch) before shipping.
	const manifest = createBuildManifest(rawConfig, {
		devflareVersion: await getPackageVersion(),
		intendedTarget: {
			environment,
			preview: parsed.options.preview === true,
			previewScope: typeof parsed.options.preview === 'string' ? parsed.options.preview : undefined,
			branchName: parsed.options['branch-name'] as string | undefined
		}
	})
	const manifestPath = await writeBuildManifest(getBuildArtifactPaths(cwd).buildDir, manifest)
	logger.debug(`Generated build manifest: ${relative(cwd, manifestPath).replace(/\\/g, '/')}`)

	return {
		config,
		wranglerConfig: deployWranglerConfig,
		deployConfigPath,
		viteProject
	}
}
