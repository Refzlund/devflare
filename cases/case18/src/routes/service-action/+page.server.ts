import type { Actions, PageServerLoad } from './$types'

interface Case18ApiService {
	fetch(request: Request): Promise<Response>
}

function readString(value: unknown): string {
	return String(value)
}

export const load: PageServerLoad = async ({ platform }) => {
	return {
		configuredVar: readString(platform?.env?.CASE18_STRING_VAR),
		missingVar: readString(platform?.env?.CASE18_MISSING_VAR)
	}
}

export const actions: Actions = {
	default: async ({ request, platform, cookies }) => {
		const formData = await request.formData()
		const email = String(formData.get('email') ?? '')
		const api = platform?.env?.CASE18_API as Case18ApiService | undefined

		if (!api) {
			return {
				ok: false,
				error: 'missing service binding'
			}
		}

		const response = await api.fetch(new Request(
			'https://case18-service-api.local/auth/magic-link/request',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email })
			}
		))
		const payload = await response.json() as {
			ok: boolean
			email?: string
			prefix?: string
		}

		cookies.set('case18-service-action', payload.email ?? 'missing', {
			path: '/',
			sameSite: 'lax'
		})

		return {
			ok: true,
			status: response.status,
			serviceHeader: response.headers.get('x-case18-api'),
			email: payload.email,
			prefix: payload.prefix,
			configuredVar: readString(platform?.env?.CASE18_STRING_VAR),
			missingVar: readString(platform?.env?.CASE18_MISSING_VAR)
		}
	}
}
