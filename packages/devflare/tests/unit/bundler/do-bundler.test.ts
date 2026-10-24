// =============================================================================
// DO Bundler Tests
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { createDOBundler } from '../../../src/bundler/do-bundler'

const TEST_DIR = join(import.meta.dirname, '../.fixtures/do-bundler')

describe('createDOBundler', () => {
	beforeEach(async () => {
		await mkdir(join(TEST_DIR, 'src'), { recursive: true })
		await writeFile(
			join(TEST_DIR, 'tsconfig.json'),
			JSON.stringify(
				{
					compilerOptions: {
						target: 'ES2022',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						strict: true
					}
				},
				null,
				'\t'
			)
		)
	})

	afterEach(async () => {
		await rm(TEST_DIR, { recursive: true, force: true })
	})

	test('applies user Rolldown plugins to Durable Object bundles', async () => {
		await writeFile(
			join(TEST_DIR, 'src/Greeting.svelte'),
			`
<h1>Hello from Svelte</h1>
		`.trim()
		)

		await writeFile(
			join(TEST_DIR, 'src/do.greeter.ts'),
			`
import { DurableObject } from 'cloudflare:workers'
import renderGreeting from './Greeting.svelte'

export class Greeter extends DurableObject {
	async fetch(): Promise<Response> {
		return new Response(renderGreeting())
	}
}
		`.trim()
		)

		const bundler = createDOBundler({
			cwd: TEST_DIR,
			pattern: 'src/do.*.ts',
			outDir: join(TEST_DIR, '.devflare/do-bundles'),
			sourcemap: true,
			rolldownOptions: {
				plugins: [
					{
						name: 'test-svelte-transform',
						transform(code, id) {
							if (!id.endsWith('.svelte')) {
								return null
							}

							const heading = code.match(/<h1>(.*?)<\/h1>/)?.[1] ?? 'Hello from Svelte'

							return {
								code: `export default function renderGreeting() { return ${JSON.stringify(heading)} }`,
								map: null
							}
						}
					}
				]
			}
		})

		const result = await bundler.build()
		await bundler.close()

		expect(result.errors).toEqual([])

		const bundlePath = result.bundles.get('GREETER')
		expect(bundlePath).toBeDefined()

		if (!bundlePath) {
			throw new Error('Expected GREETER bundle path to be generated')
		}

		const output = await readFile(bundlePath, 'utf-8')
		expect(output).toContain('Hello from Svelte')

		const sourceMap = await stat(`${bundlePath}.map`)
		expect(sourceMap.isFile()).toBe(true)
	})

	test('injects the Durable Object event wrapper into bundled outputs', async () => {
		await writeFile(
			join(TEST_DIR, 'src/do.logger.ts'),
			`
import { DurableObject } from 'cloudflare:workers'

export class Logger extends DurableObject {
	async fetch({ request }): Promise<Response> {
		return new Response(request.url)
	}
}
		`.trim()
		)

		const bundler = createDOBundler({
			cwd: TEST_DIR,
			pattern: 'src/do.*.ts',
			outDir: join(TEST_DIR, '.devflare/do-bundles')
		})

		const result = await bundler.build()
		await bundler.close()

		expect(result.errors).toEqual([])

		const bundlePath = result.bundles.get('LOGGER')
		expect(bundlePath).toBeDefined()

		if (!bundlePath) {
			throw new Error('Expected LOGGER bundle path to be generated')
		}

		const output = await readFile(bundlePath, 'utf-8')
		expect(output).toContain('createDurableObjectFetchEvent')
		expect(output).toContain('runWithEventContext')
	})
})
