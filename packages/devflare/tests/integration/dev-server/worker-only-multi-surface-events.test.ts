import { afterAll, describe, expect, test } from 'bun:test'
import { type DevServer, createDevServer } from '../../../src/dev-server'
import {
	cleanupTempDirs,
	createProject,
	getAvailablePort,
	readWorkerText,
	waitForText
} from './worker-only-multi-surface.helpers'

const tempDirs: string[] = []
const DEV_SERVER_HOOK_TIMEOUT_MS = 20_000
const DEV_SERVER_TEST_TIMEOUT_MS = 15_000

afterAll(async () => {
	await cleanupTempDirs(tempDirs)
}, DEV_SERVER_HOOK_TIMEOUT_MS)

describe('worker-only dev server multi-surface handlers', () => {
	test(
		'supports event-first handlers and AsyncLocalStorage getters across fetch, queue, scheduled, email, and Durable Objects',
		async () => {
			const projectDir = await createProject(tempDirs, {
				prefix: 'devflare-worker-only-events-',
				config: `
export default {
	name: 'worker-only-event-surface-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		durableObjects: 'src/do/**/*.ts'
	},
	bindings: {
		kv: {
			RESULTS: 'results-kv-id'
		},
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
import type { FetchEvent } from 'devflare/runtime'
import { getFetchEvent } from 'devflare/runtime'

export async function fetch({ url, request, env }: FetchEvent<DevflareEnv>): Promise<Response> {
	const activeEvent = getFetchEvent()

	if (url.pathname === '/fetch') {
		return Response.json({
			requestUrl: activeEvent.request.url,
			eventUrl: activeEvent.url.href,
			sameUrl: activeEvent.url === url,
			safeInside: getFetchEvent.safe()?.url.href === request.url
		})
	}

	if (url.pathname === '/queue' && request.method === 'POST') {
		await env.TASK_QUEUE.send({ value: 'event-queued' })
		return new Response('queued', { status: 202 })
	}

	if (url.pathname === '/queue-result') {
		return new Response((await env.RESULTS.get('queue')) ?? 'pending')
	}

	if (url.pathname === '/scheduled-result') {
		return new Response((await env.RESULTS.get('scheduled')) ?? 'pending')
	}

	if (url.pathname === '/email-result') {
		return new Response((await env.RESULTS.get('email')) ?? 'pending')
	}

	if (url.pathname === '/do') {
		const id = env.LOGGER.idFromName('event-style')
		return env.LOGGER.get(id).fetch('http://do/inspect')
	}

	return new Response('not-found', { status: 404 })
}
`.trim(),
					'src/queue.ts': `
import type { QueueEvent } from 'devflare/runtime'
import { getQueueEvent } from 'devflare/runtime'

export async function queue(event: QueueEvent<{ value: string }, DevflareEnv>): Promise<void> {
	const activeEvent = getQueueEvent()
	await event.env.RESULTS.put('queue', event.messages[0].body.value + ':' + activeEvent.batch.queue)
	activeEvent.messages[0].ack()
}
`.trim(),
					'src/scheduled.ts': `
import type { ScheduledEvent } from 'devflare/runtime'
import { getScheduledEvent } from 'devflare/runtime'

export async function scheduled({ env, controller }: ScheduledEvent<DevflareEnv>): Promise<void> {
	await env.RESULTS.put('scheduled', getScheduledEvent().controller.cron || controller.cron || 'missing-cron')
}
`.trim(),
					'src/email.ts': `
import type { EmailEvent } from 'devflare/runtime'
import { getEmailEvent } from 'devflare/runtime'

export async function email({ env, message }: EmailEvent<DevflareEnv>): Promise<void> {
	await env.RESULTS.put('email', message.from + '->' + getEmailEvent().to)
}
`.trim(),
					'src/do/logger.ts': `
import { DurableObject } from 'cloudflare:workers'
import type { DurableObjectFetchEvent } from 'devflare/runtime'
import { getDurableObjectFetchEvent } from 'devflare/runtime'

export class Logger extends DurableObject {
	async fetch({ request }: DurableObjectFetchEvent<DevflareEnv>): Promise<Response> {
		const activeEvent = getDurableObjectFetchEvent()
		return new Response(activeEvent.request.url + '|' + request.url)
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

				const fetchResponse = await fetch(`${baseUrl}/fetch`)
				expect(fetchResponse.status).toBe(200)
				const fetchPayload = (await fetchResponse.json()) as {
					requestUrl: string
					eventUrl: string
					sameUrl: boolean
					safeInside: boolean
				}
				expect(fetchPayload).toEqual({
					requestUrl: `${baseUrl}/fetch`,
					eventUrl: `${baseUrl}/fetch`,
					sameUrl: true,
					safeInside: true
				})

				const queueResponse = await fetch(`${baseUrl}/queue`, { method: 'POST' })
				expect(queueResponse.status).toBe(202)
				expect(
					await waitForText(
						() => readWorkerText(`${baseUrl}/queue-result`),
						'event-queued:task-queue'
					)
				).toBe('event-queued:task-queue')

				const miniflare = devServer.getMiniflare() as {
					getWorker(workerName?: string): Promise<{
						scheduled(options?: { cron?: string; scheduledTime?: Date }): Promise<unknown>
					}>
				} | null
				if (!miniflare) {
					throw new Error('Miniflare was not available after starting the dev server')
				}

				const worker = await miniflare.getWorker('worker-only-event-surface-test')
				await worker.scheduled({
					cron: '0 * * * *',
					scheduledTime: new Date('2026-03-17T00:00:00.000Z')
				})

				expect(
					await waitForText(() => readWorkerText(`${baseUrl}/scheduled-result`), '0 * * * *')
				).toBe('0 * * * *')

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
							'Hello from the event test'
						].join('\r\n')
					}
				)
				expect(emailResponse.status).toBe(200)
				expect(
					await waitForText(
						() => readWorkerText(`${baseUrl}/email-result`),
						'sender@example.com->worker@example.com'
					)
				).toBe('sender@example.com->worker@example.com')

				const doResponse = await fetch(`${baseUrl}/do`)
				expect(doResponse.status).toBe(200)
				expect(await doResponse.text()).toBe('http://do/inspect|http://do/inspect')
			} finally {
				if (devServer) {
					await devServer.stop()
				}
			}
		},
		DEV_SERVER_TEST_TIMEOUT_MS
	)

	test(
		'supports request-wide handle middleware with resolve(event) around HTTP method exports',
		async () => {
			const projectDir = await createProject(tempDirs, {
				prefix: 'devflare-worker-only-handle-middleware-',
				config: `
export default {
	name: 'worker-only-handle-middleware-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim(),
				files: {
					'src/fetch.ts': `
import { createFetchEvent, sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'

function appendOrder(current: string | null, part: string): string {
	return current ? \`\${current}>\${part}\` : part
}

function withOrder(event: FetchEvent, part: string): FetchEvent {
	const headers = new Headers(event.request.headers)
	headers.set('x-order', appendOrder(headers.get('x-order'), part))

	return createFetchEvent(
		new Request(event.request, { headers }),
		event.env,
		event.ctx,
		{
			locals: event.locals,
			params: event.params
		}
	)
}

async function handle1(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	const response = await resolve(withOrder(event, 'handle1-before'))
	const next = new Response(response.body, response)
	next.headers.set('x-order', appendOrder(response.headers.get('x-order'), 'handle1-after'))
	return next
}

async function handle2(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	const response = await resolve(withOrder(event, 'handle2-before'))
	const next = new Response(response.body, response)
	next.headers.set('x-order', appendOrder(response.headers.get('x-order'), 'handle2-after'))
	return next
}

export const handle = sequence(handle1, handle2)

export async function GET(event: FetchEvent): Promise<Response> {
	const order = appendOrder(event.request.headers.get('x-order'), 'GET')
	return new Response(order, {
		headers: {
			'x-order': order
		}
	})
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

				const response = await fetch(baseUrl)
				expect(response.status).toBe(200)
				expect(await response.text()).toBe('handle1-before>handle2-before>GET')
				expect(response.headers.get('x-order')).toBe(
					'handle1-before>handle2-before>GET>handle2-after>handle1-after'
				)
			} finally {
				if (devServer) {
					await devServer.stop()
				}
			}
		},
		DEV_SERVER_TEST_TIMEOUT_MS
	)
})
