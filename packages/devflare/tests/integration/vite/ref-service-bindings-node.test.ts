// =============================================================================
// A real ref() service binding, under NODE
// =============================================================================
// `devflare dev` runs its Vite child under Node (`bunx vite`, whose bin is a node
// script), and so does a user's own `vite dev`. Two things differ there, and this
// suite runs the BUILT package under `node` because Bun cannot be made absent
// inside `bun test` (`globalThis.Bun` is not configurable):
//
//   - c12 loads a config through jiti, which rewrites a ref's `import(...)` as
//     `jitiImport(...)`, so `ref()` finds no specifier and its `configPath` is
//     `<pending>`;
//   - nothing can bundle a referenced worker, which needs Bun.
//
// So no referenced worker is built under Node, and no env file of it, or of the
// gateway in its place, may be read.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { join } from 'pathe'
import { cleanupTempDirs, ensurePackageBuilt } from '../helpers/built-devflare.helpers'

const TEST_TIMEOUT_MS = 180_000
const DIST = join(import.meta.dirname, '../../../dist')
const distUrl = (entry: string): string => pathToFileURL(join(DIST, entry)).href

const GATEWAY_SECRET = 'secret-from-the-gateways-dev-vars'
/** Set only in `api/.env`: a lookup in the gateway's directory cannot find it. */
const API_ENV = 'DEVFLARE_NODE_REF_FIXTURE_ORIGIN'
/** Set nowhere: resolving the env of a worker that requires it can only throw. */
const UNSET_ENV = 'DEVFLARE_NODE_REF_FIXTURE_UNSET'

/** What the node script reports, one entry per path it ran. */
interface NodeReport {
	serve: { error: string | null; auxiliaryWorkers: string[]; context: string }
	programmatic: { error: string | null; auxiliaryWorkers: string[]; output: string }
	direct: { error: string | null; workers: string[]; primaryServiceBindings: unknown }
	/** The direct case's ref's config path: known, or the case grades nothing about Bun. */
	directConfigPath: string
	importFunctionSource: string
}

const tempDirs: string[] = []
let report: NodeReport

/**
 * @description Writes a gateway whose `API` binding is a real `ref()` to `api/`, where a
 * required var's value lives only in `api/.env`, plus the node script that drives it.
 * @param projectDir - the gateway's root
 */
async function writeFixture(projectDir: string): Promise<void> {
	await mkdir(join(projectDir, 'src'), { recursive: true })
	await mkdir(join(projectDir, 'api', 'src'), { recursive: true })
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify({ name: 'node-ref-test', private: true, type: 'module' })
	)
	await writeFile(
		join(projectDir, 'src', 'fetch.ts'),
		`export async function fetch(): Promise<Response> { return new Response('ok') }`
	)
	// What a lookup in the WRONG directory would find: an entry to bundle and a secret.
	await writeFile(
		join(projectDir, 'src', 'worker.ts'),
		"export async function ping(): Promise<string> {\n\treturn 'GATEWAY'\n}\n"
	)
	await writeFile(join(projectDir, '.dev.vars'), `SECRET=${GATEWAY_SECRET}\n`)
	await writeFile(
		join(projectDir, 'api', 'src', 'worker.ts'),
		"export async function ping(): Promise<string> {\n\treturn 'PONG'\n}\n"
	)
	await writeFile(join(projectDir, 'api', '.env'), `${API_ENV}=from-the-api-env\n`)
	const apiConfig = `
import { env } from '${distUrl('config-entry.js')}'
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-28',
	files: { fetch: false },
	vars: { ORIGIN: env.${API_ENV} }
}
`.trim()
	await writeFile(join(projectDir, 'api', 'devflare.config.ts'), apiConfig)
	// The direct case's worker: its required var is set NOWHERE, so reading its env throws, and
	// node's own importer keeps its ref's import source, so its config path is known.
	await mkdir(join(projectDir, 'direct', 'src'), { recursive: true })
	await writeFile(
		join(projectDir, 'direct', 'src', 'worker.ts'),
		"export async function ping(): Promise<string> {\n\treturn 'DIRECT'\n}\n"
	)
	await writeFile(
		join(projectDir, 'direct', 'devflare.config.mjs'),
		apiConfig
			.replace(`env.${API_ENV}`, `env.${UNSET_ENV}`)
			.replace("name: 'api-worker'", "name: 'direct-worker'")
	)
	await writeFile(
		join(projectDir, 'devflare.config.ts'),
		`
import { ref } from '${distUrl('config-entry.js')}'
export default {
	name: 'gateway-worker',
	compatibilityDate: '2026-04-28',
	files: { fetch: 'src/fetch.ts', durableObjects: false },
	bindings: { services: { API: ref(() => import('./api/devflare.config.ts')).worker } }
}
`.trim()
	)
	await writeFile(
		join(projectDir, 'run.mjs'),
		`
import { writeFileSync } from 'node:fs'
import { devflarePlugin, getPluginContext, getDevflareConfigs } from '${distUrl('vite/index.js')}'
import { resolveServiceBindings } from '${distUrl('test/index.js')}'
import { loadConfig, ref } from '${distUrl('index.js')}'

const cwd = process.argv[2]
const message = (error) => (error ? String(error.message ?? error) : null)
const report = {}

const loaded = await loadConfig({ cwd })
report.importFunctionSource = String(loaded.bindings.services.API.__ref.__import)

try {
	await devflarePlugin().configResolved({ root: cwd, command: 'serve' })
	const context = getPluginContext()
	report.serve = { error: null, auxiliaryWorkers: context.auxiliaryWorkerConfigs.map((w) => w.config.name), context: JSON.stringify(context) }
} catch (error) {
	report.serve = { error: message(error), auxiliaryWorkers: [], context: '' }
}

try {
	const result = await getDevflareConfigs({ cwd })
	report.programmatic = { error: null, auxiliaryWorkers: result.auxiliaryWorkers.map((w) => w.config.name), output: JSON.stringify(result) }
} catch (error) {
	report.programmatic = { error: message(error), auxiliaryWorkers: [], output: '' }
}

// A ref built HERE keeps its import source, so its configPath is known: only the missing
// bundler stands between it and reading direct/'s env, which can only throw.
const api = ref(() => import('./direct/devflare.config.mjs'))
report.directConfigPath = api.configPath
try {
	const result = await resolveServiceBindings({ name: 'gateway-worker', compatibilityDate: '2026-04-28', bindings: { services: { API: api.worker } } }, cwd)
	report.direct = { error: null, workers: result.workers.map((w) => w.name), primaryServiceBindings: result.primaryServiceBindings }
} catch (error) {
	report.direct = { error: message(error), workers: [], primaryServiceBindings: null }
}

// The report goes to a file: the plugin logs its own lines to stdout.
writeFileSync(process.argv[3], JSON.stringify(report))
`.trim()
	)
}

describe('a real ref() service binding under node', () => {
	beforeAll(async () => {
		await ensurePackageBuilt()
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-node-ref-'))
		tempDirs.push(projectDir)
		await writeFixture(projectDir)

		const environment = { ...process.env }
		delete environment[API_ENV]
		delete environment[UNSET_ENV]
		const reportPath = join(projectDir, 'report.json')
		const run = Bun.spawn(['node', join(projectDir, 'run.mjs'), projectDir, reportPath], {
			cwd: projectDir,
			env: environment,
			stdout: 'pipe',
			stderr: 'pipe'
		})
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(run.stdout).text(),
			new Response(run.stderr).text(),
			run.exited
		])
		if (exitCode !== 0) {
			throw new Error(`node run failed (${exitCode}):\n${stderr}\n${stdout}`)
		}
		report = JSON.parse(await readFile(reportPath, 'utf8')) as NodeReport
	}, TEST_TIMEOUT_MS)

	afterAll(async () => {
		await cleanupTempDirs(tempDirs)
	})

	test("the premise: jiti rewrote the ref's import, so ref() could not read its config path", () => {
		expect(report.importFunctionSource).not.toMatch(/(^|[^\w$])import\s*\(/)
	})

	test("serve builds no referenced worker and reads neither the worker's env nor the gateway's", () => {
		expect(report.serve.error).toBeNull()
		expect(report.serve.auxiliaryWorkers).toEqual([])
		expect(report.serve.context).not.toContain(GATEWAY_SECRET)
	})

	test('getDevflareConfigs() builds no referenced worker and reads no env for it', () => {
		expect(report.programmatic.error).toBeNull()
		expect(report.programmatic.auxiliaryWorkers).toEqual([])
		expect(report.programmatic.output).not.toContain(GATEWAY_SECRET)
	})

	test("with no Bun to bundle it, a referenced worker's own env is not read either", () => {
		// The premise: this ref's path is known, so only the missing bundler can stop the read.
		expect(report.directConfigPath).toBe('./direct/devflare.config.mjs')
		expect(report.direct.error).toBeNull()
		expect(report.direct.workers).toEqual([])
		expect(report.direct.primaryServiceBindings).toEqual({ API: { name: 'direct-worker' } })
	})
})
