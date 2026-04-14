// =============================================================================
// CLI Entry Point — Command parsing and routing
// =============================================================================

import { createConsola, type ConsolaInstance } from 'consola'
import { getPackageVersion } from './package-metadata'
import { COMMANDS, renderHelp, type Command } from './help'
import { createCliTheme, cyanBold, dim, logLine } from './ui'

// =============================================================================
// Types
// =============================================================================

export interface ParsedArgs {
	command: string
	args: string[]
	options: Record<string, string | boolean>
	unknownCommand?: string
}

export interface CliOptions {
	silent?: boolean
	cwd?: string
	requireExplicitDeployTarget?: boolean
}

export interface CliResult {
	exitCode: number
	output?: string
}

// =============================================================================
// Constants
// =============================================================================

// =============================================================================
// Argument Parser
// =============================================================================

/**
 * Parses CLI arguments into structured format
 */
export function parseArgs(argv: string[]): ParsedArgs {
	const args: string[] = []
	const options: Record<string, string | boolean> = {}
	let command: string | undefined
	let unknownCommand: string | undefined

	let i = 0
	const shortOptionAliases: Record<string, string> = {
		h: 'help',
		v: 'version'
	}

	while (i < argv.length) {
		const arg = argv[i]

		if (arg.startsWith('-') && !/^-\d/.test(arg)) {
			// Parse option (but not negative numbers like -5)
			const isLongFlag = arg.startsWith('--')
			const rawKey = isLongFlag ? arg.slice(2) : arg.slice(1)
			const key = isLongFlag ? rawKey : (shortOptionAliases[rawKey] ?? rawKey)

			// Check if next arg is a value (doesn't start with -)
			const nextArg = argv[i + 1]
			if (nextArg && !nextArg.startsWith('-')) {
				options[key] = nextArg
				i += 2
			} else {
				options[key] = true
				i++
			}
		} else if (!command) {
			// First non-flag arg is the command
			if (COMMANDS.includes(arg as Command)) {
				command = arg
			} else {
				unknownCommand = arg
				break
			}
			i++
		} else {
			// Positional argument
			args.push(arg)
			i++
		}
	}

	if (unknownCommand) {
		return {
			command: 'help',
			args: [],
			options,
			unknownCommand
		}
	}

	if (!command) {
		if (options.version === true) {
			return { command: 'version', args: [], options }
		}

		return { command: 'help', args: [], options }
	}

	return { command, args, options, unknownCommand }
}

// =============================================================================
// CLI Runner
// =============================================================================

/**
 * Main CLI entry point
 */
export async function runCli(
	argv: string[],
	options: CliOptions = {}
): Promise<CliResult> {
	const logger = createConsola({
		level: options.silent ? -999 : 3,
		formatOptions: {
			date: false
		}
	})

	const parsed = parseArgs(argv)
	const theme = createCliTheme(parsed.options)

	// Handle unknown command
	if (parsed.unknownCommand) {
		logger.error(`Unknown command: ${parsed.unknownCommand}`)
		logLine(logger, dim('Run `devflare --help` for available commands', theme))
		return { exitCode: 1 }
	}

	const wantsHelp = parsed.options.help === true
	const helpPath = parsed.command === 'help'
		? parsed.args
		: wantsHelp
			? [parsed.command, ...parsed.args]
			: undefined

	if (helpPath) {
		const renderedHelp = renderHelp(helpPath, parsed.options)
		if (!renderedHelp) {
			const requestedTopic = helpPath.join(' ')
			logger.error(`Unknown help topic: ${requestedTopic}`)
			logLine(logger, dim('Run `devflare --help` for available commands', theme))
			return { exitCode: 1 }
		}

		logLine(logger, renderedHelp.styled)
		return { exitCode: 0, output: renderedHelp.plain }
	}

	// Route to command handler
	switch (parsed.command) {
		case 'version':
			const version = await getPackageVersion()
			logLine(logger, `${cyanBold('devflare', theme)} ${dim(`v${version}`, theme)}`)
			return { exitCode: 0, output: version }

		case 'init':
			return runInit(parsed, logger, options)

		case 'dev':
			return runDev(parsed, logger, options)

		case 'build':
			return runBuild(parsed, logger, options)

		case 'deploy':
			return runDeploy(parsed, logger, options)

		case 'types':
			return runTypes(parsed, logger, options)

		case 'doctor':
			return runDoctor(parsed, logger, options)

		case 'config':
			return runConfig(parsed, logger, options)

		case 'account':
			return runAccount(parsed, logger, options)

		case 'login':
			return runLogin(parsed, logger, options)

		case 'previews':
			return runPreviews(parsed, logger, options)

		case 'productions':
			return runProductions(parsed, logger, options)

		case 'worker':
			return runWorker(parsed, logger, options)

		case 'tokens':
		case 'token':
			return runToken(parsed, logger, options)

		case 'ai':
			return runAI()

		case 'remote':
			return runRemote(parsed, logger, options)

		default:
			logger.error(`Unknown command: ${parsed.command}`)
			return { exitCode: 1 }
	}
}

// =============================================================================
// Command Stubs (to be implemented)
// =============================================================================

async function runInit(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	// Will be implemented in init.ts
	const { runInitCommand } = await import('./commands/init')
	return runInitCommand(parsed, logger, options)
}

async function runDev(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	// Will be implemented in dev.ts
	const { runDevCommand } = await import('./commands/dev')
	return runDevCommand(parsed, logger, options)
}

async function runBuild(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	// Will be implemented in build.ts
	const { runBuildCommand } = await import('./commands/build')
	return runBuildCommand(parsed, logger, options)
}

async function runDeploy(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	// Will be implemented in deploy.ts
	const { runDeployCommand } = await import('./commands/deploy')
	return runDeployCommand(parsed, logger, {
		...options,
		requireExplicitDeployTarget: true
	})
}

async function runTypes(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	// Will be implemented in types.ts
	const { runTypesCommand } = await import('./commands/types')
	return runTypesCommand(parsed, logger, options)
}

async function runDoctor(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	// Will be implemented in doctor.ts
	const { runDoctorCommand } = await import('./commands/doctor')
	return runDoctorCommand(parsed, logger, options)
}

async function runConfig(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const { runConfigCommand } = await import('./commands/config')
	return runConfigCommand(parsed, logger, options)
}

async function runAccount(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const { runAccountCommand } = await import('./commands/account')
	return runAccountCommand(parsed, logger, options)
}

async function runLogin(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const { runLoginCommand } = await import('./commands/login')
	return runLoginCommand(parsed, logger, options)
}

async function runPreviews(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const { runPreviewsCommand } = await import('./commands/previews')
	return runPreviewsCommand(parsed, logger, options)
}

async function runProductions(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const { runProductionsCommand } = await import('./commands/productions')
	return runProductionsCommand(parsed, logger, options)
}

async function runWorker(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const { runWorkerCommand } = await import('./commands/worker')
	return runWorkerCommand(parsed, logger, options)
}

async function runToken(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const { runTokenCommand } = await import('./commands/token')
	return runTokenCommand(parsed, logger, options)
}

async function runAI(): Promise<CliResult> {
	const { runAICommand } = await import('./commands/ai')
	return runAICommand()
}

async function runRemote(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const { runRemoteCommand } = await import('./commands/remote')
	return runRemoteCommand(parsed, logger, options)
}
