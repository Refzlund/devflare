import type { Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'
import { handle as devflareHandle } from '../../../packages/devflare/src/sveltekit/index'
import { paraglideMiddleware } from '$lib/paraglide/server'
import { getTextDirection } from '$lib/paraglide/runtime'

const handleDocumentLocale: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('%paraglide.lang%', locale).replace('%paraglide.dir%', getTextDirection(locale))
		})
	})

export const handle: Handle = sequence(devflareHandle as Handle, handleDocumentLocale)
