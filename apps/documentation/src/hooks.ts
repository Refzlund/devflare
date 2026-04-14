import type { Reroute, Transport } from '@sveltejs/kit'
import { deLocalizeUrl } from '$lib/paraglide/runtime'

const routeAliases = {
	'/llm.md': '/LLM.md',
	'/llm.txt': '/LLM.txt',
	'/docs/workflow-modes': '/docs/vite-standalone',
	'/de/docs/workflow-modi': '/de/docs/vite-standalone',
	'/dk/docs/workflow-tilstande': '/dk/docs/vite-standalone'
} as const satisfies Record<string, string>

function resolveRouteAlias(pathname: string): string | undefined {
	return routeAliases[pathname as keyof typeof routeAliases]
}

export const reroute: Reroute = (request) => {
	const pathname = deLocalizeUrl(request.url).pathname

	return resolveRouteAlias(pathname) ?? pathname
}

export const transport: Transport = {}
