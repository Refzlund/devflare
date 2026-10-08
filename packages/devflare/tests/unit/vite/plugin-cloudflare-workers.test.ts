// =============================================================================
// When the devflare Vite plugin serves `cloudflare:workers`
// =============================================================================
// Only a dev server carrying SvelteKit 3's Cloudflare adapter, and only for an
// environment that loads its modules in this process. Everything else resolves
// `cloudflare:workers` exactly as it did before devflare knew of SvelteKit 3.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ResolvedConfig } from 'vite'
import { getSvelteKitDevState } from '../../../src/sveltekit/cloudflare-workers-dev'
import { devflarePlugin } from '../../../src/vite/plugin'
import {
	ADAPTER_CLOUDFLARE_WORKERS_PLUGIN,
	RESOLVED_CLOUDFLARE_WORKERS_DEV
} from '../../../src/vite/plugin-cloudflare-workers'

/** A Vite environment that runs modules in this process, as SSR in `vite dev` does. */
const runnableEnvironment = { name: 'ssr', runner: {} }
/** One that runs them elsewhere, as the Cloudflare Vite plugin's workerd environment does. */
const remoteEnvironment = { name: 'ssr' }

type Hook = (this: unknown, ...args: unknown[]) => unknown

/**
 * @description Calls a plugin hook the way Vite would, with `this.environment` set.
 * @param hook - the hook from the plugin object
 * @param environment - the environment Vite would pass
 * @param args - the hook's arguments
 */
function callHook(hook: unknown, environment: object | undefined, ...args: unknown[]) {
	return (hook as Hook).call({ environment }, ...args)
}

describe('the devflare Vite plugin and cloudflare:workers', () => {
	let projectDir: string
	let installedModule: unknown
	let devflareDev: string | undefined

	beforeEach(async () => {
		devflareDev = process.env.DEVFLARE_DEV
		process.env.DEVFLARE_DEV = 'true'
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-cfw-'))
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			"export default { name: 'kit3-app', compatibilityDate: '2026-04-27', files: { fetch: false } }"
		)
		installedModule = getSvelteKitDevState().cloudflareWorkers
	})

	afterEach(async () => {
		if (devflareDev === undefined) delete process.env.DEVFLARE_DEV
		else process.env.DEVFLARE_DEV = devflareDev
		getSvelteKitDevState().cloudflareWorkers = installedModule as undefined
		await rm(projectDir, { recursive: true, force: true })
	})

	/**
	 * @description Resolves the plugin's config the way Vite would, then asks it to
	 * resolve `cloudflare:workers` from the given environment.
	 */
	async function resolveCloudflareWorkers(
		config: { command: 'serve' | 'build'; pluginNames: string[] },
		environment: object | undefined
	) {
		const plugin = devflarePlugin()
		const resolved = {
			root: projectDir,
			command: config.command,
			plugins: config.pluginNames.map((name) => ({ name }))
		} as unknown as ResolvedConfig
		const originalLog = console.log
		console.log = () => {}
		try {
			await callHook(plugin.configResolved, undefined, resolved)
		} finally {
			console.log = originalLog
		}
		return {
			resolvedId: callHook(plugin.resolveId, environment, 'cloudflare:workers'),
			load: (id: string) => callHook(plugin.load, environment, id)
		}
	}

	test("resolves it to devflare's module on a dev server carrying SvelteKit 3's adapter", async () => {
		const { resolvedId, load } = await resolveCloudflareWorkers(
			{ command: 'serve', pluginNames: ['devflare', ADAPTER_CLOUDFLARE_WORKERS_PLUGIN] },
			runnableEnvironment
		)

		expect(resolvedId).toBe(RESOLVED_CLOUDFLARE_WORKERS_DEV)
		expect(await load(RESOLVED_CLOUDFLARE_WORKERS_DEV)).toContain('export const env =')
		expect(getSvelteKitDevState().cloudflareWorkers).toBeDefined()
	})

	test('leaves it to the adapter under a plain `vite dev`, which devflare dev did not start', async () => {
		delete process.env.DEVFLARE_DEV

		const { resolvedId } = await resolveCloudflareWorkers(
			{ command: 'serve', pluginNames: [ADAPTER_CLOUDFLARE_WORKERS_PLUGIN] },
			runnableEnvironment
		)

		expect(resolvedId).toBeNull()
	})

	test('leaves it alone without the adapter, in a build, or in an environment outside this process', async () => {
		const cases = [
			{ command: 'serve' as const, pluginNames: ['devflare'], environment: runnableEnvironment },
			{
				command: 'build' as const,
				pluginNames: [ADAPTER_CLOUDFLARE_WORKERS_PLUGIN],
				environment: runnableEnvironment
			},
			{
				command: 'serve' as const,
				pluginNames: [ADAPTER_CLOUDFLARE_WORKERS_PLUGIN],
				environment: remoteEnvironment
			}
		]

		const resolvedIds: unknown[] = []
		for (const { environment, ...config } of cases) {
			resolvedIds.push((await resolveCloudflareWorkers(config, environment)).resolvedId)
		}

		expect(resolvedIds).toEqual([null, null, null])
	})
})
