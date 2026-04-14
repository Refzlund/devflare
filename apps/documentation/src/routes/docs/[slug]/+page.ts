import { error } from '@sveltejs/kit'
import { getAdjacentDocs, getDoc } from '$lib/docs/content'

export function load({ params }) {
	const doc = getDoc(params.slug)

	if (!doc) {
		throw error(404, `Unknown documentation page: ${params.slug}`)
	}

	return {
		doc,
		...getAdjacentDocs(params.slug)
	}
}
