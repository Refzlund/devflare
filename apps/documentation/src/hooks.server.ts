import type { Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'
import { paraglideMiddleware } from '$lib/paraglide/server'
import { getTextDirection } from '$lib/paraglide/runtime'

let devflareHandlePromise: Promise<Handle> | null = null

const handleDevflarePlatform: Handle = async ({ event, resolve }) => {
	if (import.meta.env.DEV && process.env.DEVFLARE_DEV === 'true') {
		devflareHandlePromise ??= import('../../../packages/devflare/src/sveltekit/index')
			.then((module) => module.handle as Handle)

		const devflareHandle = await devflareHandlePromise
		return devflareHandle({ event, resolve })
	}

	return resolve(event)
}

const handleDocumentLocale: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('%paraglide.lang%', locale).replace('%paraglide.dir%', getTextDirection(locale))
		})
	})

export const handle: Handle = sequence(handleDevflarePlatform, handleDocumentLocale)
