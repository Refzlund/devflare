import { type ConsolaInstance } from 'consola'
import { loadResolvedConfig } from '../../config'
import { compileConfig } from '../../config/compiler'
import type { ParsedArgs, CliOptions, CliResult } from '../index'

function isSupportedFormat(value: string): value is 'devflare' | 'wrangler' {
	return value === 'devflare' || value === 'wrangler'
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

	try {
		const resolvedConfig = await loadResolvedConfig({
			cwd,
			configFile: configPath,
			environment
		})
		const output = format === 'wrangler'
			? compileConfig(resolvedConfig)
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
		}
		return { exitCode: 1 }
	}
}