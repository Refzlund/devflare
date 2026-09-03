import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'pathe'
import { configSchema } from '../../../src/config/schema'
import { prepareComposedWorkerEntrypoint } from '../../../src/worker-entry/composed-worker'

const TEST_DIR = join(import.meta.dirname, '../.fixtures/composed-worker')

describe('prepareComposedWorkerEntrypoint', () => {
	beforeEach(async () => {
		await mkdir(join(TEST_DIR, '.adapter-cloudflare'), { recursive: true })
	})

	afterEach(async () => {
		await rm(TEST_DIR, { recursive: true, force: true })
	})

	test('skips composition for adapter-generated fetch workers that already live in assets.directory', async () => {
		await writeFile(
			join(TEST_DIR, '.adapter-cloudflare', '_worker.js'),
			'export default { fetch() { return new Response("ok") } }'
		)

		const config = configSchema.parse({
			name: 'documentation',
			compatibilityDate: '2026-04-08',
			files: {
				fetch: '.adapter-cloudflare/_worker.js'
			},
			assets: {
				directory: '.adapter-cloudflare',
				binding: 'ASSETS'
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)

		expect(composedEntry).toBeNull()
	})

	test('re-exports local Durable Object classes from the composed worker entry', async () => {
		await mkdir(join(TEST_DIR, 'src'), { recursive: true })
		await writeFile(
			join(TEST_DIR, 'src', 'fetch.ts'),
			`
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
		`.trim()
		)
		await writeFile(
			join(TEST_DIR, 'src', 'do.counter.ts'),
			`
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject<DevflareEnv> {}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'do-composition-test',
			compatibilityDate: '2026-04-08',
			bindings: {
				durableObjects: {
					COUNTER: 'Counter'
				}
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)
		expect(composedEntry).not.toBeNull()
		expect(composedEntry && isAbsolute(composedEntry)).toBe(true)
		expect(composedEntry).toBe(join(TEST_DIR, '.devflare/worker-entrypoints/main.ts'))

		if (!composedEntry) {
			throw new Error('Expected composed worker entry to be generated')
		}

		const source = await readFile(composedEntry, 'utf-8')
		expect(source).toContain("export { Counter } from '../../src/do.counter.ts'")
	})

	test('throws when an explicit fetch handler path is missing instead of silently falling back to src/fetch.ts', async () => {
		await mkdir(join(TEST_DIR, 'src'), { recursive: true })
		await writeFile(
			join(TEST_DIR, 'src', 'fetch.ts'),
			`
export async function fetch(): Promise<Response> {
	return new Response('default')
}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'explicit-fetch-path-test',
			compatibilityDate: '2026-04-12',
			files: {
				fetch: 'src/custom-fetch.ts'
			}
		})

		await expect(prepareComposedWorkerEntrypoint(TEST_DIR, config)).rejects.toThrow(
			'Configured fetch handler "src/custom-fetch.ts" was not found'
		)
	})

	test('defers composition when files.fetch points at a missing build artifact and no other surface needs composition', async () => {
		// SvelteKit's adapter writes .svelte-kit/cloudflare/_worker.js during vite build, AFTER
		// devflare resolves surface paths. With no other surfaces, devflare should silently
		// skip composition so wrangler/vite can pick up the build output post-build.
		const config = configSchema.parse({
			name: 'sveltekit-adapter-passthrough',
			compatibilityDate: '2026-04-12',
			files: {
				fetch: '.svelte-kit/cloudflare/_worker.js'
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)
		expect(composedEntry).toBeNull()
	})

	test('throws a helpful build-artifact error when files.fetch is a build path AND other surfaces require composition', async () => {
		// When other surfaces need composition, devflare cannot defer to wrangler — the
		// composed wrapper would have to import the missing artifact. Surface a clear error.
		await mkdir(join(TEST_DIR, 'src'), { recursive: true })
		await writeFile(
			join(TEST_DIR, 'src', 'queue.ts'),
			`
export async function queue(): Promise<void> {}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'sveltekit-with-queue',
			compatibilityDate: '2026-04-12',
			files: {
				fetch: '.svelte-kit/cloudflare/_worker.js',
				queue: 'src/queue.ts'
			}
		})

		await expect(prepareComposedWorkerEntrypoint(TEST_DIR, config)).rejects.toThrow(
			/looks like a framework build output[\s\S]+wrangler[\s\S]+passthrough/
		)
	})

	test('composes files.tail into a Worker tail handler', async () => {
		await mkdir(join(TEST_DIR, 'src'), { recursive: true })
		await writeFile(
			join(TEST_DIR, 'src', 'tail.ts'),
			`
export default {
	async tail(events, env, ctx) {
		ctx.waitUntil(Promise.resolve(events.length))
	}
}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'tail-composition-test',
			compatibilityDate: '2026-04-26',
			files: {
				fetch: false,
				tail: 'src/tail.ts'
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)
		expect(composedEntry).toBe(join(TEST_DIR, '.devflare/worker-entrypoints/main.ts'))

		const source = await readFile(composedEntry!, 'utf-8')
		expect(source).toContain("import * as __devflareTailModule from '../../src/tail.ts'")
		expect(source).toContain('async tail(events, env, ctx)')
		expect(source).toContain('createTailEvent(events, env, ctx)')
	})

	describe('outbound email wiring', () => {
		const emailConfig = () =>
			configSchema.parse({
				name: 'email-composition-test',
				compatibilityDate: '2026-04-26',
				files: { fetch: 'src/fetch.ts' },
				bindings: { sendEmail: { MAILER: {} } }
			})

		beforeEach(async () => {
			await mkdir(join(TEST_DIR, 'src'), { recursive: true })
			await writeFile(
				join(TEST_DIR, 'src', 'fetch.ts'),
				"export async function fetch(): Promise<Response> { return new Response('ok') }"
			)
		})

		test('a build bakes in NO delivery endpoint', async () => {
			// A machine-local loopback URL in a deployable worker would be both
			// useless in production and a leak of the developer's setup.
			const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, emailConfig())
			const source = await readFile(composedEntry!, 'utf-8')

			expect(source).toContain('setLocalSendEmailBindings({"MAILER":{}})')
			expect(source).not.toContain('setEmailDeliverySink')
		})

		test('dev bakes in the loopback endpoint the host listens on', async () => {
			const composedEntry = await prepareComposedWorkerEntrypoint(
				TEST_DIR,
				emailConfig(),
				undefined,
				{
					devInternalEmail: true,
					outboundEmailEndpoint: 'http://127.0.0.1:54321/_devflare/email/outbound'
				}
			)
			const source = await readFile(composedEntry!, 'utf-8')

			expect(source).toContain(
				'setEmailDeliverySink(createHttpEmailDeliverySink("http://127.0.0.1:54321/_devflare/email/outbound"))'
			)
			expect(source).toContain('setLocalSendEmailBindings({"MAILER":{}})')
		})

		test('live mode registers no local binding, leaving the runtime binding in place', async () => {
			const composedEntry = await prepareComposedWorkerEntrypoint(
				TEST_DIR,
				emailConfig(),
				undefined,
				{ devInternalEmail: true, skipLocalSendEmailBindings: true }
			)
			const source = await readFile(composedEntry!, 'utf-8')

			expect(source).toContain('setLocalSendEmailBindings({})')
			expect(source).not.toContain('"MAILER"')
		})
	})
})
