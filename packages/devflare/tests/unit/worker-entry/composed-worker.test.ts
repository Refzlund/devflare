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
		await writeFile(join(TEST_DIR, '.adapter-cloudflare', '_worker.js'), 'export default { fetch() { return new Response("ok") } }')

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
		await writeFile(join(TEST_DIR, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('ok')
}
		`.trim())
		await writeFile(join(TEST_DIR, 'src', 'do.counter.ts'), `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject<DevflareEnv> {}
		`.trim())

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
		await writeFile(join(TEST_DIR, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('default')
}
		`.trim())

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
})