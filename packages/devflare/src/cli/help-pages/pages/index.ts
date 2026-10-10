import type { HelpPage } from '../types'
import { ACCOUNT_HELP_PAGES } from './account'
import { CORE_HELP_PAGES } from './core'
import { MISC_HELP_PAGES } from './misc'
import { PREVIEW_HELP_PAGES } from './previews'
import { PRODUCTION_HELP_PAGES } from './productions'

export const HELP_PAGES: HelpPage[] = [
	...CORE_HELP_PAGES,
	...ACCOUNT_HELP_PAGES,
	...PREVIEW_HELP_PAGES,
	...PRODUCTION_HELP_PAGES,
	...MISC_HELP_PAGES
]
