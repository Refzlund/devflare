import { error, redirect } from '@sveltejs/kit'
import { docPath, getAdjacentDocs, getCanonicalDocSlug, getDoc } from '$lib/docs/content'
import { extractLocaleFromUrl, localizeHref } from '$lib/paraglide/runtime'

export function load({ params, url }) {
	const slug = params.slug
	const doc = getDoc(slug)

	if (!doc) {
		throw error(404, `Unknown documentation page: ${slug}`)
	}

	const canonicalSlug = getCanonicalDocSlug(slug)

	if (canonicalSlug && canonicalSlug !== slug) {
		const locale = extractLocaleFromUrl(url)
		throw redirect(308, localizeHref(docPath(canonicalSlug), { locale }))
	}

	return {
		doc,
		...getAdjacentDocs(slug)
	}
}