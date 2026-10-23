/**
 * The environment variable that turns the local-vars overlay off for one process and everything it
 * spawns. Set to `0`, `false`, `no` or `off`, `applyLocalDevVarsToConfig` returns the config unchanged
 * and reads no file, so `vars` are exactly what the config and its `env.NAME` descriptors resolved
 * to. `1`, `true`, `yes`, `on`, empty or unset keep the overlay, and any other value is refused.
 *
 * → KEY: the overlay beats the config. A `.dev.vars` (or wrangler's `.env` fallback) in the app
 *   directory replaces any var the config computed from the process environment. So a launcher that
 *   decides those values itself, such as a test harness pointing a server at its own instance, cannot
 *   hold them while the overlay is on. This is how it holds them.
 * → NOTE: it is read from `process.env` at resolution time, in whichever process resolves the config,
 *   and a Vite child inherits it from `devflare dev`. A workspace manifest's per-app `env` cannot set
 *   it, since `DEVFLARE_` keys are reserved there, so it applies to a whole coordinator.
 * → GOTCHA: it reaches every path that resolves through `resolveDevConfig`, not wrangler's own read.
 *   An app handing `getPluginContext().cloudflareConfig` to `@cloudflare/vite-plugin` serves a worker
 *   whose vars wrangler reads, `.dev.vars` included, and this switch does not touch that.
 * → NOTE: its own module, importing nothing, so the worker-safe `browser.ts` entry can carry it.
 */
export const LOCAL_DEV_VARS_ENV = 'DEVFLARE_LOCAL_DEV_VARS'
