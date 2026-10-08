// =============================================================================
// `cloudflare:workers` in SvelteKit 3's dev server
// =============================================================================
/*
	SvelteKit 3's Cloudflare adapter resolves `cloudflare:workers` in `vite dev`
	to a stub backed by wrangler's `getPlatformProxy()`. devflare resolves it
	first, to the module in `sveltekit/cloudflare-workers-dev.ts`, so the app's
	`env` is the one devflare's handle serves. Why the module is shaped as it is
	is told there; this file only decides WHEN to step in.

	→ Only where the adapter's stub would otherwise answer: a dev server whose
	  config carries the adapter's plugin. A SvelteKit 2 app, a build, and a
	  plain Worker are left exactly as they were.
	→ Only under `devflare dev` (`DEVFLARE_DEV=true`), the same switch that
	  turns devflare's SvelteKit handle on. A plain `vite dev` keeps the
	  adapter's own module, so its bindings still answer there.
	→ Only for an environment that runs in this process. One that runs its
	  modules in workerd (the Cloudflare Vite plugin's) has the real module, and
	  could not reach the state devflare's handle shares through `globalThis`.
*/

import type { ResolvedConfig } from 'vite'

/** The specifier an app imports. */
export const CLOUDFLARE_WORKERS_ID = 'cloudflare:workers'

/** The id devflare resolves it to. */
export const RESOLVED_CLOUDFLARE_WORKERS_DEV = '\0devflare:sveltekit-cloudflare-workers'

/**
 * The plugin `@sveltejs/adapter-cloudflare` 8 adds to resolve `cloudflare:workers`
 * to its dev stub. Its presence is what says the app is on that adapter.
 */
export const ADAPTER_CLOUDFLARE_WORKERS_PLUGIN =
	'vite-plugin-sveltekit-adapter-cloudflare-virtual-workers-module'

/**
 * @description Whether devflare should serve `cloudflare:workers` for this Vite config.
 * @param config - the resolved Vite config
 * @param environmentVariables - the process environment; `DEVFLARE_DEV` is read from it
 * @returns true for a dev server `devflare dev` started, carrying SvelteKit 3's Cloudflare adapter
 */
export function shouldServeCloudflareWorkers(
	config: Pick<ResolvedConfig, 'command' | 'plugins'>,
	environmentVariables: Record<string, string | undefined> = process.env
): boolean {
	return (
		config.command === 'serve' &&
		environmentVariables.DEVFLARE_DEV === 'true' &&
		config.plugins.some((plugin) => plugin.name === ADAPTER_CLOUDFLARE_WORKERS_PLUGIN)
	)
}

/**
 * @description Whether an environment loads its modules in this process, where
 * the state devflare's handle shares is reachable. Vite marks such an environment
 * by giving it a module `runner`.
 * @param environment - the environment resolving the import; absent before Vite 6
 */
export function runsInThisProcess(environment: object | undefined): boolean {
	return environment !== undefined && 'runner' in environment
}
