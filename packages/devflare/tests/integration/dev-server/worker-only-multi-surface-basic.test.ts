import { afterAll, describe, expect, test } from 'bun:test'
import { createDevServer, type DevServer } from '../../../src/dev-server'
import {
	cleanupTempDirs,
	createProject,
	getAvailablePort,
	readWorkerText,
	waitForText
} from './worker-only-multi-surface.helpers'

const tempDirs: string[] = []
const DEV_SERVER_HOOK_TIMEOUT_MS = 20_000
const DEV_SERVER_TEST_TIMEOUT_MS = 20_000

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, DEV_SERVER_HOOK_TIMEOUT_MS)

describe('worker-only dev server multi-surface handlers', () => {
	test(
		'dispatches queue consumers configured via src/queue.ts',
		async () => {
			const projectDir = await createProject(tempDirs, {
				prefix: 'devflare-worker-only-queue-',
				config: `
export default {
	name: 'worker-only-queue-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts'
	},
	bindings: {
		kv: {
			RESULTS: 'results-kv-id'
		},
		queues: {
			producers: {
				TASK_QUEUE: 'task-queue'
			},
			consumers: [
				{
					queue: 'task-queue'
				}
			]
		}
	}
}
`.trim(),
				files: {
					'src/fetch.ts': `
export default async function fetch(event) {
	const url = event.url

	if (url.pathname === '/enqueue' && event.request.method === 'POST') {
		await event.env.TASK_QUEUE.send({ value: 'queued' })
		return new Response('queued', { status: 202 })
	}

	if (url.pathname === '/result') {
		return new Response((await event.env.RESULTS.get('queue-result')) ?? 'pending')
	}

	return new Response('not-found', { status: 404 })
}
`.trim(),
					'src/queue.ts': `
export default async function queue(event, env, _ctx) {
	for (const message of event.messages) {
		await env.RESULTS.put('queue-result', String(message.body.value))
		message.ack()
	}
}
`.trim()
				}
			})

			const port = await getAvailablePort()
			const baseUrl = `http://127.0.0.1:${port}`
			let devServer: DevServer | null = null

			try {
				devServer = createDevServer({
					cwd: projectDir,
					miniflarePort: port,
					enableVite: false,
					persist: false
				})

				await devServer.start()

				const enqueueResponse = await fetch(`${baseUrl}/enqueue`, { method: 'POST' })
				expect(enqueueResponse.status).toBe(202)

				expect(await waitForText(() => readWorkerText(`${baseUrl}/result`), 'queued')).toBe(
					'queued'
				)
			} finally {
				if (devServer) {
					await devServer.stop()
				}
			}
		},
		DEV_SERVER_TEST_TIMEOUT_MS
	)

	test(
		'dispatches scheduled handlers configured via src/scheduled.ts',
		async () => {
			const projectDir = await createProject(tempDirs, {
				prefix: 'devflare-worker-only-scheduled-',
				config: `
export default {
	name: 'worker-only-scheduled-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		scheduled: 'src/scheduled.ts'
	},
	bindings: {
		kv: {
			RESULTS: 'results-kv-id'
		}
	},
	triggers: {
		crons: ['0 * * * *']
	}
}
`.trim(),
				files: {
					'src/fetch.ts': `
export default async function fetch(event) {
	const url = event.url

	if (url.pathname === '/result') {
		return new Response((await event.env.RESULTS.get('scheduled-result')) ?? 'pending')
	}

	return new Response('not-found', { status: 404 })
}
`.trim(),
					'src/scheduled.ts': `
export default async function scheduled(event, env, _ctx) {
	await env.RESULTS.put('scheduled-result', event.cron || 'missing-cron')
}
`.trim()
				}
			})

			const port = await getAvailablePort()
			const baseUrl = `http://127.0.0.1:${port}`
			let devServer: DevServer | null = null

			try {
				devServer = createDevServer({
					cwd: projectDir,
					miniflarePort: port,
					enableVite: false,
					persist: false
				})

				await devServer.start()

				const miniflare = devServer.getMiniflare() as {
					getWorker(workerName?: string): Promise<{
						scheduled(options?: { cron?: string; scheduledTime?: Date }): Promise<unknown>
					}>
				} | null
				if (!miniflare) {
					throw new Error('Miniflare was not available after starting the dev server')
				}

				const worker = await miniflare.getWorker('worker-only-scheduled-test')
				await worker.scheduled({
					cron: '0 * * * *',
					scheduledTime: new Date('2026-03-17T00:00:00.000Z')
				})

				expect(await waitForText(() => readWorkerText(`${baseUrl}/result`), '0 * * * *')).toBe(
					'0 * * * *'
				)
			} finally {
				if (devServer) {
					await devServer.stop()
				}
			}
		},
		DEV_SERVER_TEST_TIMEOUT_MS
	)

	test(
		'dispatches incoming email handlers configured via src/email.ts',
		async () => {
			const projectDir = await createProject(tempDirs, {
				prefix: 'devflare-worker-only-email-',
				config: `
export default {
	name: 'worker-only-email-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		email: 'src/email.ts'
	},
	bindings: {
		kv: {
			EMAIL_LOG: 'email-log-kv-id'
		}
	}
}
`.trim(),
				files: {
					'src/fetch.ts': `
export default async function fetch(event) {
	const url = event.url

	if (url.pathname === '/result') {
		return new Response((await event.env.EMAIL_LOG.get('email-result')) ?? 'pending')
	}

	return new Response('not-found', { status: 404 })
}
`.trim(),
					'src/email.ts': `
export async function email(event, env) {
	await env.EMAIL_LOG.put('email-result', event.from + '->' + event.to)
}
`.trim()
				}
			})

			const port = await getAvailablePort()
			const baseUrl = `http://127.0.0.1:${port}`
			let devServer: DevServer | null = null

			try {
				devServer = createDevServer({
					cwd: projectDir,
					miniflarePort: port,
					enableVite: false,
					persist: false
				})

				await devServer.start()

				const emailResponse = await fetch(
					`${baseUrl}/cdn-cgi/handler/email?from=sender@example.com&to=worker@example.com`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'text/plain'
						},
						body: [
							'From: sender@example.com',
							'To: worker@example.com',
							'Subject: Test email',
							'',
							'Hello from the regression test'
						].join('\r\n')
					}
				)
				expect(emailResponse.status).toBe(200)

				expect(
					await waitForText(
						() => readWorkerText(`${baseUrl}/result`),
						'sender@example.com->worker@example.com'
					)
				).toBe('sender@example.com->worker@example.com')
			} finally {
				if (devServer) {
					await devServer.stop()
				}
			}
		},
		DEV_SERVER_TEST_TIMEOUT_MS
	)
})
