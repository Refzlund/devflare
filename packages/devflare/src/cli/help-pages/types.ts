export interface HelpEntry {
	command: string
	description: string
}

export interface HelpPage {
	path: string[]
	summary: string
	usage: string[]
	description?: string[]
	arguments?: HelpEntry[]
	options?: HelpEntry[]
	subcommands?: HelpEntry[]
	examples?: HelpEntry[]
	notes?: string[]
	aliases?: string[]
	optionSectionTitle?: string
}

export interface RenderedHelp {
	styled: string
	plain: string
	path: string[]
}
