import type { RequestHandler } from './$types'

/**
 * GET /kv - List KV entries or get a specific key
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.CACHE) {
		return new Response('KV binding not available', { status: 503 })
	}

	const key = url.searchParams.get('key')

	if (key) {
		// Get specific key
		const value = await platform.env.CACHE.get(key)
		if (value === null) {
			return Response.json({ error: 'Key not found' }, { status: 404 })
		}

		// Try to parse as JSON
		try {
			const parsed = JSON.parse(value)
			return Response.json({ key, value: parsed, type: 'json' })
		} catch {
			return Response.json({ key, value, type: 'string' })
		}
	}

	// List all keys
	const list = await platform.env.CACHE.list({ limit: 100 })

	return Response.json({
		keys: list.keys.map((k) => ({
			name: k.name,
			expiration: k.expiration,
			metadata: k.metadata
		})),
		truncated: list.list_complete === false
	})
}

/**
 * POST /kv - Set a KV entry
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.CACHE) {
		return new Response('KV binding not available', { status: 503 })
	}

	try {
		const body = await request.json() as {
			key: string
			value: unknown
			expirationTtl?: number
			metadata?: Record<string, string>
		}

		if (!body.key) {
			return Response.json({ error: 'Key is required' }, { status: 400 })
		}

		const value = typeof body.value === 'string'
			? body.value
			: JSON.stringify(body.value)

		await platform.env.CACHE.put(body.key, value, {
			expirationTtl: body.expirationTtl,
			metadata: body.metadata
		})

		return Response.json({
			success: true,
			key: body.key,
			size: value.length
		})
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Failed to set key' },
			{ status: 500 }
		)
	}
}

/**
 * DELETE /kv - Delete a KV entry
 */
export const DELETE: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.CACHE) {
		return new Response('KV binding not available', { status: 503 })
	}

	const key = url.searchParams.get('key')
	if (!key) {
		return Response.json({ error: 'Key is required' }, { status: 400 })
	}

	await platform.env.CACHE.delete(key)
	return Response.json({ success: true, deleted: key })
}
