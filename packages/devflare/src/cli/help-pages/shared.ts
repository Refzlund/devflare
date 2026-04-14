import type { HelpEntry, HelpPage } from './types'

export const COMMANDS = ['init', 'dev', 'build', 'deploy', 'types', 'doctor', 'config', 'account', 'login', 'previews', 'productions', 'worker', 'tokens', 'token', 'ai', 'remote', 'help', 'version'] as const
export type Command = typeof COMMANDS[number]

export const COMMAND_ALIASES: Record<string, string> = {
	token: 'tokens'
}

export const COMMON_OPTIONS: HelpEntry[] = [
	{ command: '--config <path>', description: 'Select a specific devflare config file when the command supports it' },
	{ command: '--env <name>', description: 'Resolve config.env[name] when the command supports environments' },
	{ command: '--debug', description: 'Print extra stack traces and debug output for supported commands' },
	{ command: '--no-color', description: 'Disable ANSI color output' },
	{ command: '-h, --help', description: 'Show detailed help for the current command' },
	{ command: '-v, --version', description: 'Show the installed devflare version' }
]

export const ACCOUNT_OPTION: HelpEntry = {
	command: '--account <id>',
	description: 'Use a specific Cloudflare account instead of the workspace/global/default account'
}

export const PREVIEWS_COMMON_OPTIONS: HelpEntry[] = [
	{ command: '--account <id>', description: 'Use a specific Cloudflare account for preview Worker and preview-resource operations' }
]

export function entry(command: string, description: string): HelpEntry {
	return { command, description }
}

function createSubcommandHelpPage(options: {
	parentPath: string
	subcommand: string
	summary: string
	usage: string[]
	description: string[]
	options?: HelpEntry[]
	examples?: HelpEntry[]
	notes?: string[]
}): HelpPage {
	return {
		path: [options.parentPath, options.subcommand],
		summary: options.summary,
		usage: options.usage,
		description: options.description,
		...(options.options !== undefined ? { options: options.options } : {}),
		...(options.examples !== undefined ? { examples: options.examples } : {}),
		...(options.notes !== undefined ? { notes: options.notes } : {})
	}
}

type OptionedSubcommandHelpPageFactory = (
	subcommand: string,
	summary: string,
	usage: string[],
	description: string[],
	options: HelpEntry[],
	examples: HelpEntry[],
	notes?: string[]
) => HelpPage

function createOptionedSubcommandHelpPageFactory(parentPath: string): OptionedSubcommandHelpPageFactory {
	return (subcommand, summary, usage, description, options, examples, notes = []) => {
		return createSubcommandHelpPage({
			parentPath,
			subcommand,
			summary,
			usage,
			description,
			options,
			examples,
			notes
		})
	}
}

export function createAccountInventoryPage(
	subcommand: string,
	summary: string,
	description: string,
	exampleDescription: string
): HelpPage {
	return createSubcommandHelpPage({
		parentPath: 'account',
		subcommand,
		summary,
		usage: [
			`devflare account ${subcommand} [--account <id>]`
		],
		description: [description],
		options: [ACCOUNT_OPTION],
		examples: [
			entry(`devflare account ${subcommand}`, exampleDescription)
		],
		notes: [
			'Omit --account to resolve the account from workspace preferences, CLOUDFLARE_ACCOUNT_ID, devflare.config.*, or the primary authenticated account.'
		]
	})
}

export function createRemoteSubcommandPage(
	subcommand: string,
	summary: string,
	usage: string[],
	description: string[],
	examples: HelpEntry[],
	notes: string[]
): HelpPage {
	return createSubcommandHelpPage({
		parentPath: 'remote',
		subcommand,
		summary,
		usage,
		description,
		examples,
		notes
	})
}

export const createPreviewSubcommandPage = createOptionedSubcommandHelpPageFactory('previews')

export const createProductionsSubcommandPage = createOptionedSubcommandHelpPageFactory('productions')
