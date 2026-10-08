import { env } from 'cloudflare:workers'
import type { Actions, PageServerLoad } from './$types'

function readString(value: unknown): string {
	return String(value)
}

/** A var the config declares, and one it does not, read the same way. */
function readVars() {
	const vars = env as unknown as Record<string, unknown>
	return {
		configuredVar: readString(vars.CASE20_STRING_VAR),
		missingVar: readString(vars.CASE20_MISSING_VAR)
	}
}

export const load: PageServerLoad = async () => readVars()

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData()
		const email = String(formData.get('email') ?? '')

		const response = await env.CASE20_API.fetch(
			'https://case20-service-api.local/auth/magic-link/request',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email })
			}
		)
		const payload = (await response.json()) as {
			ok: boolean
			email?: string
			prefix?: string
		}

		cookies.set('case20-service-action', payload.email ?? 'missing', {
			path: '/',
			sameSite: 'lax'
		})

		return {
			ok: true,
			status: response.status,
			serviceHeader: response.headers.get('x-case20-api'),
			email: payload.email,
			prefix: payload.prefix,
			...readVars()
		}
	}
}
