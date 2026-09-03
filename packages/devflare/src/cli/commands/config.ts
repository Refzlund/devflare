import type { ConsolaInstance } from 'consola'
import {
	ConfigResourceResolutionError,
	type DevflareConfig,
	loadConfig,
	loadResolvedConfig,
	resolveConfigEnvVars,
	resolveResources
} from '../../config'
import { compileBuildConfig, compileConfig } from '../../config/compiler'
import type { CliOptions, CliResult, ParsedArgs } from '../index'

function isSupportedFormat(value: string): value is 'devflare' | 'wrangler' {
	return value === 'devflare' || value === 'wrangler'
}

type ConfigPhase = 'build' | 'local' | 'deploy'

function isSupportedPhase(value: string): value is ConfigPhase {
	return value === 'build' || value === 'local' || value === 'deploy'
}

async function loadConfigForPhase(options: {
	cwd: string
	configPath: string | undefined
	environment: string | undefined
	phase: ConfigPhase
}): Promise<DevflareConfig> {
	if (options.phase === 'deploy') {
		const resolvedConfig = await loadResolvedConfig({
			cwd: options.cwd,
			configFile: options.configPath,
			environment: options.environment
		})
		return await resolveConfigEnvVars(resolvedConfig, {
			cwd: options.cwd,
			configPath: options.configPath,
			mode: 'build'
		})
	}

	const config = await loadConfig({
		cwd: options.cwd,
		configFile: options.configPath
	})
	const resourceResolvedConfig = await resolveResources(config, {
		phase: options.phase,
		environment: options.environment
	})
	return await resolveConfigEnvVars(resourceResolvedConfig, {
		cwd: options.cwd,
		configPath: options.configPath,
		mode: options.phase === 'local' ? 'dev' : 'build'
	})
}

export async function runConfigCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const cwd = options.cwd || process.cwd()
	const configPath = parsed.options.config as string | undefined
	const environment = parsed.options.env as string | undefined
	const subcommand = parsed.args[0] ?? 'print'
	const formatOption = parsed.options.format as string | undefined
	const format = formatOption ?? 'devflare'
	const phaseOption =
		parsed.options.local === true
			? 'local'
			: ((parsed.options.phase as string | undefined) ?? 'deploy')

	if (subcommand !== 'print') {
		logger.error(`Unknown config subcommand: ${subcommand}`)
		logger.info('Supported subcommands: print')
		return { exitCode: 1 }
	}

	if (!isSupportedFormat(format)) {
		logger.error(`Unsupported config format: ${format}`)
		logger.info('Supported formats: devflare, wrangler')
		return { exitCode: 1 }
	}

	if (!isSupportedPhase(phaseOption)) {
		logger.error(`Unsupported config phase: ${phaseOption}`)
		logger.info('Supported phases: build, local, deploy')
		return { exitCode: 1 }
	}

	try {
		const resolvedConfig = await loadConfigForPhase({
			cwd,
			configPath,
			environment,
			phase: phaseOption
		})
		const output =
			format === 'wrangler'
				? phaseOption === 'build'
					? compileBuildConfig(resolvedConfig, undefined, { alreadyResolved: true })
					: compileConfig(resolvedConfig as Parameters<typeof compileConfig>[0])
				: resolvedConfig
		const text = JSON.stringify(output, null, '\t')

		if (!options.silent) {
			process.stdout.write(`${text}\n`)
		}

		return {
			exitCode: 0,
			output: text
		}
	} catch (error) {
		if (error instanceof Error) {
			logger.error('Config command failed:', error.message)
			if (error instanceof ConfigResourceResolutionError) {
				logger.info(
					'For offline inspection, run `devflare config --phase local` or `devflare config --phase build --format wrangler`.'
				)
			}
		}
		return { exitCode: 1 }
	}
}
