import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DevflareConfig } from '../../../src/config'
import { __resetDurableObjectBundleCache } from '../../../src/test/durable-object-bundle-cache'
import { buildDurableObjectGateway } from '../../../src/test/simple-context-durable-objects'
import { createTrackedTempDirectories } from '../../helpers/tracked-temp-directories'

const tempDirectories = createTrackedTempDirectories()
const originalBunBuild = Bun.build

afterAll(() => {
	tempDirectories.cleanup()
})

beforeEach(() => {
	__resetDurableObjectBundleCache()
})

afterEach(() => {
	;(Bun as unknown as { build: typeof Bun.build }).build = originalBunBuild
})

/**
 * Make `Bun.build` throw the way it does once the bun test runner has already
 * loaded a module on the Durable Object graph into this process. Any code path
 * that still bundles fails loudly instead of quietly costing a second.
 */
function forbidBundling(): void {
	;(Bun as unknown as { build: () => never }).build = () => {
		throw new Error('EISDIR reading file: module already loaded by the test runner')
	}
}

const config: DevflareConfig = {
	name: 'do-bundle-cache-project',
	compatibilityDate: '2026-03-17',
	bindings: {
		durableObjects: {
			COUNTER: { className: 'Counter' }
		}
	}
} as DevflareConfig

/**
 * A project whose Durable Object imports a shared module, so the tests can tell
 * apart "tracks the entry files" from "tracks the whole graph".
 */
function createProject(): string {
	const projectDir = tempDirectories.create('devflare-do-bundle-cache-')
	mkdirSync(join(projectDir, 'src'), { recursive: true })

	writeFileSync(join(projectDir, 'src', 'shared.ts'), `export const GREETING = 'shared-v1'\n`)
	writeFileSync(join(projectDir, 'src', 'do.counter.ts'), durableObjectSource('counter-v1'))

	return projectDir
}

/**
 * @param marker - A literal the bundled output must carry, so a test can tell
 *   which revision of the source the returned script was built from.
 */
function durableObjectSource(marker: string): string {
	return [
		`import { GREETING } from './shared'`,
		``,
		`export class Counter {`,
		`	greet() {`,
		`		return GREETING + '${marker}'`,
		`	}`,
		`}`,
		``
	].join('\n')
}

async function buildGateway(projectDir: string): Promise<string> {
	const gateway = await buildDurableObjectGateway(config, projectDir, null)
	return gateway.script
}

describe('durable object bundle cache', () => {
	test('a second gateway build reuses the cache instead of calling Bun.build', async () => {
		const projectDir = createProject()

		const first = await buildGateway(projectDir)
		expect(first.includes('shared-v1')).toBe(true)

		forbidBundling()
		const second = await buildGateway(projectDir)

		expect(second).toBe(first)
	})

	test('a cold process reuses the bundle another process left on disk', async () => {
		const projectDir = createProject()

		const first = await buildGateway(projectDir)

		// Everything this process learned is gone; only the cache file survives,
		// which is the state a second `bun test` process starts in.
		__resetDurableObjectBundleCache()
		forbidBundling()

		expect(await buildGateway(projectDir)).toBe(first)
	})

	test('editing the durable object source rebuilds the bundle', async () => {
		const projectDir = createProject()

		expect((await buildGateway(projectDir)).includes('counter-v1')).toBe(true)

		writeFileSync(join(projectDir, 'src', 'do.counter.ts'), durableObjectSource('counter-v2'))

		const rebuilt = await buildGateway(projectDir)
		expect(rebuilt.includes('counter-v2')).toBe(true)
		expect(rebuilt.includes('counter-v1')).toBe(false)
	})

	test('editing a module the durable object imports rebuilds the bundle', async () => {
		const projectDir = createProject()

		expect((await buildGateway(projectDir)).includes('shared-v1')).toBe(true)

		writeFileSync(join(projectDir, 'src', 'shared.ts'), `export const GREETING = 'shared-v2'\n`)

		const rebuilt = await buildGateway(projectDir)
		expect(rebuilt.includes('shared-v2')).toBe(true)
		expect(rebuilt.includes('shared-v1')).toBe(false)
	})

	test('a module added beside a bundled one rebuilds the bundle', async () => {
		const projectDir = createProject()

		// A JavaScript module wins only until its TypeScript twin exists. Nothing
		// already bundled changes when that twin appears, so only the directory
		// listing can notice.
		writeFileSync(join(projectDir, 'src', 'mode.js'), `export const MODE = 'from-js'\n`)
		writeFileSync(
			join(projectDir, 'src', 'do.counter.ts'),
			[
				`import { MODE } from './mode'`,
				``,
				`export class Counter {`,
				`	greet() {`,
				`		return MODE`,
				`	}`,
				`}`,
				``
			].join('\n')
		)
		expect((await buildGateway(projectDir)).includes('from-js')).toBe(true)

		writeFileSync(join(projectDir, 'src', 'mode.ts'), `export const MODE = 'from-ts'\n`)
		__resetDurableObjectBundleCache()

		const rebuilt = await buildGateway(projectDir)
		expect(rebuilt.includes('from-ts')).toBe(true)
		expect(rebuilt.includes('from-js')).toBe(false)
	})

	test('a deleted graph file rebuilds rather than serving a stale bundle', async () => {
		const projectDir = createProject()
		await buildGateway(projectDir)

		__resetDurableObjectBundleCache()
		rmSync(join(projectDir, 'src', 'shared.ts'))
		forbidBundling()

		await expect(buildGateway(projectDir)).rejects.toThrow('EISDIR')
	})

	test('a newer bundler or devflare version rebuilds the bundle', async () => {
		const projectDir = createProject()
		await buildGateway(projectDir)

		const cacheDir = join(projectDir, '.devflare', 'test-bundles')
		for (const name of readdirSync(cacheDir)) {
			const manifestPath = join(cacheDir, name)
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
			manifest.builder = manifest.builder.replace(/"bun":"[^"]*"/, '"bun":"0.0.0-ancient"')
			writeFileSync(manifestPath, JSON.stringify(manifest))
		}
		__resetDurableObjectBundleCache()
		forbidBundling()

		await expect(buildGateway(projectDir)).rejects.toThrow('EISDIR')
	})

	test('the cache lives beside the config, not under DEVFLARE_DIR', async () => {
		const projectDir = createProject()
		const originalGeneratedDir = process.env.DEVFLARE_DIR

		process.env.DEVFLARE_DIR = '.devflare-slot-7'
		try {
			await buildGateway(projectDir)
		} finally {
			if (originalGeneratedDir === undefined) {
				delete process.env.DEVFLARE_DIR
			} else {
				process.env.DEVFLARE_DIR = originalGeneratedDir
			}
		}

		const cacheDir = join(projectDir, '.devflare', 'test-bundles')
		expect(existsSync(cacheDir)).toBe(true)
		expect(readdirSync(cacheDir).filter((name) => name.endsWith('.json'))).toHaveLength(1)
		expect(existsSync(join(projectDir, '.devflare-slot-7'))).toBe(false)
	})

	test('a corrupt cache file rebuilds instead of breaking the run', async () => {
		const projectDir = createProject()
		const first = await buildGateway(projectDir)

		const cacheDir = join(projectDir, '.devflare', 'test-bundles')
		for (const name of readdirSync(cacheDir)) {
			writeFileSync(join(cacheDir, name), '{ truncated')
		}
		__resetDurableObjectBundleCache()

		expect(await buildGateway(projectDir)).toBe(first)
	})
})
