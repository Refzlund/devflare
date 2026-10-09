---
"devflare": patch
---

Support SvelteKit 3 and `@cloudflare/workers-types` 5, and move devflare to zod 4 and c12 3.

- **zod 4.** `configSchema`, exported from `devflare` and `devflare/config`, is now a zod 4
  schema, and the published types import zod 4. Code that composes `configSchema` with its own
  zod schemas needs zod 4. Every config validates to the same value as before, and a missing
  `name` still reports "Worker name is required".
- **`@cloudflare/workers-types` 5.** The peer range is now `^4.20260426.1 || ^5.20261008.1`,
  and `devflare init` scaffolds 5.x. The test helpers' `ExecutionContext` (`cf.worker`,
  `cf.queue`, `cf.scheduled`, `cf.tail`, `cf.email`, `createMockTestContext`) has the members 5.x
  declares: `tracing.startSpan()` and `tracing.getActiveSpan()`, which follow the active span
  across awaits as workerd does; `exports`, which throws when you read an export; and `abort()`,
  which throws. The handler runs in-process, so there are no exports to reach and no request to
  abort. `createMockArtifacts` repo handles gain `info()` and the read methods. The hosted Images
  binding, in the test mock and in local dev, throws from `signedUrl()` and
  `createDirectUpload()`, as it does from the rest of the hosted API.
- **SvelteKit 3.** devflare recognises a SvelteKit app whose Cloudflare adapter is configured in
  `vite.config.*` (SvelteKit 3) as well as in `svelte.config.*` (SvelteKit 2). Under
  `devflare dev` with `@sveltejs/adapter-cloudflare` 8, `cloudflare:workers` gives the app the
  `env`, `waitUntil` and `tracing` of the request devflare's handle is serving. Reading `env`
  outside a request throws an error that names the handle. `exports` throws and the `cache`
  methods reject, because both need workerd. In that mode the handle leaves `event.platform` unset, as the
  adapter does in production. SvelteKit 2 apps are unchanged.
- **c12 3.3.4** (was 2.0.4) loads `devflare.config.*` and `devflare.workspace.*`. Left to
  itself, c12 3 under Bun on Windows hands a reload the config from before the edit. devflare
  removes the config file from Bun's module cache after each load, so `devflare dev` still
  picks up an edited config. A module the config imports is not re-read on reload, as before.
- **Dependencies.** devflare no longer declares `citty`, `defu` or `fast-glob`, which it never
  imported. It now requires wrangler `^4.149.0` and miniflare `^5.20261006.1-alpha`, the pair
  released together.
