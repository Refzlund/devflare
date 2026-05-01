import { type ConsolaInstance } from 'consola'
import { dirname, relative, resolve } from 'pathe'
import type { CliOptions, ParsedArgs } from '../index'
import type { FileSystem } from '../dependencies'
import {
	compileBuildConfig,
	loadConfig,
	resolveConfigEnvVars,
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

export async function resolveLocalViteExecutable(cwd: string, fs: FileSystem): Promise<string> {
	// Prefer a workspace-local node_modules path over `import.meta.resolve`.
	//
	// Under Bun on Windows, `import.meta.resolve('vite/bin/vite.js')` can return
	// Bun's install-cache realpath (e.g. `C:\Users\…\.bun\install\cache\vite@8.0.9@@@1\bin\vite.js`).
	// Executing that realpath via Node breaks Vite 8's resolution of `rolldown` and other
	// transitive deps, because Node's resolver no longer sees the workspace's hoisted
	// node_modules tree from the cache directory.
	//
	// Walking up `node_modules/vite/bin/vite.js` from cwd preserves the symlinked path
	// inside the workspace, which keeps Node's package resolution intact.
	const workspaceLocal = await findWorkspaceLocalBinary(cwd, fs, ['vite', 'bin', 'vite.js'])
	if (workspaceLocal) {
		return workspaceLocal
	}

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

/**
 * Walk up the directory tree from `startDir` looking for
 * `node_modules/<segments>`. Returns the first match or null.
 *
 * This preserves the workspace-local (symlinked) path rather than the
 * package manager's underlying cache realpath, which matters for Node
 * package resolution semantics under Bun on Windows.
 */
export async function findWorkspaceLocalBinary(
	startDir: string,
	fs: FileSystem,
	segments: readonly string[]
): Promise<string | null> {
	let currentDir = resolve(startDir)
	// Bound the walk by the filesystem root.
	for (let depth = 0;depth < 64;depth++) {
		const candidate = resolve(currentDir, 'node_modules', ...segments)
		try {
			await fs.access(candidate)
			return candidate
		} catch {
			// not here, walk up
		}
		const parent = dirname(currentDir)
		if (parent === currentDir) {
			return null
		}
		currentDir = parent
	}
	return null
}

/** True when the current process is Bun (and `bun` is therefore on PATH). */
export function isRunningUnderBun(): boolean {
	return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
		|| typeof (process.versions as { bun?: string }).bun === 'string'
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
	const config = await resolveConfigEnvVars(
		resolveConfigForEnvironment(rawConfig, environment),
		{
			cwd,
			configPath,
			mode: 'build'
		}
	)

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
			deployWranglerConfig.main = relative(cwd, composedMainEntry)
			logLine(logger, `Generated composed worker entry: ${deployWranglerConfig.main}`)
		}
	} else if (composedMainEntry) {
		const bundledMainEntryPath = await bundleWorkerEntry({
			cwd,
			inputFile: composedMainEntry,
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

		// When running under Bun, invoke Vite through `bun --bun <vite.js>` rather
		// than letting execa launch Node directly. Two reasons:
		//   1. Bun preserves workspace-local package resolution even if the
		//      executable file path is a hoisted/cache symlink target.
		//   2. Vite 8's `rolldown` import resolves correctly under Bun on Windows.
		// `--bun` forces Bun's runtime even when the script has a Node shebang.
		const useBunRuntime = isRunningUnderBun()
		const buildCommand = useBunRuntime ? 'bun' : viteExecutablePath
		const buildArgs = useBunRuntime
			? ['--bun', viteExecutablePath, 'build', '--config', generatedViteConfigPath]
			: ['build', '--config', generatedViteConfigPath]

		const buildProc = await deps.exec.exec(buildCommand, buildArgs, {
			cwd,
			stdio: 'inherit',
			env: {
				...process.env,
				DEVFLARE_BUILD: 'true'
			},
			// Don't reject on non-zero exit — we want to surface a richer error below.
			reject: false
		})

		if (buildProc.exitCode !== 0) {
			throw new Error(
				`Vite build failed (exit code ${buildProc.exitCode}).\n`
				+ `\n`
				+ `Command: ${buildCommand} ${buildArgs.join(' ')}\n`
				+ `Working directory: ${cwd}\n`
				+ `Vite executable: ${viteExecutablePath}\n`
				+ `Runtime: ${useBunRuntime ? 'bun --bun' : 'node (default execa runtime)'}\n`
				+ `\n`
				+ `Vite's own output is printed above. If you only see "UNHANDLED PROMISE REJECTION"\n`
				+ `with no other detail, common causes are:\n`
				+ `  - A Vite plugin or transitive dependency (e.g. rolldown) cannot be resolved\n`
				+ `    from the executable's physical path. This commonly happens when the package\n`
				+ `    manager resolves the Vite binary to a global cache directory outside the\n`
				+ `    workspace's node_modules tree. Try reinstalling, or run vite directly to\n`
				+ `    isolate: \`bunx --bun vite build --config ${relative(cwd, generatedViteConfigPath).replace(/\\/g, '/')}\`.\n`
				+ `  - A peer dependency or framework adapter is missing. Re-check the package's\n`
				+ `    devDependencies against the framework's documented requirements.\n`
				+ `  - The generated vite config references a path that does not yet exist.`
			)
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
	const manifest = createBuildManifest(config, {
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
