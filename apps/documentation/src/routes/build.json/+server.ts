import { env } from 'cloudflare:workers'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// SvelteKit 3's Cloudflare adapter serves the bindings from `cloudflare:workers`, not `platform`.
export const GET: RequestHandler = () => {
	return json(
		{
			buildSha: env.BUILD_SHA ?? 'unknown',
			buildTime: env.BUILD_TIME ?? 'unknown'
		},
		{
			headers: {
				'cache-control': 'no-store'
			}
		}
	)
}
