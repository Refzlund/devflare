import { createHelpPageMap, createThemes, renderHelpPage, resolveHelpPage } from './help-pages/render'
import { HELP_PAGES } from './help-pages/pages'
import { COMMANDS, type Command } from './help-pages/shared'
import type { RenderedHelp } from './help-pages/types'

export { COMMANDS }
export type { Command }

const HELP_PAGE_MAP = createHelpPageMap(HELP_PAGES)

export function renderHelp(path: string[], options: Record<string, string | boolean> = {}): RenderedHelp | undefined {
	const page = resolveHelpPage(path, HELP_PAGE_MAP)
	if (!page) {
		return undefined
	}

	const themes = createThemes(options)

	return {
		styled: renderHelpPage(page, themes.styled),
		plain: renderHelpPage(page, themes.plain),
		path: page.path
	}
}
