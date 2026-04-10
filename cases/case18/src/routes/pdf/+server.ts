import type { RequestHandler } from './$types'
import { PdfRequest, type PdfOptions, type PdfRequestData } from '$lib/models'

/**
 * POST /pdf - Generate a PDF from URL via PDF_RENDERER Durable Object
 *
 * Architecture:
 * - SvelteKit → PDF_RENDERER (DurableObjectNamespace) → PdfRenderer DO
 * - Works both locally (via multi-worker wrangler dev) and in production
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.PDF_RENDERER) {
		return new Response('PDF_RENDERER binding not available', { status: 503 })
	}

	try {
		const body = await request.json() as { url: string; options?: Partial<PdfOptions> }

		if (!body.url) {
			return Response.json({ error: 'URL is required' }, { status: 400 })
		}

		// Validate URL
		try {
			new URL(body.url)
		} catch {
			return Response.json({ error: 'Invalid URL' }, { status: 400 })
		}

		// Create PDF request
		const pdfRequest = new PdfRequest({
			url: body.url,
			options: body.options
		})

		// Get DO stub via namespace
		const doId = platform.env.PDF_RENDERER.idFromName('renderer')
		const stub = platform.env.PDF_RENDERER.get(doId)

		// Serialize for transmission to DO
		const encoded: PdfRequestData = {
			id: pdfRequest.id,
			url: pdfRequest.url,
			options: pdfRequest.options,
			createdAt: pdfRequest.createdAt
		}

		// Call the DO's fetch handler
		const doResponse = await stub.fetch('http://do/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(encoded)
		})

		// Reconstruct Response to ensure type compatibility
		const arrayBuffer = await doResponse.arrayBuffer()
		
		const headers = new Headers()

		// Copy relevant headers
		const contentType = doResponse.headers.get('Content-Type')
		if (contentType) headers.set('Content-Type', contentType)

		const requestId = doResponse.headers.get('X-Request-Id')
		if (requestId) headers.set('X-Request-Id', requestId)

		const cached = doResponse.headers.get('X-Cached')
		if (cached) headers.set('X-Cached', cached)

		const durationMs = doResponse.headers.get('X-Duration-Ms')
		if (durationMs) headers.set('X-Duration-Ms', durationMs)

		return new Response(arrayBuffer, {
			status: doResponse.status,
			headers
		})
	} catch (error) {
		console.error('PDF generation error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'PDF generation failed' },
			{ status: 500 }
		)
	}
}

/**
 * GET /pdf - Get renderer stats via PDF_RENDERER Durable Object
 */
export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.PDF_RENDERER) {
		return new Response('PDF_RENDERER binding not available', { status: 503 })
	}

	try {
		// Get DO stub via namespace
		const doId = platform.env.PDF_RENDERER.idFromName('renderer')
		const stub = platform.env.PDF_RENDERER.get(doId)

		// Call the DO's fetch handler
		const doResponse = await stub.fetch('http://do/stats')

		// Reconstruct Response
		const body = await doResponse.text()
		return new Response(body, {
			status: doResponse.status,
			headers: { 'Content-Type': 'application/json' }
		})
	} catch (error) {
		console.error('Stats error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Failed to get stats' },
			{ status: 500 }
		)
	}
}
