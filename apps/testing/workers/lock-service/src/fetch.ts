export { CrossWorkerLock } from './do.cross-worker-lock'

export default {
	async fetch(): Promise<Response> {
		return Response.json({
			ok: true,
			worker: 'devflare-testing-shared-worker'
		})
	}
}
