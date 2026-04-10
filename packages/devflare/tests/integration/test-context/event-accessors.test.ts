import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'pathe'
import { dirname } from 'pathe'
import { env } from '../../../src'
import { cf, createTestContext } from '../../../src/test'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
const runtimeImportPath = pathToFileURL(join(repoRoot, 'src', 'runtime', 'index.ts')).href
const tempDirs: string[] = []

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

describe('createTestContext event accessors', () => {
	test('establishes active surface events automatically for worker, queue, scheduled, email, and tail helpers', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-test-context-events-'))
		tempDirs.push(projectDir)

		const runtimeEnv = env as unknown as {
			RESULTS: {
				get(key: string): Promise<string | null>
			}
			dispose(): Promise<void>
		}

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'test-context-event-accessors',
			private: true,
			type: 'module'
		}, null, 2))
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'test-context-event-accessors',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts'
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
`.trim())
		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
import { getFetchEvent } from '${runtimeImportPath}'

export async function fetch(event) {
	const activeEvent = getFetchEvent()

	return Response.json({
		requestUrl: activeEvent.request.url,
		sameRequest: activeEvent.request === event.request,
		safeUrl: getFetchEvent.safe()?.request.url ?? null
	})
}
`.trim())
		await writeFile(join(projectDir, 'src', 'queue.ts'), `
import { getQueueEvent } from '${runtimeImportPath}'

export async function queue(event) {
	const activeEvent = getQueueEvent()
	await event.env.RESULTS.put('queue', event.messages[0].body.value + ':' + activeEvent.batch.queue)
	activeEvent.messages[0].ack()
}
`.trim())
		await writeFile(join(projectDir, 'src', 'scheduled.ts'), `
import { getScheduledEvent } from '${runtimeImportPath}'

export async function scheduled(event) {
	await event.env.RESULTS.put('scheduled', getScheduledEvent().controller.cron || 'missing-cron')
}
`.trim())
		await writeFile(join(projectDir, 'src', 'email.ts'), `
import { getEmailEvent } from '${runtimeImportPath}'

export async function email(event) {
	await event.env.RESULTS.put('email', event.message.from + '->' + getEmailEvent().to)
}
`.trim())
		await writeFile(join(projectDir, 'src', 'tail.ts'), `
import { getTailEvent } from '${runtimeImportPath}'

export async function tail(event) {
	await event.env.RESULTS.put('tail', getTailEvent().events[0].scriptName + ':' + event.events.length)
}
`.trim())

		await createTestContext(join(projectDir, 'devflare.config.ts'))

		try {
			const fetchResponse = await cf.worker.get('/inspect')
			expect(fetchResponse.status).toBe(200)
			const fetchPayload = await fetchResponse.json() as {
				requestUrl: string
				sameRequest: boolean
				safeUrl: string | null
			}
			expect(fetchPayload).toEqual({
				requestUrl: 'http://localhost/inspect',
				sameRequest: true,
				safeUrl: 'http://localhost/inspect'
			})

			const queueResult = await cf.queue.send({ value: 'queued' })
			expect(queueResult.total).toBe(1)
			expect(queueResult.acked).toHaveLength(1)
			expect(await runtimeEnv.RESULTS.get('queue')).toBe('queued:test-queue')

			const scheduledResult = await cf.scheduled.trigger('0 * * * *')
			expect(scheduledResult.success).toBe(true)
			expect(await runtimeEnv.RESULTS.get('scheduled')).toBe('0 * * * *')

			const emailResponse = await cf.email.send({
				from: 'sender@example.com',
				to: 'worker@example.com',
				subject: 'Event accessors',
				body: 'Hello from the regression test'
			})
			expect(emailResponse.status).toBe(200)
			expect(await runtimeEnv.RESULTS.get('email')).toBe('sender@example.com->worker@example.com')

			const tailResult = await cf.tail.trigger([
				{
					scriptName: 'tail-worker',
					outcome: 'ok',
					eventTimestamp: Date.now()
				}
			])
			expect(tailResult.success).toBe(true)
			expect(await runtimeEnv.RESULTS.get('tail')).toBe('tail-worker:1')
		} finally {
			await runtimeEnv.dispose()
		}
	})
})
