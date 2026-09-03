import { WorkerEntrypoint } from 'cloudflare:workers'

export class Case18Api extends WorkerEntrypoint {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)
		const env = this.env as { API_PREFIX?: string }

		if (request.method === 'POST' && url.pathname === '/auth/magic-link/request') {
			const body = await request.json() as { email?: string }
			return Response.json({
				ok: true,
				email: body.email,
				prefix: env.API_PREFIX
			}, {
				headers: {
					'x-case18-api': 'service-fetch'
				}
			})
		}

		if (url.pathname === '/bootstrap') {
			return Response.json({
				ok: true,
				prefix: env.API_PREFIX
			})
		}

		return new Response('not found', { status: 404 })
	}
}
