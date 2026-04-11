// =============================================================================
// CLI Entry Point — Command parsing and routing
// =============================================================================

import { createConsola, type ConsolaInstance } from 'consola'
import { getPackageVersion } from './package-metadata'
import { createCliTheme, cyan, cyanBold, dim, formatCommand, logLine } from './ui'

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
}

export interface CliResult {
	exitCode: number
	output?: string
}

// =============================================================================
// Constants
// =============================================================================

const COMMANDS = ['init', 'dev', 'build', 'deploy', 'types', 'doctor', 'config', 'account', 'login', 'previews', 'worker', 'tokens', 'token', 'ai', 'remote', 'help', 'version'] as const
type Command = typeof COMMANDS[number]

// =============================================================================
// Argument Parser
// =============================================================================

/**
 * Parses CLI arguments into structured format
 */
export function parseArgs(argv: string[]): ParsedArgs {
	const args: string[] = []
	const options: Record<string, string | boolean> = {}
	let command: string = 'help'
	let unknownCommand: string | undefined

	let i = 0

	// Check for global flags first
	while (i < argv.length) {
		const arg = argv[i]

		if (arg === '--help' || arg === '-h') {
			return { command: 'help', args: [], options: {} }
		}

		if (arg === '--version' || arg === '-v') {
			return { command: 'version', args: [], options: {} }
		}

		if (arg.startsWith('-') && !/^-\d/.test(arg)) {
			// Parse option (but not negative numbers like -5)
			const isLongFlag = arg.startsWith('--')
			const key = isLongFlag ? arg.slice(2) : arg.slice(1)

			// Check if next arg is a value (doesn't start with -)
			const nextArg = argv[i + 1]
			if (nextArg && !nextArg.startsWith('-')) {
				options[key] = nextArg
				i += 2
			} else {
				options[key] = true
				i++
			}
		} else if (!command || command === 'help') {
			// First non-flag arg is the command
			if (COMMANDS.includes(arg as Command)) {
				command = arg
			} else {
				command = 'help'
				unknownCommand = arg
			}
			i++
		} else {
			// Positional argument
			args.push(arg)
			i++
		}
	}

	return { command, args, options, unknownCommand }
}

// =============================================================================
// Help Text
// =============================================================================

function getHelpText(): string {
	return `
devflare - Config compiler + CLI orchestrator for Cloudflare Workers

Usage:
  devflare <command> [options]

Commands:
	init [name]         Create a new devflare project
	dev                 Start the development server
	build               Build for production
	deploy              Deploy to Cloudflare
	types               Generate TypeScript types
	doctor              Check project configuration
	config              Print resolved Devflare/Wrangler config
	account             View Cloudflare account info
	login               Authenticate with Cloudflare via Wrangler
	previews            Inspect and manage Devflare preview registry state
	worker              Rename and manage Worker control-plane operations
	tokens              Manage Devflare-managed Cloudflare API tokens
	ai                  View AI models and pricing
	remote              Manage remote test mode (AI, Vectorize)
	help                Show command overview
	version             Show the installed devflare version

Common Options:
	--config <path>     Used by dev, build, deploy, types, doctor, and config
	--env <name>        Used by build, deploy, and config to select config.env[name]
	--debug             Enable debug output for supported commands
	-h, --help          Show help
	-v, --version       Show version

Dev Options:
	--port <port>       Preferred Vite dev server port (default: 5173)
	--persist           Persist Miniflare storage data
	--verbose           Enable verbose logging
	--log               Log all output to a timestamped .log-* file and the terminal
	--log-temp          Log all output to .log (overwritten) and the terminal

Build / Deploy:
	build --env <name>          Use config.env[name]
	deploy --env <name>         Use config.env[name]
	deploy --preview            Upload a preview version with wrangler versions upload
	deploy --preview --preview-alias <alias>
	                          Upload a preview version with a stable alias
	deploy --preview --branch-name <branch>
	                          Derive a stable preview alias from branch metadata
	deploy --message <text>    Attach a Wrangler version/deployment message
	deploy --tag <text>        Attach a Wrangler version tag
	deploy --dry-run            Print the generated Wrangler config without deploying
	login --force               Open Wrangler login even when auth is already present
	previews                    List active preview state from the Devflare registry
	previews --all              Include historical and deleted registry records
	previews reconcile          Reconcile the registry against live Cloudflare versions
	previews cleanup --apply    Soft-delete stale registry records after reconciliation
	previews cleanup-resources --env preview --apply
	                          Delete preview-scoped Cloudflare resources for the active preview scope
	previews retire --worker <name> --branch <branch> --apply
	                          Retire a tracked preview immediately by branch, alias, version, or commit
	worker rename <old-name> --to <new-name>
	                          Rename an existing Worker and sync the matching devflare config
	tokens <bootstrap-token> --new [name]
	                          Create a Devflare-managed account-owned token
	tokens <bootstrap-token> --roll [name]
	                          Roll a matching Devflare-managed token secret (prompts when name is omitted)
	tokens <bootstrap-token> --list
	                          List Devflare-managed account-owned tokens for the selected account
	tokens <bootstrap-token> --delete [name]
	                          Delete a matching Devflare-managed token (prompts when name is omitted)
	tokens <bootstrap-token> --delete-all
	                          Delete every Devflare-managed token for the selected account

Types / Doctor:
	types --output <path>       Write generated types to a custom path
	doctor --config <path>      Check a specific devflare config file
	config print --json         Print resolved config as JSON
	config print --format wrangler  Print resolved Wrangler config JSON

Account / Remote:
	account --account <id>      Use a specific Cloudflare account
	remote status               Show current remote-mode status
	remote enable [minutes]     Enable remote mode (default: 30 minutes)
	remote disable              Disable remote mode

Notes:
	• Worker-only mode is the default when the current package has no local vite.config.*
	• Vite is started only when the current package provides a local vite.config.*
	• Higher-level build flows currently synthesize a composed worker entry when worker surfaces are discovered

Examples:
  devflare init my-app
	devflare dev                  # Start worker-only or unified dev server
	devflare dev --port 3000      # Custom Vite port when Vite is enabled
  devflare dev --persist        # Persist storage between restarts
  devflare dev --log-temp       # Log output to .log file
  devflare build
  devflare deploy --env production
	devflare deploy --preview --preview-alias feature-branch
`.trim()
}

function getStyledHelpText(options: Record<string, string | boolean>): string {
	const theme = createCliTheme(options)

	return [
		'',
		`${cyanBold('devflare', theme)} ${dim('Config compiler + CLI orchestrator for Cloudflare Workers', theme)}`,
		'',
		dim('usage', theme),
		`  ${cyan('devflare', theme)} <command> [options]`,
		'',
		dim('commands', theme),
		formatCommand('init [name]', 'Create a new devflare project', theme),
		formatCommand('dev', 'Start the development server', theme),
		formatCommand('build', 'Build for production', theme),
		formatCommand('deploy', 'Deploy to Cloudflare', theme),
		formatCommand('types', 'Generate TypeScript types', theme),
		formatCommand('doctor', 'Check project configuration', theme),
		formatCommand('config', 'Print resolved Devflare/Wrangler config', theme),
		formatCommand('account', 'View Cloudflare account info', theme),
		formatCommand('login', 'Authenticate with Cloudflare via Wrangler', theme),
		formatCommand('previews', 'Inspect and manage Devflare preview registry state', theme),
		formatCommand('worker', 'Rename and manage Worker control-plane operations', theme),
		formatCommand('tokens', 'Manage Devflare-managed Cloudflare API tokens', theme),
		formatCommand('ai', 'View AI models and pricing', theme),
		formatCommand('remote', 'Manage remote test mode (AI, Vectorize)', theme),
		formatCommand('help', 'Show command overview', theme),
		formatCommand('version', 'Show the installed devflare version', theme),
		'',
		dim('common options', theme),
		formatCommand('--config <path>', 'Used by dev, build, deploy, types, doctor, and config', theme),
		formatCommand('--env <name>', 'Used by build, deploy, and config to select config.env[name]', theme),
		formatCommand('--debug', 'Enable debug output for supported commands', theme),
		formatCommand('-h, --help', 'Show help', theme),
		formatCommand('-v, --version', 'Show version', theme),
		'',
		dim('examples', theme),
		formatCommand('devflare dev', 'Start worker-only or unified dev server', theme),
		formatCommand('devflare dev --port 3000', 'Use a custom Vite port when Vite is enabled', theme),
		formatCommand('devflare deploy --preview --preview-alias feature-branch', 'Upload a preview version with a stable alias', theme),
		formatCommand('devflare deploy --message "Docs release" --tag docs-123', 'Attach explicit version metadata to a deploy', theme),
		formatCommand('devflare worker rename documentation --to devflare-documentation', 'Rename a Worker and sync the matching devflare config', theme),
		formatCommand('devflare previews reconcile', 'Reconcile the registry against live Cloudflare versions', theme),
		formatCommand('devflare previews cleanup-resources --env preview --apply', 'Delete preview-scoped Cloudflare resources for the current preview scope', theme),
		formatCommand('devflare tokens <bootstrap-token> --new preview', 'Create a prefixed Devflare-managed account token', theme),
		formatCommand('devflare tokens <bootstrap-token> --roll preview', 'Roll the secret for a Devflare-managed account token', theme),
		formatCommand('devflare account workers', 'List Workers for the selected account', theme),
		formatCommand('devflare remote enable 30', 'Enable remote test mode for 30 minutes', theme),
		''
	].join('\n')
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

	// Route to command handler
	switch (parsed.command) {
		case 'help':
			logLine(logger, getStyledHelpText(parsed.options))
			return { exitCode: 0, output: getHelpText() }

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
	return runDeployCommand(parsed, logger, options)
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
