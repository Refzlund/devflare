import { buildLLMDocument, buildStrictLLMDocument } from './llm'

export type LLMDocumentVariant = 'full' | 'strict'

const llmDocumentBuilders = {
	full: buildLLMDocument,
	strict: buildStrictLLMDocument
} as const satisfies Record<LLMDocumentVariant, () => string>

export function createLLMDocumentResponse(options: {
	contentType: string
	variant?: LLMDocumentVariant
}): Response {
	const variant = options.variant ?? 'full'
	const document = `${llmDocumentBuilders[variant]().trimEnd()}\n`

	return new Response(document, {
		headers: {
			'content-type': options.contentType
		}
	})
}