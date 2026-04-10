import type { RequestHandler } from './$types'

interface Todo {
	id: number
	title: string
	completed: boolean
	created_at: string
}

/**
 * GET /db - List todos
 * 
 * Note: Table is created via migration (migrations/0001_create_todos.sql)
 * Run: wrangler d1 migrations apply DB --local
 */
export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.DB) {
		return new Response('D1 binding not available', { status: 503 })
	}

	try {
		const result = await platform.env.DB.prepare(
			'SELECT * FROM todos ORDER BY created_at DESC'
		).all<Todo>()

		return Response.json({ todos: result.results })
	} catch (error) {
		console.error('DB error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Database error' },
			{ status: 500 }
		)
	}
}

/**
 * POST /db - Create a todo
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		return new Response('D1 binding not available', { status: 503 })
	}

	try {
		const body = await request.json() as { title: string }

		if (!body.title?.trim()) {
			return Response.json({ error: 'Title is required' }, { status: 400 })
		}

		const result = await platform.env.DB.prepare(
			'INSERT INTO todos (title) VALUES (?) RETURNING *'
		)
			.bind(body.title.trim())
			.first<Todo>()

		return Response.json({ todo: result, success: true })
	} catch (error) {
		console.error('DB insert error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Insert failed' },
			{ status: 500 }
		)
	}
}

/**
 * PATCH /db - Update a todo
 */
export const PATCH: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		return new Response('D1 binding not available', { status: 503 })
	}

	try {
		const body = await request.json() as {
			id: number
			title?: string
			completed?: boolean
		}

		if (!body.id) {
			return Response.json({ error: 'ID is required' }, { status: 400 })
		}

		const updates: string[] = []
		const values: unknown[] = []

		if (body.title !== undefined) {
			updates.push('title = ?')
			values.push(body.title)
		}

		if (body.completed !== undefined) {
			updates.push('completed = ?')
			values.push(body.completed ? 1 : 0)
		}

		if (updates.length === 0) {
			return Response.json({ error: 'No updates provided' }, { status: 400 })
		}

		values.push(body.id)

		const result = await platform.env.DB.prepare(
			`UPDATE todos SET ${updates.join(', ')} WHERE id = ? RETURNING *`
		)
			.bind(...values)
			.first<Todo>()

		if (!result) {
			return Response.json({ error: 'Todo not found' }, { status: 404 })
		}

		return Response.json({ todo: result, success: true })
	} catch (error) {
		console.error('DB update error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Update failed' },
			{ status: 500 }
		)
	}
}

/**
 * DELETE /db - Delete a todo
 */
export const DELETE: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.DB) {
		return new Response('D1 binding not available', { status: 503 })
	}

	try {
		const id = url.searchParams.get('id')

		if (!id) {
			return Response.json({ error: 'ID is required' }, { status: 400 })
		}

		await platform.env.DB.prepare('DELETE FROM todos WHERE id = ?')
			.bind(parseInt(id))
			.run()

		return Response.json({ success: true, deleted: parseInt(id) })
	} catch (error) {
		console.error('DB delete error:', error)
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Delete failed' },
			{ status: 500 }
		)
	}
}
