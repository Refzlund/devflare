import { redirect } from '@sveltejs/kit'
import { docPath } from '#lib/docs/content.js'
import { extractLocaleFromUrl, localizeHref } from '#lib/paraglide/runtime.js'
import type { PageLoad } from './$types'

export const load: PageLoad = ({ url }) => {
	const locale = extractLocaleFromUrl(url)
	throw redirect(308, localizeHref(docPath('what-devflare-is'), { locale }))
}
