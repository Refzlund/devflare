import { type ConsolaInstance } from 'consola'
import { dirname, relative, resolve } from 'pathe'
import type { CliOptions, ParsedArgs } from '../index'
import type { FileSystem } from '../dependencies'
import { loadResolvedConfig, type DevflareConfig } from '../../config'
import {
	compileConfig,
	rebaseWranglerConfigPaths,
	writeWranglerConfig,
	type WranglerConfig
} from '../../config/compiler'
import { getDependencies } from '../dependencies'
import { ensureGeneratedDirectory, getGeneratedArtifactPaths } from '../generated-artifacts'
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

function getBuildArtifactPaths(cwd: string): BuildArtifactPaths {
	return getGeneratedArtifactPaths(cwd)
}

function isNestedPath(parentPath: string, candidatePath: string): boolean {
	const normalizedParentPath = parentPath.replace(/\\/g, '/')
	const normalizedCandidatePath = candidatePath.replace(/\\/g, '/')

	return normalizedCandidatePath.startsWith(`${normalizedParentPath}/`)
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

async function removePathWithRetries(
	targetPath: string,
	logger: ConsolaInstance,
	attempts: number = 5
): Promise<void> {
	const fs = await import('node:fs/promises')

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			await fs.rm(targetPath, {
				recursive: true,
				force: true
			})
			return
		} catch (error) {
			if (!shouldRetryCleanup(error) || attempt === attempts) {
				throw error
			}

			logger.warn(
				`Retrying cleanup for ${targetPath} after ${error.code} (${attempt}/${attempts})`
			)
			await new Promise((resolveRetry) => setTimeout(resolveRetry, attempt * 100))
		}
	}
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

	const config = await loadResolvedConfig({ cwd, configFile: configPath, environment })
	logLine(logger, `Building: ${config.name}`)

	const composedMainEntry = await prepareComposedWorkerEntrypoint(cwd, config, environment)
	const deps = await getDependencies()
	const viteProject = resolveEffectiveViteProject(
		await detectViteProject(cwd, deps.fs as unknown as Parameters<typeof detectViteProject>[1]),
		config,
		environment
	)

	const devWranglerConfig = compileConfig(config)
	const deployWranglerConfig = structuredClone(devWranglerConfig)

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

	const generatedDevConfigPath = await writeGeneratedDevWranglerConfig(cwd, devWranglerConfig)
	logger.debug(`Generated dev Wrangler config: ${relative(cwd, generatedDevConfigPath).replace(/\\/g, '/')}`)

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

	await writeDeployRedirect(cwd, deployConfigPath)
	logLine(logger, `Generated deploy Wrangler config: ${relative(cwd, deployConfigPath).replace(/\\/g, '/')}`)
	logLine(logger, `Generated deploy redirect: ${relative(cwd, getBuildArtifactPaths(cwd).deployRedirectPath).replace(/\\/g, '/')}`)

	return {
		config,
		wranglerConfig: deployWranglerConfig,
		deployConfigPath,
		viteProject
	}
}
