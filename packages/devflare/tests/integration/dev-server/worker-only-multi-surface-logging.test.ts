import { afterAll, describe, expect, test } from 'bun:test'
import { createDevServer, type DevServer } from '../../../src/dev-server'
import {
	cleanupTempDirs,
	createCapturedLogger,
	createProject,
	getAvailablePort,
	waitForLogEntry
} from './worker-only-multi-surface.helpers'

const tempDirs: string[] = []

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
})

describe('worker-only dev server multi-surface handlers', () => {
	test('logs from fetch, durable objects, queues, scheduled handlers and email handlers reach the dev logger', async () => {
		const projectDir = await createProject(tempDirs, {
			prefix: 'devflare-worker-only-logs-',
			config: `
export default {
	name: 'worker-only-log-surface-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		durableObjects: {
			LOGGER: 'Logger'
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

	if (url.pathname === '/fetch-log') {
		console.log('FETCH_LOG_FROM_HANDLER')
		return new Response('fetch-ok')
	}

	if (url.pathname === '/do-log') {
		const id = event.env.LOGGER.idFromName('logs')
		return event.env.LOGGER.get(id).fetch('http://do/log')
	}

	if (url.pathname === '/queue-log' && event.request.method === 'POST') {
		await event.env.TASK_QUEUE.send({ surface: 'queue' })
		return new Response('queued', { status: 202 })
	}

	return new Response('not-found', { status: 404 })
}
`.trim(),
				'src/queue.ts': `
export default async function queue(batch) {
	console.log('QUEUE_LOG_FROM_HANDLER', batch.messages.length)
	for (const message of batch.messages) {
		message.ack()
	}
}
`.trim(),
				'src/scheduled.ts': `
export default async function scheduled(controller) {
	console.log('SCHEDULED_LOG_FROM_HANDLER', controller.cron || 'missing-cron')
}
`.trim(),
				'src/email.ts': `
export async function email(message) {
	console.log('EMAIL_LOG_FROM_HANDLER', message.from, message.to)
}
`.trim(),
				'src/do/logger.ts': `
import { DurableObject } from 'cloudflare:workers'

export class Logger extends DurableObject {
	async fetch() {
		console.log('DO_LOG_FROM_HANDLER')
		return new Response('do-ok')
	}
}
`.trim()
			}
		})

		const port = await getAvailablePort()
		const baseUrl = `http://127.0.0.1:${port}`
		const logger = createCapturedLogger()
		let devServer: DevServer | null = null

		try {
			devServer = createDevServer({
				cwd: projectDir,
				miniflarePort: port,
				enableVite: false,
				persist: false,
				logger: logger as unknown as import('consola').ConsolaInstance
			})

			await devServer.start()

			const fetchResponse = await fetch(`${baseUrl}/fetch-log`)
			expect(fetchResponse.status).toBe(200)
			expect(await fetchResponse.text()).toBe('fetch-ok')

			const doResponse = await fetch(`${baseUrl}/do-log`)
			expect(doResponse.status).toBe(200)
			expect(await doResponse.text()).toBe('do-ok')

			const queueResponse = await fetch(`${baseUrl}/queue-log`, { method: 'POST' })
			expect(queueResponse.status).toBe(202)

			const miniflare = devServer.getMiniflare() as {
				getWorker(workerName?: string): Promise<{
					scheduled(options?: { cron?: string; scheduledTime?: Date }): Promise<unknown>
				}>
			} | null
			if (!miniflare) {
				throw new Error('Miniflare was not available after starting the dev server')
			}

			const worker = await miniflare.getWorker('worker-only-log-surface-test')
			await worker.scheduled({
				cron: '0 * * * *',
				scheduledTime: new Date('2026-03-17T00:00:00.000Z')
			})

			const emailResponse = await fetch(`${baseUrl}/cdn-cgi/handler/email?from=sender@example.com&to=worker@example.com`, {
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
			})
			expect(emailResponse.status).toBe(200)

			expect((await waitForLogEntry(logger, 'FETCH_LOG_FROM_HANDLER')).level).toBe('log')
			expect((await waitForLogEntry(logger, 'DO_LOG_FROM_HANDLER')).level).toBe('log')
			expect((await waitForLogEntry(logger, 'QUEUE_LOG_FROM_HANDLER')).level).toBe('log')
			expect((await waitForLogEntry(logger, 'SCHEDULED_LOG_FROM_HANDLER')).level).toBe('log')
			expect((await waitForLogEntry(logger, 'EMAIL_LOG_FROM_HANDLER')).level).toBe('log')
		} finally {
			if (devServer) {
				await devServer.stop()
			}
		}
	})
})
