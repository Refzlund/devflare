import { createLLMDocumentResponse } from '$lib/docs/llm-response'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () => {
	return createLLMDocumentResponse({
		contentType: 'text/markdown; charset=utf-8',
		variant: 'full'
	})
}