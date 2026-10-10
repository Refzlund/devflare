export const documentationLocales = ['en'] as const

export type DocumentationLocale = (typeof documentationLocales)[number]

export function localizeDocSlug(slug: string, _locale: string): string {
	return slug
}
