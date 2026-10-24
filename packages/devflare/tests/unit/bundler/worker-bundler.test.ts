import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'pathe'
import type { LogLevel, RolldownLog } from 'rolldown'
import { bundleWorkerEntry } from '../../../src/bundler'
import { configSchema } from '../../../src/config/schema'
import { prepareComposedWorkerEntrypoint } from '../../../src/worker-entry/composed-worker'

const TEST_DIR = join(import.meta.dirname, '../.fixtures/worker-bundler')

/**
 * Write a minimal ESM package into the fixture's `node_modules` so a test can
 * exercise how the bundler resolves a bare specifier.
 *
 * @param name - Package name, which is also the bare specifier the fixture imports.
 * @param source - Body of the package's `index.js` entry.
 */
async function writeFixturePackage(name: string, source: string): Promise<void> {
	const packageDir = join(TEST_DIR, 'node_modules', name)

	await mkdir(packageDir, { recursive: true })
	await writeFile(
		join(packageDir, 'package.json'),
		JSON.stringify({ name, type: 'module', main: 'index.js' }, null, '\t')
	)
	await writeFile(join(packageDir, 'index.js'), source)
}

describe('bundleWorkerEntry', () => {
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

	test('applies user Rolldown plugins to the composed main worker bundle', async () => {
		await writeFile(
			join(TEST_DIR, 'src', 'Greeting.svelte'),
			`
<h1>Hello from Svelte</h1>
		`.trim()
		)

		await writeFile(
			join(TEST_DIR, 'src', 'fetch.ts'),
			`
import renderGreeting from './Greeting.svelte'

export async function fetch(): Promise<Response> {
	return new Response(renderGreeting())
}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'worker-bundler-test',
			compatibilityDate: '2026-03-17',
			files: {
				fetch: 'src/fetch.ts'
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)
		expect(composedEntry && isAbsolute(composedEntry)).toBe(true)

		if (!composedEntry) {
			throw new Error('Expected composed worker entry to be generated')
		}

		const bundlePath = await bundleWorkerEntry({
			cwd: TEST_DIR,
			inputFile: composedEntry,
			outFile: join(TEST_DIR, '.devflare', 'worker-entrypoints', 'main.js'),
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

		const output = await readFile(bundlePath, 'utf-8')
		expect(output).toContain('Hello from Svelte')

		const sourceMap = await stat(`${bundlePath}.map`)
		expect(sourceMap.isFile()).toBe(true)
	})

	test('bundles bare devflare root imports through the worker-safe entry', async () => {
		await writeFile(
			join(TEST_DIR, 'src', 'fetch.ts'),
			`
import { env } from 'devflare'

export async function fetch(): Promise<Response> {
	return new Response(String(env.MESSAGE ?? 'ok'))
}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'worker-bundler-root-import-test',
			compatibilityDate: '2026-03-17',
			files: {
				fetch: 'src/fetch.ts'
			},
			vars: {
				MESSAGE: 'ok'
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)
		expect(composedEntry && isAbsolute(composedEntry)).toBe(true)

		if (!composedEntry) {
			throw new Error('Expected composed worker entry to be generated')
		}

		const bundlePath = await bundleWorkerEntry({
			cwd: TEST_DIR,
			inputFile: composedEntry,
			outFile: join(TEST_DIR, '.devflare', 'worker-entrypoints', 'main.js')
		})

		const output = await readFile(bundlePath, 'utf-8')
		expect(output).not.toMatch(/\bimport\s*\(/)
		expect(output).not.toContain('./commands/')
	})

	test('rewrites third-party dynamic import helpers into worker-safe bundle code', async () => {
		await mkdir(join(TEST_DIR, 'node_modules', 'example-runtime'), {
			recursive: true
		})
		await writeFile(
			join(TEST_DIR, 'node_modules', 'example-runtime', 'package.json'),
			JSON.stringify(
				{
					name: 'example-runtime',
					type: 'module'
				},
				null,
				'\t'
			)
		)
		await writeFile(
			join(TEST_DIR, 'node_modules', 'example-runtime', 'index.js'),
			`
const importRuntimeModule = (module_name) => import(
	/* @vite-ignore */
	module_name
)

export async function loadAsyncHooks() {
	const hooks = await import('node:async_hooks')
	return typeof hooks.AsyncLocalStorage === 'function'
}

export async function loadCrypto() {
	return (await importRuntimeModule('node:crypto')).webcrypto ? 'crypto-ready' : 'crypto-missing'
}
		`.trim()
		)
		await writeFile(
			join(TEST_DIR, 'src', 'fetch.ts'),
			`
import { loadAsyncHooks, loadCrypto } from 'example-runtime'

export async function fetch(): Promise<Response> {
	return new Response(JSON.stringify({
		als: await loadAsyncHooks(),
		crypto: await loadCrypto()
	}))
}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'worker-bundler-dynamic-import-helper-test',
			compatibilityDate: '2026-03-17',
			files: {
				fetch: 'src/fetch.ts'
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)
		expect(composedEntry && isAbsolute(composedEntry)).toBe(true)

		if (!composedEntry) {
			throw new Error('Expected composed worker entry to be generated')
		}

		const bundlePath = await bundleWorkerEntry({
			cwd: TEST_DIR,
			inputFile: composedEntry,
			outFile: join(TEST_DIR, '.devflare', 'worker-entrypoints', 'main.js')
		})

		const output = await readFile(bundlePath, 'utf-8')
		expect(output).not.toMatch(/\bimport\s*\(/)
		expect(output).toContain('node:async_hooks')
		expect(output).toContain('Unsupported dynamic import in Devflare worker bundle')
	})

	test('fails early when a worker bundle still contains runtime-computed dynamic imports', async () => {
		await mkdir(join(TEST_DIR, 'node_modules', 'example-runtime'), {
			recursive: true
		})
		await writeFile(
			join(TEST_DIR, 'node_modules', 'example-runtime', 'package.json'),
			JSON.stringify(
				{
					name: 'example-runtime',
					type: 'module'
				},
				null,
				'\t'
			)
		)
		await writeFile(
			join(TEST_DIR, 'node_modules', 'example-runtime', 'index.js'),
			`
export async function loadRuntimeModule(moduleName) {
	return import(moduleName)
}
		`.trim()
		)
		await writeFile(
			join(TEST_DIR, 'src', 'fetch.ts'),
			`
import { loadRuntimeModule } from 'example-runtime'

export async function fetch(request: Request): Promise<Response> {
	const moduleName = new URL(request.url).searchParams.get('module') ?? 'node:crypto'
	await loadRuntimeModule(moduleName)
	return new Response('ok')
}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'worker-bundler-dynamic-import-error-test',
			compatibilityDate: '2026-03-17',
			files: {
				fetch: 'src/fetch.ts'
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)
		expect(composedEntry && isAbsolute(composedEntry)).toBe(true)

		if (!composedEntry) {
			throw new Error('Expected composed worker entry to be generated')
		}

		await expect(
			bundleWorkerEntry({
				cwd: TEST_DIR,
				inputFile: composedEntry,
				outFile: join(TEST_DIR, '.devflare', 'worker-entrypoints', 'main.js')
			})
		).rejects.toThrow(
			'Devflare worker bundles cannot contain unresolved dynamic import() expressions'
		)
	})

	test('treats a Node builtin subpath as external instead of failing to resolve it', async () => {
		// Shaped after @cloudflare/puppeteer's util.js, whose Node-only branch does
		// exactly this: the worker-compat transform hoists the literal dynamic import
		// into a static one, which is what forces rolldown to resolve the specifier.
		await writeFixturePackage(
			'example-node-subpath',
			`
let fs = null

export async function openHandle(path) {
	fs = await import('fs/promises')
	return fs.open(path, 'w+')
}
		`.trim()
		)
		await writeFile(
			join(TEST_DIR, 'src', 'fetch.ts'),
			`
import { openHandle } from 'example-node-subpath'

export async function fetch(): Promise<Response> {
	return new Response(String(await openHandle('')))
}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'worker-bundler-builtin-subpath-test',
			compatibilityDate: '2026-03-17',
			files: {
				fetch: 'src/fetch.ts'
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)

		if (!composedEntry) {
			throw new Error('Expected composed worker entry to be generated')
		}

		const logs: RolldownLog[] = []
		const bundlePath = await bundleWorkerEntry({
			cwd: TEST_DIR,
			inputFile: composedEntry,
			outFile: join(TEST_DIR, '.devflare', 'worker-entrypoints', 'main.js'),
			rolldownOptions: {
				onLog(_level: LogLevel, log: RolldownLog) {
					logs.push(log)
				}
			}
		})

		expect(logs.map((log) => log.code)).not.toContain('UNRESOLVED_IMPORT')
		// The specifier still leaves the bundle as an import — workerd's nodejs_compat
		// owns it. Only the diagnostic changes, which is why the assertion is on the log.
		expect(await readFile(bundlePath, 'utf-8')).toContain(`from "fs/promises"`)
	})

	test('bundles npm packages that only the host runtime reports as builtins', async () => {
		// Bun's `builtinModules` lists `ws` and `undici`; Node's does not. They are
		// installable packages, so externalizing them would hand workerd an import
		// it cannot resolve.
		await writeFixturePackage('ws', `export const WS_MARKER = 'bundled-ws-package'`)
		await writeFixturePackage('undici', `export const UNDICI_MARKER = 'bundled-undici-package'`)
		await writeFile(
			join(TEST_DIR, 'src', 'fetch.ts'),
			`
import { WS_MARKER } from 'ws'
import { UNDICI_MARKER } from 'undici'

export async function fetch(): Promise<Response> {
	return new Response([WS_MARKER, UNDICI_MARKER].join(','))
}
		`.trim()
		)

		const config = configSchema.parse({
			name: 'worker-bundler-host-only-builtin-test',
			compatibilityDate: '2026-03-17',
			files: {
				fetch: 'src/fetch.ts'
			}
		})

		const composedEntry = await prepareComposedWorkerEntrypoint(TEST_DIR, config)

		if (!composedEntry) {
			throw new Error('Expected composed worker entry to be generated')
		}

		const bundlePath = await bundleWorkerEntry({
			cwd: TEST_DIR,
			inputFile: composedEntry,
			outFile: join(TEST_DIR, '.devflare', 'worker-entrypoints', 'main.js')
		})

		const output = await readFile(bundlePath, 'utf-8')
		expect(output).toContain('bundled-ws-package')
		expect(output).toContain('bundled-undici-package')
		expect(output).not.toMatch(/from ["'](?:ws|undici)["']/)
	})
})
