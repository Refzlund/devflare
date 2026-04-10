import { afterAll, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { createDevServer, type DevServer } from '../../../src/dev-server'

const tempDirs: string[] = []
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
let buildPromise: Promise<void> | null = null

async function ensurePackageBuilt(): Promise<void> {
	if (!buildPromise) {
		buildPromise = (async () => {
			const build = Bun.spawn(['bun', 'run', 'build'], {
				cwd: packageRoot,
				stdout: 'pipe',
				stderr: 'pipe'
			})

			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(build.stdout).text(),
				new Response(build.stderr).text(),
				build.exited
			])

			if (exitCode !== 0) {
				throw new Error([
					'Package build failed',
					stdout.trim(),
					stderr.trim()
				].filter(Boolean).join('\n\n'))
			}
		})()
	}

	await buildPromise
}

async function installBuiltDevflare(projectDir: string): Promise<void> {
	await ensurePackageBuilt()

	const packagedDevflareDir = join(projectDir, 'node_modules', 'devflare')
	await mkdir(packagedDevflareDir, { recursive: true })
	await cp(join(packageRoot, 'package.json'), join(packagedDevflareDir, 'package.json'))
	await cp(join(packageRoot, 'dist'), join(packagedDevflareDir, 'dist'), { recursive: true })
}

async function getAvailablePort(): Promise<number> {
	return await new Promise((resolvePromise, rejectPromise) => {
		const server = createServer()

		server.on('error', rejectPromise)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (!address || typeof address === 'string') {
				server.close(() => rejectPromise(new Error('Could not determine an available port')))
				return
			}

			const { port } = address
			server.close((error) => {
				if (error) {
					rejectPromise(error)
					return
				}

				resolvePromise(port)
			})
		})
	})
}

async function waitForText(
	getText: () => Promise<string>,
	expectedText: string,
	timeoutMs = 8000
): Promise<string> {
	const deadline = Date.now() + timeoutMs
	let lastText = ''
	let lastError: unknown = null

	while (Date.now() < deadline) {
		try {
			const text = await getText()
			lastText = text
			if (text === expectedText) {
				return text
			}
			lastError = new Error(`Expected "${expectedText}", received "${text}"`)
		} catch (error) {
			lastError = error
		}

		await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
	}

	if (lastError instanceof Error) {
		throw lastError
	}

	throw new Error(`Timed out waiting for "${expectedText}". Last value: "${lastText}"`)
}

async function createProject(options: {
	prefix: string
	config: string
	files: Record<string, string>
}): Promise<string> {
	const projectDir = await mkdtemp(join(tmpdir(), options.prefix))
	tempDirs.push(projectDir)

	await installBuiltDevflare(projectDir)

	await writeFile(join(projectDir, 'package.json'), JSON.stringify({
		name: options.prefix,
		private: true,
		type: 'module'
	}, null, 2))

	await writeFile(join(projectDir, 'tsconfig.json'), JSON.stringify({
		compilerOptions: {
			target: 'ESNext',
			module: 'ESNext',
			moduleResolution: 'Bundler'
		}
	}, null, 2))

	await writeFile(join(projectDir, 'devflare.config.ts'), options.config)

	for (const [relativePath, content] of Object.entries(options.files)) {
		const absolutePath = join(projectDir, relativePath)
		await mkdir(dirname(absolutePath), { recursive: true })
		await writeFile(absolutePath, content)
	}

	return projectDir
}

async function readWorkerText(url: string): Promise<string> {
	const response = await fetch(url)
	return await response.text()
}

interface CapturedLogEntry {
	level: string
	message: string
}

interface CapturedLogger {
	messages: CapturedLogEntry[]
	log: (...args: unknown[]) => void
	info: (...args: unknown[]) => void
	warn: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
	success: (...args: unknown[]) => void
	debug: (...args: unknown[]) => void
}

function formatLogValue(value: unknown): string {
	if (typeof value === 'string') {
		return value
	}

	if (value instanceof Error) {
		return value.stack ?? value.message
	}

	try {
		return JSON.stringify(value) ?? String(value)
	} catch {
		return String(value)
	}
}

function createCapturedLogger(): CapturedLogger {
	const messages: CapturedLogEntry[] = []
	const capture = (level: string) => (...args: unknown[]) => {
		messages.push({
			level,
			message: args.map((arg) => formatLogValue(arg)).join(' ')
		})
	}

	return {
		messages,
		log: capture('log'),
		info: capture('info'),
		warn: capture('warn'),
		error: capture('error'),
		success: capture('success'),
		debug: capture('debug')
	}
}

async function waitForLogEntry(
	logger: CapturedLogger,
	expectedText: string,
	timeoutMs = 8000
): Promise<CapturedLogEntry> {
	const deadline = Date.now() + timeoutMs
	let lastSeen = ''

	while (Date.now() < deadline) {
		const matchedEntry = logger.messages.find((entry) => entry.message.includes(expectedText))
		if (matchedEntry) {
			return matchedEntry
		}

		lastSeen = logger.messages.map((entry) => `${entry.level}: ${entry.message}`).join('\n')
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
	}

	throw new Error(`Timed out waiting for log containing "${expectedText}". Captured logs:\n${lastSeen}`)
}

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

describe('worker-only dev server multi-surface handlers', () => {
	test('dispatches queue consumers configured via src/queue.ts', async () => {
		const projectDir = await createProject({
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
export default {
	async fetch(request, env) {
		const url = new URL(request.url)

		if (url.pathname === '/enqueue' && request.method === 'POST') {
			await env.TASK_QUEUE.send({ value: 'queued' })
			return new Response('queued', { status: 202 })
		}

		if (url.pathname === '/result') {
			return new Response((await env.RESULTS.get('queue-result')) ?? 'pending')
		}

		return new Response('not-found', { status: 404 })
	}
}
`.trim(),
				'src/queue.ts': `
export default async function queue(batch, env) {
	for (const message of batch.messages) {
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

			expect(await waitForText(
				() => readWorkerText(`${baseUrl}/result`),
				'queued'
			)).toBe('queued')
		} finally {
			if (devServer) {
				await devServer.stop()
			}
		}
	})

	test('dispatches scheduled handlers configured via src/scheduled.ts', async () => {
		const projectDir = await createProject({
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
export default {
	async fetch(request, env) {
		const url = new URL(request.url)

		if (url.pathname === '/result') {
			return new Response((await env.RESULTS.get('scheduled-result')) ?? 'pending')
		}

		return new Response('not-found', { status: 404 })
	}
}
`.trim(),
				'src/scheduled.ts': `
export default async function scheduled(controller, env) {
	await env.RESULTS.put('scheduled-result', controller.cron || 'missing-cron')
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

			expect(await waitForText(
				() => readWorkerText(`${baseUrl}/result`),
				'0 * * * *'
			)).toBe('0 * * * *')
		} finally {
			if (devServer) {
				await devServer.stop()
			}
		}
	})

	test('dispatches incoming email handlers configured via src/email.ts', async () => {
		const projectDir = await createProject({
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
export default {
	async fetch(request, env) {
		const url = new URL(request.url)

		if (url.pathname === '/result') {
			return new Response((await env.EMAIL_LOG.get('email-result')) ?? 'pending')
		}

		return new Response('not-found', { status: 404 })
	}
}
`.trim(),
				'src/email.ts': `
export async function email(message, env) {
	await env.EMAIL_LOG.put('email-result', message.from + '->' + message.to)
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

			expect(await waitForText(
				() => readWorkerText(`${baseUrl}/result`),
				'sender@example.com->worker@example.com'
			)).toBe('sender@example.com->worker@example.com')
		} finally {
			if (devServer) {
				await devServer.stop()
			}
		}
	})

	test('supports event-first handlers and AsyncLocalStorage getters across fetch, queue, scheduled, email, and Durable Objects', async () => {
		const projectDir = await createProject({
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

export async function fetch({ request, env }: FetchEvent<DevflareEnv>): Promise<Response> {
	const activeEvent = getFetchEvent()
	const url = new URL(request.url)

	if (url.pathname === '/fetch') {
		return Response.json({
			requestUrl: activeEvent.request.url,
			sameUrl: activeEvent.url === request.url,
			safeInside: getFetchEvent.safe()?.request.url === request.url
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
			const fetchPayload = await fetchResponse.json() as {
				requestUrl: string
				sameUrl: boolean
				safeInside: boolean
			}
			expect(fetchPayload).toEqual({
				requestUrl: `${baseUrl}/fetch`,
				sameUrl: true,
				safeInside: true
			})

			const queueResponse = await fetch(`${baseUrl}/queue`, { method: 'POST' })
			expect(queueResponse.status).toBe(202)
			expect(await waitForText(
				() => readWorkerText(`${baseUrl}/queue-result`),
				'event-queued:task-queue'
			)).toBe('event-queued:task-queue')

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

			expect(await waitForText(
				() => readWorkerText(`${baseUrl}/scheduled-result`),
				'0 * * * *'
			)).toBe('0 * * * *')

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
					'Hello from the event test'
				].join('\r\n')
			})
			expect(emailResponse.status).toBe(200)
			expect(await waitForText(
				() => readWorkerText(`${baseUrl}/email-result`),
				'sender@example.com->worker@example.com'
			)).toBe('sender@example.com->worker@example.com')

			const doResponse = await fetch(`${baseUrl}/do`)
			expect(doResponse.status).toBe(200)
			expect(await doResponse.text()).toBe('http://do/inspect|http://do/inspect')
		} finally {
			if (devServer) {
				await devServer.stop()
			}
		}
	})

	test('supports request-wide handle middleware with resolve(event) around HTTP method exports', async () => {
		const projectDir = await createProject({
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
	})

	test('logs from fetch, durable objects, queues, scheduled handlers and email handlers reach the dev logger', async () => {
		const projectDir = await createProject({
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
export default {
	async fetch(request, env) {
		const url = new URL(request.url)

		if (url.pathname === '/fetch-log') {
			console.log('FETCH_LOG_FROM_HANDLER')
			return new Response('fetch-ok')
		}

		if (url.pathname === '/do-log') {
			const id = env.LOGGER.idFromName('logs')
			return env.LOGGER.get(id).fetch('http://do/log')
		}

		if (url.pathname === '/queue-log' && request.method === 'POST') {
			await env.TASK_QUEUE.send({ surface: 'queue' })
			return new Response('queued', { status: 202 })
		}

		return new Response('not-found', { status: 404 })
	}
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
