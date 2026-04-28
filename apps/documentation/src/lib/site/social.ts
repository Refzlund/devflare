import type { DocPage } from '$lib/docs/types'

type SocialDoc = Pick<DocPage, 'navTitle' | 'summary'>

export const BRAND_COLOR = '#ff5000'
export const SOCIAL_CARDS_PATH = '/social-cards'
export const DEFAULT_SOCIAL_CARD_TITLE = 'Cloudflare Workers without the glue work'
export const SOCIAL_IMAGE_ALT = 'Devflare Docs social preview card.'
export const DEFAULT_SOCIAL_TITLE = 'Devflare Docs'
export const DEFAULT_SOCIAL_DESCRIPTION =
	'Build and test Cloudflare Workers with local-first bindings, typed config, preview workflows, and examples you can run.'

export function getSocialTitle(doc: SocialDoc | undefined): string {
	return doc ? `${doc.navTitle} - Devflare Docs` : DEFAULT_SOCIAL_TITLE
}

export function getSocialDescription(doc: SocialDoc | undefined): string {
	return doc?.summary ?? DEFAULT_SOCIAL_DESCRIPTION
}

export function getSocialImageAlt(doc: SocialDoc | undefined): string {
	return doc ? `Devflare Docs preview for ${doc.navTitle}.` : SOCIAL_IMAGE_ALT
}

export function getSocialCardPath(doc: (SocialDoc & { slug: string }) | undefined): string {
	return doc ? `${SOCIAL_CARDS_PATH}/docs/${doc.slug}.png` : `${SOCIAL_CARDS_PATH}/home.png`
}

export function toAbsoluteUrl(origin: string, path: string): string {
	return new URL(path, origin).toString()
}
