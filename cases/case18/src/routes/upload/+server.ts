import type { RequestHandler } from './$types'

/**
 * POST /upload - Upload image to R2
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.IMAGES) {
		return new Response('R2 binding not available', { status: 503 })
	}

	try {
		const formData = await request.formData()
		const file = formData.get('file') as File | null

		if (!file) {
			return Response.json({ error: 'No file provided' }, { status: 400 })
		}

		// Validate file type
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
		if (!allowedTypes.includes(file.type)) {
			return Response.json(
				{ error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' },
				{ status: 400 }
			)
		}

		// Generate unique filename
		const ext = file.name.split('.').pop() || 'bin'
		const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`

		// Upload to R2
		const arrayBuffer = await file.arrayBuffer()
		await platform.env.IMAGES.put(filename, arrayBuffer, {
			httpMetadata: {
				contentType: file.type
			},
			customMetadata: {
				originalName: file.name,
				uploadedAt: new Date().toISOString(),
				size: String(file.size)
			}
		})

		return Response.json({
			success: true,
			filename,
			originalName: file.name,
			size: file.size,
			type: file.type,
			url: `/images/${filename}`
		})
	} catch (error) {
		console.error('Upload error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Upload failed' },
			{ status: 500 }
		)
	}
}

/**
 * GET /upload - Get upload stats
 */
export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.IMAGES) {
		return new Response('R2 binding not available', { status: 503 })
	}

	try {
		const list = await platform.env.IMAGES.list({ limit: 1000 })

		const stats = {
			totalFiles: list.objects.length,
			totalSize: list.objects.reduce((sum, obj) => sum + obj.size, 0),
			truncated: list.truncated
		}

		return Response.json(stats)
	} catch (error) {
		console.error('Stats error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Failed to get stats' },
			{ status: 500 }
		)
	}
}
