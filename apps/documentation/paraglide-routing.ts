import { docs } from './src/lib/docs/content'

interface UrlPattern {
	pattern: string
	localized: Array<[string, string]>
}

function createLocalizedPaths(canonicalPath: string): Array<[string, string]> {
	return [['en', canonicalPath]]
}

const documentationDocUrlPatterns: UrlPattern[] = docs.map((doc) => {
	const canonicalPath = `/docs/${doc.slug}`

	return {
		pattern: canonicalPath,
		localized: createLocalizedPaths(canonicalPath)
	}
})

export const documentationUrlPatterns: UrlPattern[] = [
	{
		pattern: '/',
		localized: createLocalizedPaths('/')
	},
	{
		pattern: '/docs',
		localized: createLocalizedPaths('/docs')
	},
	...documentationDocUrlPatterns,
	{
		pattern: '/:path(.*)?',
		localized: createLocalizedPaths('/:path(.*)?')
	}
]
