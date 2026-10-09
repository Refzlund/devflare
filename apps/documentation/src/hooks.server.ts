import { type Handle, sequence } from '@sveltejs/kit/hooks'
import { getTextDirection } from '#lib/paraglide/runtime.js'
import { paraglideMiddleware } from '#lib/paraglide/server.js'

let devflareHandlePromise: Promise<Handle> | null = null

const handleDevflarePlatform: Handle = async ({ event, resolve }) => {
	if (import.meta.env.DEV && process.env.DEVFLARE_DEV === 'true') {
		devflareHandlePromise ??= import('../../../packages/devflare/src/sveltekit/index').then(
			(module) => module.handle as Handle
		)

		const devflareHandle = await devflareHandlePromise
		return devflareHandle({ event, resolve })
	}

	return resolve(event)
}

const handleDocumentLocale: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		// SvelteKit 3 types `event.request` as readonly; the event is still a plain object, and
		// the routes after this hook keep reading the localized request, as they did on Kit 2.
		Object.assign(event, { request: localizedRequest })

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		})
	})

export const handle: Handle = sequence(handleDevflarePlatform, handleDocumentLocale)
