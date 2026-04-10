import type { RequestHandler } from './$types'

/**
 * GET /images/[key] - Get a specific image from R2
 */
export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.IMAGES) {
		return new Response('R2 binding not available', { status: 503 })
	}

	try {
		const object = await platform.env.IMAGES.get(params.key)

		if (!object) {
			return new Response('Image not found', { status: 404 })
		}

		// Build headers manually to avoid miniflare serialization issues
		const headers = new Headers()
		
		// Get content type from http metadata if available
		const contentType = object.httpMetadata?.contentType || 'application/octet-stream'
		headers.set('Content-Type', contentType)
		headers.set('ETag', object.etag)
		headers.set('Cache-Control', 'public, max-age=31536000')

		// Convert R2ObjectBody to ArrayBuffer for Response compatibility
		const arrayBuffer = await object.arrayBuffer()
		return new Response(arrayBuffer, { headers })
	} catch (error) {
		console.error('Get image error:', error)
		return new Response('Failed to get image', { status: 500 })
	}
}

/**
 * DELETE /images/[key] - Delete an image from R2
 */
export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.IMAGES) {
		return new Response('R2 binding not available', { status: 503 })
	}

	try {
		await platform.env.IMAGES.delete(params.key)
		return Response.json({ success: true, deleted: params.key })
	} catch (error) {
		console.error('Delete error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Failed to delete' },
			{ status: 500 }
		)
	}
}
