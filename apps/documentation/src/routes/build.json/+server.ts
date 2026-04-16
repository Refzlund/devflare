import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = ({ platform }) => {
	return json({
		buildSha: platform?.env.BUILD_SHA ?? 'unknown',
		buildTime: platform?.env.BUILD_TIME ?? 'unknown'
	}, {
		headers: {
			'cache-control': 'no-store'
		}
	})
}