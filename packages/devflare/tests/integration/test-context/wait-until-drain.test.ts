import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'pathe'
import { env } from '../../../src'
import { cf, createTestContext } from '../../../src/test'
import { DEFAULT_WAIT_UNTIL_TIMEOUT_MS } from '../../../src/test/simple-context-lifecycle'

/*
	cf.worker.fetch returns before the handler's waitUntil work settles, and
	env.dispose() must not tear the runtime down underneath work still pending.
	Work that settled before dispose must behave exactly as if nothing tracked
	it. Each case creates and disposes its own context, because dispose itself
	is the subject.
*/

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
const devflareImportPath = pathToFileURL(join(repoRoot, 'src', 'index.ts')).href
const devflareTestImportPath = pathToFileURL(join(repoRoot, 'src', 'test', 'index.ts')).href

/** What the fixture's background work records once it has read its own write back. */
const PROBE_KEY = '__devflareWaitUntilDrainProbe'

/** The fixture project's config path, written once in `beforeAll`. */
let configPath = ''
/** The fixture project's directory, removed in `afterAll`. */
let projectDir = ''

/** The probe the fixture writes into, reset per case. */
function probe(): string[] {
	const global = globalThis as unknown as Record<string, string[] | undefined>
	global[PROBE_KEY] ??= []
	return global[PROBE_KEY]
}

/**
 * @description Runs `body` against a fresh context and disposes it afterwards
 * if `body` did not, so a failing assertion cannot leave Miniflare running.
 * @param body - the case; it may call `env.dispose()` itself
 */
async function withContext(body: () => Promise<void>): Promise<void> {
	probe().length = 0
	await createTestContext(configPath)
	try {
		await body()
	} finally {
		// A no-op when the case already disposed: that dispose cleared the
		// registered context, so `env.dispose()` has nothing to call.
		await env.dispose()
	}
}

/**
 * @description Calls `env.dispose()` and hands back what it threw.
 * @returns the thrown value, or `null` when dispose resolved
 */
async function disposeError(): Promise<unknown> {
	return env.dispose().then(
		() => null,
		(error: unknown) => error
	)
}

beforeAll(async () => {
	projectDir = await mkdtemp(join(tmpdir(), 'devflare-wait-until-drain-'))
	configPath = join(projectDir, 'devflare.config.ts')

	await mkdir(join(projectDir, 'src'), { recursive: true })
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify({ name: 'wait-until-drain', private: true, type: 'module' }, null, 2)
	)
	await writeFile(
		configPath,
		`
export default {
	name: 'wait-until-drain',
	compatibilityDate: '2026-03-17',
	files: { fetch: 'src/fetch.ts' },
	bindings: { kv: { RESULTS: 'results-kv-id' } }
}
`.trim()
	)
	await writeFile(
		join(projectDir, 'src', 'fetch.ts'),
		`
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function record(value: string): void {
	const global = globalThis as Record<string, string[] | undefined>
	;(global.${PROBE_KEY} ??= []).push(value)
}

export async function fetch(event) {
	const { pathname } = new URL(event.request.url)

	if (pathname === '/write-later') {
		event.ctx.waitUntil(
			(async () => {
				await delay(150)
				await event.env.RESULTS.put('late', 'written')
				record(String(await event.env.RESULTS.get('late')))
			})()
		)
	}

	if (pathname === '/reject-later') {
		event.ctx.waitUntil(
			(async () => {
				await delay(100)
				await event.env.RESULTS.put('doomed', 'yes')
				throw new Error('sweep exploded')
			})()
		)
	}

	if (pathname === '/reject-now') {
		event.ctx.waitUntil(
			(async () => {
				await delay(20)
				throw new Error('sweep exploded')
			})()
		)
	}

	if (pathname === '/never-settles') {
		event.ctx.waitUntil(new Promise(() => {}))
	}

	if (pathname === '/handled') {
		const audit = (async () => {
			await delay(5)
			throw new Error('audit service down')
		})()
		event.ctx.waitUntil(audit)
		try {
			await audit
		} catch {
			return new Response('degraded', { status: 503 })
		}
	}

	return new Response('accepted')
}
`.trim()
	)
})

afterAll(async () => {
	await rm(projectDir, { recursive: true, force: true })
})

describe('env.dispose() and cf.worker.fetch waitUntil work', () => {
	test('drains background work that uses a binding before tearing down', async () => {
		await withContext(async () => {
			const response = await cf.worker.get('/write-later')
			expect(await response.text()).toBe('accepted')
			// The response still comes back before the background work settles.
			expect(probe()).toEqual([])

			await env.dispose()

			expect(probe()).toEqual(['written'])
		})
	}, 20_000)

	test('reports a rejection during the drain once, from dispose, naming the request', async () => {
		await withContext(async () => {
			await cf.worker.get('/reject-later')

			const error = await disposeError()

			expect(error).toBeInstanceOf(Error)
			const failure = error as Error & { cause?: unknown }
			expect(failure.name).toBe('WaitUntilError')
			expect(failure.message).toContain(
				'waitUntil work started by cf.worker.fetch(GET http://localhost/reject-later) rejected while ' +
					'env.dispose() was waiting for it'
			)
			expect(failure.cause).toBeInstanceOf(Error)
			expect((failure.cause as Error).message).toBe('sweep exploded')
			// Once: had the tracker also raised it as an unhandled rejection, bun
			// would have failed this test. A later drain not repeating it is
			// graded in tests/unit/test/wait-until-tracker.test.ts.
		})
	}, 20_000)

	test('stops waiting for work that never settles, tears down, and names it', async () => {
		await withContext(async () => {
			await cf.worker.get('/never-settles')

			const started = performance.now()
			const error = await disposeError()
			const elapsed = performance.now() - started

			expect(error).toBeInstanceOf(Error)
			const abandoned = error as Error
			expect(abandoned.name).toBe('WaitUntilError')
			expect(abandoned.message).toContain(
				'waitUntil work started by cf.worker.fetch(GET http://localhost/never-settles) had not settled'
			)
			expect(abandoned.message).toContain(`after ${DEFAULT_WAIT_UNTIL_TIMEOUT_MS}ms`)
			expect(abandoned.message).toContain('env.dispose({ waitUntilTimeoutMs })')

			expect(elapsed).toBeGreaterThanOrEqual(DEFAULT_WAIT_UNTIL_TIMEOUT_MS - 50)
			expect(elapsed).toBeLessThan(DEFAULT_WAIT_UNTIL_TIMEOUT_MS + 2_500)

			// The teardown ran to its end: the worker helper was reset.
			await expect(cf.worker.get('/write-later')).rejects.toThrow('Fetch handler not configured')
		})
	}, 20_000)

	test('leaves a rejection the handler recovered from alone, before and at dispose', async () => {
		await withContext(async () => {
			const response = await cf.worker.get('/handled')
			expect(response.status).toBe(503)
			expect(await response.text()).toBe('degraded')

			// Settled before dispose, so dispose has nothing to say about it either.
			expect(await disposeError()).toBeNull()
		})
	}, 20_000)

	// A rejection before dispose is left to bun, which fails the running test on
	// it whatever listeners are installed (measured on bun 1.4.2), so this can
	// only be observed from a separate run.
	test('leaves an unhandled rejection before dispose to bun, reported once, as before', async () => {
		const fixturePath = join(projectDir, 'tests', 'outside-drain.test.ts')
		await mkdir(dirname(fixturePath), { recursive: true })
		await writeFile(
			fixturePath,
			`
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { env } from '${devflareImportPath}'
import { cf, createTestContext } from '${devflareTestImportPath}'

beforeAll(() => createTestContext(${JSON.stringify(configPath)}), 30_000)
afterAll(() => env.dispose())

test('starts background work that fails while it is still running', async () => {
	await cf.worker.get('/reject-now')
	await new Promise((resolve) => setTimeout(resolve, 300))
})

test('runs after the failure', () => {
	expect(true).toBe(true)
})
`.trim()
		)

		const run = Bun.spawn(['bun', 'test', fixturePath], {
			cwd: projectDir,
			stdout: 'pipe',
			stderr: 'pipe'
		})
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(run.stdout).text(),
			new Response(run.stderr).text(),
			run.exited
		])
		const output = `${stdout}\n${stderr}`

		expect(exitCode).not.toBe(0)
		expect(output).toContain('(fail) starts background work that fails while it is still running')
		expect(output).toContain('error: sweep exploded')
		// Once, by bun: nothing attributed, and nothing from dispose afterwards
		// (an `afterAll` that threw would be a second failure).
		expect(output).not.toContain('WaitUntilError')
		expect(output).toMatch(/\b1 pass\b/)
		expect(output).toMatch(/\b1 fail\b/)
		expect(output).not.toContain('Unhandled error between tests')
	}, 60_000)
})
