import { docs } from '../../../../../apps/documentation/src/lib/docs/content'
import type { DocCodeSnippet } from '../../../../../apps/documentation/src/lib/docs/types'

interface SnippetFile {
	path?: string
	code: string
}

function snippetFiles(snippet: DocCodeSnippet): SnippetFile[] {
	return (
		snippet.files ??
		(snippet.code
			? [
					{
						path: snippet.filename,
						code: snippet.code
					}
				]
			: [])
	)
}

export function snippetsWithInvalidCustomDomainRoutes(): string[] {
	const objectLiteralPattern = /\{[^{}]*custom_domain:\s*true[^{}]*\}/g
	const routePattern = /pattern:\s*['"]([^'"]+)['"]/

	return docs.flatMap((doc) => {
		return doc.sections.flatMap((section) => {
			return (section.snippets ?? []).flatMap((snippet) => {
				return snippetFiles(snippet).flatMap((file) => {
					const failures: string[] = []
					for (const objectMatch of file.code.matchAll(objectLiteralPattern)) {
						const pattern = objectMatch[0].match(routePattern)?.[1]
						if (pattern && /[/*]/.test(pattern)) {
							failures.push(
								`${doc.slug}/${section.id}/${snippet.title}/${file.path ?? snippet.filename ?? 'inline'}: ${pattern}`
							)
						}
					}
					return failures
				})
			})
		})
	})
}
