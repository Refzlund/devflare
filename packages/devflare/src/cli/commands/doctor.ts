// =============================================================================
// Doctor Command — Check project configuration
// =============================================================================

import { type ConsolaInstance } from 'consola'
import { basename, dirname, relative, resolve } from 'pathe'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { resolveConfigPath, loadConfig } from '../../config/loader'
import { getDependencies } from '../dependencies'
import { getGeneratedArtifactPaths } from '../generated-artifacts'
import { detectViteProject } from '../../dev-server/vite-utils'
import { formatSupportedConfigFilenames, resolveConfigCandidatePath } from '../config-path'
import { getPackageVersion } from '../package-metadata'
import { bold, createCliTheme, dim, green, logLine, red, yellow } from '../ui'

interface CheckResult {
	name: string
	status: 'pass' | 'warn' | 'fail'
	message: string
}

export async function runDoctorCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const cwd = options.cwd || process.cwd()
	const theme = createCliTheme(parsed.options)
	const requestedConfigOption = parsed.options.config as string | undefined
	const scope = (parsed.options.scope as string | undefined) ?? 'all'
	if (!['all', 'local', 'deploy'].includes(scope)) {
		logger.error(`Unsupported doctor scope: ${scope}`)
		logger.info('Supported scopes: all, local, deploy')
		return { exitCode: 1 }
	}

	const requestedConfigPath = requestedConfigOption
		? resolve(cwd, requestedConfigOption)
		: cwd
	const checks: CheckResult[] = []
	const { fs } = await getDependencies()
	const viteProject = await detectViteProject(cwd, fs as unknown as Parameters<typeof detectViteProject>[1])

	logLine(logger)
	logLine(logger, `${bold('doctor', theme)} ${dim('Running diagnostics', theme)}`)
	logLine(logger)

	// Check 1: config file exists
	const configPath = await resolveConfigCandidatePath(requestedConfigPath)
	if (configPath) {
		checks.push({
			name: 'Config File',
			status: 'pass',
			message: `Found: ${configPath}`
		})

		// Check 1b: Config is valid
		try {
			const config = requestedConfigOption
				? await loadConfig({
					cwd: dirname(configPath),
					configFile: basename(configPath)
				})
				: await loadConfig({ cwd })
			checks.push({
				name: 'Config Valid',
				status: 'pass',
				message: `Project: ${config.name}`
			})
		} catch (error) {
			checks.push({
				name: 'Config Valid',
				status: 'fail',
				message: error instanceof Error ? error.message : 'Unknown error'
			})
		}
	} else {
		checks.push({
			name: 'Config File',
			status: 'fail',
			message: `${formatSupportedConfigFilenames()} not found. Run \`devflare init\` to create one.`
		})
	}

	// Check 2: package.json exists
	const packageJsonPath = resolve(cwd, 'package.json')
	try {
		await fs.access(packageJsonPath)
		const content = await fs.readFile(packageJsonPath, 'utf-8')
		const pkg = JSON.parse(content)

		checks.push({
			name: 'package.json',
			status: 'pass',
			message: `Found: ${pkg.name || 'unnamed'}`
		})

		// Check 2b: Required dependencies
		const deps = { ...pkg.dependencies, ...pkg.devDependencies }

		if (deps.devflare) {
			const resolvedVersion = await getPackageVersion()
			checks.push({
				name: 'devflare dep',
				status: 'pass',
				message: `package.json: ${deps.devflare}, resolved: ${resolvedVersion}`
			})
		} else {
			checks.push({
				name: 'devflare dep',
				status: 'warn',
				message: 'devflare not in dependencies'
			})
		}
	} catch {
		checks.push({
			name: 'package.json',
			status: 'fail',
			message: 'package.json not found'
		})
	}

	if (viteProject.wantsViteIntegration) {
		checks.push({
			name: 'Vite Integration',
			status: 'pass',
			message: 'Enabled for this package'
		})

		if (viteProject.hasLocalViteDependency) {
			checks.push({
				name: 'vite dep',
				status: 'pass',
				message: 'Found in package.json'
			})
		} else {
			checks.push({
				name: 'vite dep',
				status: 'warn',
				message: 'Not declared in this package.json (workspace-hoisted installs may still work)'
			})
		}

		if (viteProject.hasLocalCloudflareVitePluginDependency) {
			checks.push({
				name: '@cloudflare/vite-plugin',
				status: 'pass',
				message: 'Found in package.json'
			})
		} else {
			checks.push({
				name: '@cloudflare/vite-plugin',
				status: 'pass',
				message: 'Optional: not declared in this package.json. Install it only when your Vite config calls the Cloudflare Vite plugin directly.'
			})
		}

		if (viteProject.viteConfigPath) {
			checks.push({
				name: 'Vite Config',
				status: 'pass',
				message: `Found: ${viteProject.viteConfigPath}`
			})
		} else {
			checks.push({
				name: 'Vite Config',
				status: 'warn',
				message: 'No vite.config found. Create one with @cloudflare/vite-plugin'
			})
		}
	} else {
		checks.push({
			name: 'Vite Integration',
			status: 'pass',
			message: 'Not enabled for this package (worker-only mode)'
		})
	}

	// Check 4: tsconfig.json exists
	try {
		await fs.access(resolve(cwd, 'tsconfig.json'))
		checks.push({
			name: 'tsconfig.json',
			status: 'pass',
			message: 'Found'
		})
	} catch {
		checks.push({
			name: 'tsconfig.json',
			status: 'warn',
			message: 'tsconfig.json not found'
		})
	}

	// Check 5: generated Wrangler config artifacts
	const artifactPaths = getGeneratedArtifactPaths(cwd)

	if (scope === 'all' || scope === 'local') {
		try {
			await fs.access(artifactPaths.devWranglerConfigPath)
			checks.push({
				name: 'Generated dev config',
				status: 'pass',
				message: `Found: ${relative(cwd, artifactPaths.devWranglerConfigPath)}`
			})
		} catch {
			checks.push({
				name: 'Generated dev config',
				status: 'warn',
				message: 'Local readiness: not found. Run `devflare dev` or start `devflare/vite` to populate `.devflare/wrangler.jsonc`.'
			})
		}
	}

	if (scope === 'all' || scope === 'deploy') {
		try {
			await fs.access(artifactPaths.buildWranglerConfigPath)
			checks.push({
				name: 'Generated deploy config',
				status: 'pass',
				message: `Found: ${relative(cwd, artifactPaths.buildWranglerConfigPath)}`
			})
		} catch {
			checks.push({
				name: 'Generated deploy config',
				status: 'warn',
				message: 'Deploy readiness: not found. Run `devflare build` or `devflare deploy` to generate `.devflare/build/wrangler.jsonc`.'
			})
		}

		try {
			await fs.access(artifactPaths.deployRedirectPath)
			checks.push({
				name: 'Wrangler deploy redirect',
				status: 'pass',
				message: `Found: ${relative(cwd, artifactPaths.deployRedirectPath)}`
			})
		} catch {
			checks.push({
				name: 'Wrangler deploy redirect',
				status: 'warn',
				message: 'Deploy readiness: not found. Run `devflare build` or `devflare deploy` to generate `.wrangler/deploy/config.json`.'
			})
		}
	}

	// Output results
	let hasFailures = false
	let hasWarnings = false

	for (const check of checks) {
		const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗'
		if (check.status === 'pass') {
			logLine(logger, `${green(icon, theme)} ${bold(check.name, theme)}${dim(' — ', theme)}${check.message}`)
		} else if (check.status === 'warn') {
			logLine(logger, `${yellow(icon, theme)} ${bold(check.name, theme)}${dim(' — ', theme)}${check.message}`)
			hasWarnings = true
		} else {
			logLine(logger, `${red(icon, theme)} ${bold(check.name, theme)}${dim(' — ', theme)}${check.message}`)
			hasFailures = true
		}
	}

	logLine(logger)

	if (hasFailures) {
		logger.error('Some checks failed. Please fix the issues above.')
		return { exitCode: 1 }
	} else if (hasWarnings) {
		logger.warn('All critical checks passed, but there are warnings.')
		return { exitCode: 0 }
	} else {
		logger.success('All checks passed!')
		return { exitCode: 0 }
	}
}
