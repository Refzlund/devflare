import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as miniflare from 'miniflare'
import { splitSharedOptions, toMiniflareOptions } from '../../../src/utils/miniflare-options'

const tempDirs: string[] = []

/** A fresh directory holding the given files, removed after each test. */
function createTempFiles(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), 'devflare-miniflare-options-'))
	tempDirs.push(dir)
	for (const [name, contents] of Object.entries(files)) {
		mkdirSync(join(dir, name, '..'), { recursive: true })
		writeFileSync(join(dir, name), contents)
	}
	return dir
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

/** The minimal inline worker every conversion case starts from. */
const inlineWorker = {
	name: 'worker',
	compatibilityDate: '2026-01-01',
	modules: true,
	script: 'export default { fetch() { return new Response("ok") } }'
}

describe('splitSharedOptions', () => {
	test("keeps Miniflare-wide options apart from the worker's, as Miniflare's schema defines them", () => {
		const { shared, worker } = splitSharedOptions(miniflare, {
			port: 0,
			host: '127.0.0.1',
			resourcePersistencePath: '/data',
			name: 'worker',
			compatibilityFlags: ['nodejs_compat'],
			queueProducers: { JOBS: { queueName: 'jobs' } },
			hyperdrives: { PG: 'postgres://localhost/app' }
		})

		expect(shared).toEqual({ port: 0, host: '127.0.0.1', resourcePersistencePath: '/data' })
		expect(Object.keys(worker).sort()).toEqual([
			'compatibilityFlags',
			'hyperdrives',
			'name',
			'queueProducers'
		])
	})
})

describe('toMiniflareOptions', () => {
	test('converts a flat single-worker config into the Miniflare 5 workers array', async () => {
		const options = await toMiniflareOptions(miniflare, { port: 0, ...inlineWorker })

		expect(options.port).toBe(0)
		expect(options.workers).toHaveLength(1)
		expect(options.workers[0]?.config.name).toBe('worker')
	})

	test('refuses a top-level option Miniflare 5 removed instead of letting the converter drop it', async () => {
		await expect(
			toMiniflareOptions(miniflare, { ...inlineWorker, kvPersist: '/data/kv' })
		).rejects.toThrow(/no longer accepts and would silently ignore: kvPersist\./)
	})

	test('refuses a removed option on one worker of a multi-worker config, naming its index', async () => {
		const workers = [inlineWorker, { ...inlineWorker, name: 'second', wrappedBindings: {} }]

		await expect(toMiniflareOptions(miniflare, { workers })).rejects.toThrow(
			/workers\[1\]\.wrappedBindings/
		)
	})

	test('refuses a worker option at the top level of a multi-worker config, where the converter ignores it', async () => {
		await expect(
			toMiniflareOptions(miniflare, { compatibilityDate: '2026-01-01', workers: [inlineWorker] })
		).rejects.toThrow(/would silently ignore: compatibilityDate\./)
	})

	test('ignores a removed option whose value is undefined, since it carries nothing', async () => {
		const options = await toMiniflareOptions(miniflare, { ...inlineWorker, kvPersist: undefined })

		expect(options.workers[0]?.config.name).toBe('worker')
	})

	test('expands modulesRules into the module list Miniflare 4 used to discover from the script', async () => {
		const dir = createTempFiles({
			'entry.js':
				"import dep from './lib/dep.js'\nexport default { fetch() { return new Response(dep) } }\n",
			'lib/dep.js': "import text from '../data.txt'\nexport default text\n",
			'data.txt': 'hello',
			'unused.js': 'export default 1\n'
		})

		const options = await toMiniflareOptions(miniflare, {
			name: 'worker',
			compatibilityDate: '2026-01-01',
			scriptPath: join(dir, 'entry.js'),
			modulesRules: [
				{ type: 'Text', include: ['**/*.txt'] },
				{ type: 'ESModule', include: ['**/*.js'] }
			]
		})

		const manifest = options.workers[0]?.config.manifest as {
			mainModule: string
			modules: Record<string, { type: string; contents: string }>
		}
		expect(manifest.mainModule).toBe('entry.js')
		expect(Object.keys(manifest.modules).sort()).toEqual(['data.txt', 'entry.js', 'lib/dep.js'])
		expect(manifest.modules['data.txt']).toEqual({ type: 'text', contents: 'hello' })
	})

	test('refuses an imported file that matches no module rule, as Miniflare 4 did', async () => {
		const dir = createTempFiles({
			'entry.js':
				"import data from './data.bin'\nexport default { fetch() { return new Response(data) } }\n",
			'data.bin': 'x'
		})

		await expect(
			toMiniflareOptions(miniflare, {
				...inlineWorker,
				script: undefined,
				scriptPath: join(dir, 'entry.js'),
				modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }]
			})
		).rejects.toThrow(/"\.\/data\.bin" imported by .* matches no module rule/)
	})

	test('leaves bare specifiers, import.meta and literal dynamic imports to their usual handling', async () => {
		const dir = createTempFiles({
			'entry.js':
				"import { DurableObject } from 'cloudflare:workers'\n" +
				'const here = import.meta.url\n' +
				"export default { async fetch() { const lazy = await import('./lazy.js'); return new Response(lazy.default + here + DurableObject.name) } }\n",
			'lazy.js': 'export default 1\n'
		})

		const options = await toMiniflareOptions(miniflare, {
			name: 'worker',
			compatibilityDate: '2026-01-01',
			scriptPath: join(dir, 'entry.js'),
			modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }]
		})

		const manifest = options.workers[0]?.config.manifest as { modules: Record<string, unknown> }
		expect(Object.keys(manifest.modules).sort()).toEqual(['entry.js', 'lazy.js'])
	})

	test('refuses a dynamic import whose specifier is not a string literal, as Miniflare 4 did', async () => {
		const dir = createTempFiles({
			'entry.js':
				'export default { async fetch(request) { const locale = new URL(request.url).pathname; ' +
				'return new Response((await import(`./locales/${locale}.js`)).default) } }\n'
		})

		await expect(
			toMiniflareOptions(miniflare, {
				name: 'worker',
				compatibilityDate: '2026-01-01',
				scriptPath: join(dir, 'entry.js'),
				modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }]
			})
		).rejects.toThrow(/dynamic import\(\) whose specifier is not a string literal/)
	})

	test('reads httpsKeyPath and httpsCertPath into the contents Miniflare 5 takes', async () => {
		const dir = createTempFiles({ 'key.pem': 'KEY-PEM', 'cert.pem': 'CERT-PEM' })

		const options = await toMiniflareOptions(miniflare, {
			...inlineWorker,
			https: true,
			httpsKeyPath: join(dir, 'key.pem'),
			httpsCertPath: join(dir, 'cert.pem')
		})

		expect(options.httpsKey).toBe('KEY-PEM')
		expect(options.httpsCert).toBe('CERT-PEM')
	})

	test('lets an inline httpsKey win over httpsKeyPath, as Miniflare 4 did', async () => {
		const dir = createTempFiles({ 'cert.pem': 'CERT-PEM' })

		const options = await toMiniflareOptions(miniflare, {
			...inlineWorker,
			httpsKey: 'INLINE-KEY',
			httpsKeyPath: join(dir, 'missing-key.pem'),
			httpsCertPath: join(dir, 'cert.pem')
		})

		expect(options.httpsKey).toBe('INLINE-KEY')
		expect(options.httpsCert).toBe('CERT-PEM')
	})

	test('reads nothing when only one TLS half is given, leaving the built-in certificate in charge', async () => {
		const options = await toMiniflareOptions(miniflare, {
			...inlineWorker,
			https: true,
			httpsKeyPath: '/no/such/key.pem'
		})

		expect(options.https).toBe(true)
		expect(options.httpsKey).toBeUndefined()
		expect(options.httpsCert).toBeUndefined()
	})

	test('names the option whose TLS file cannot be read', async () => {
		const dir = createTempFiles({ 'cert.pem': 'CERT-PEM' })

		await expect(
			toMiniflareOptions(miniflare, {
				...inlineWorker,
				httpsKeyPath: join(dir, 'missing-key.pem'),
				httpsCertPath: join(dir, 'cert.pem')
			})
		).rejects.toThrow(/given as httpsKeyPath/)
	})
})
