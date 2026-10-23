import type { RequestHandler } from './$types'

/**
 * GET /images - List all images
 */
export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.IMAGES) {
		return new Response('R2 binding not available', { status: 503 })
	}

	try {
		const list = await platform.env.IMAGES.list({ limit: 100 })

		const images = list.objects.map((obj) => ({
			key: obj.key,
			size: obj.size,
			// Handle both Date objects and ISO strings (from RPC serialization)
			uploaded: typeof obj.uploaded === 'string' ? obj.uploaded : obj.uploaded?.toISOString(),
			etag: obj.etag
		}))

		return Response.json({ images, truncated: list.truncated })
	} catch (error) {
		console.error('List error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Failed to list images' },
			{ status: 500 }
		)
	}
}
