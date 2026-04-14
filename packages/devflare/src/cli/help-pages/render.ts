import { accent, bold, createCliTheme, cyan, cyanBold, dim, formatBullet, formatCommand, type CliTheme } from '../ui'
import { COMMAND_ALIASES, COMMANDS, type Command } from './shared'
import type { HelpEntry, HelpPage } from './types'

export function createHelpPageMap(pages: HelpPage[]): Map<string, HelpPage> {
	return new Map(pages.map((page) => [page.path.join(' '), page]))
}

export function canonicalizeHelpPath(path: string[]): string[] {
	const trimmedPath = path
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0)

	if (trimmedPath.length === 0) {
		return []
	}

	const [first, ...rest] = trimmedPath
	return [COMMAND_ALIASES[first] ?? first, ...rest]
}

export function resolveHelpPage(
	path: string[],
	helpPageMap: Map<string, HelpPage>
): HelpPage | undefined {
	const canonicalPath = canonicalizeHelpPath(path)
	if (canonicalPath.length === 0) {
		return helpPageMap.get('')
	}

	if (!COMMANDS.includes(canonicalPath[0] as Command) && !(canonicalPath[0] in COMMAND_ALIASES)) {
		return undefined
	}

	for (let length = canonicalPath.length;length > 0;length--) {
		const key = canonicalPath.slice(0, length).join(' ')
		const page = helpPageMap.get(key)
		if (page) {
			return page
		}
	}

	return undefined
}

function appendSection(lines: string[], title: string, sectionLines: string[]): void {
	if (sectionLines.length === 0) {
		return
	}

	if (lines.length > 0 && lines[lines.length - 1] !== '') {
		lines.push('')
	}

	lines.push(title)
	lines.push(...sectionLines)
}

function renderEntryList(entries: HelpEntry[], theme: CliTheme): string[] {
	return entries.map((item) => formatCommand(item.command, item.description, theme))
}

function renderBulletList(items: string[], theme: CliTheme): string[] {
	return items.map((item) => formatBullet(item, theme))
}

export function renderHelpPage(page: HelpPage, theme: CliTheme): string {
	const commandLabel = page.path.length === 0 ? 'devflare' : `devflare ${page.path.join(' ')}`
	const lines: string[] = [
		'',
		`${cyanBold(commandLabel, theme)} ${dim(page.summary, theme)}`,
		''
	]

	appendSection(
		lines,
		dim('usage', theme),
		page.usage.map((usageLine) => `  ${cyan(usageLine, theme)}`)
	)

	appendSection(lines, dim('overview', theme), renderBulletList(page.description ?? [], theme))
	appendSection(lines, dim('arguments', theme), renderEntryList(page.arguments ?? [], theme))
	appendSection(lines, dim('subcommands', theme), renderEntryList(page.subcommands ?? [], theme))
	appendSection(lines, dim(page.optionSectionTitle ?? 'options', theme), renderEntryList(page.options ?? [], theme))

	if (page.aliases && page.aliases.length > 0) {
		appendSection(
			lines,
			dim('aliases', theme),
			page.aliases.map((alias) => `  ${accent(alias, theme, 'green')}`)
		)
	}

	appendSection(lines, dim('examples', theme), renderEntryList(page.examples ?? [], theme))
	appendSection(lines, dim('notes', theme), renderBulletList(page.notes ?? [], theme))
	lines.push('')

	return lines.join('\n')
}

export function createThemes(options: Record<string, string | boolean> = {}): {
	styled: CliTheme
	plain: CliTheme
} {
	return {
		styled: createCliTheme(options),
		plain: { useColor: false }
	}
}

export { bold }
