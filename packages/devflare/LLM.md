# Devflare

This file is the truth-first contract for `devflare` as implemented today.

Use it when you are:

- generating code
- reviewing code
- updating docs

Use `Quick start` for the safest defaults, `Trust map` when similar layers are getting mixed together, and `Sharp edges` before documenting advanced behavior. If an example and the implementation disagree, trust the implementation and update the docs.

---

## Quick start: safest supported path

Prefer this shape unless you have a concrete reason not to:

- explicit `files.fetch`
- `src/fetch.ts` as the main HTTP entry
- a named event-first `fetch(event)` or `handle(event)` export
- request-wide middleware via `sequence(...)`
- explicit bindings in config
- `createTestContext()` for core integration tests
- `ref()` for cross-worker composition

```ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
})
```

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function fetch(event: FetchEvent): Promise<Response> {
	return Response.json({
		path: new URL(event.request.url).pathname
	})
}
```

---

## Trust map

### Layers that are easy to confuse

Keep these layers separate until you have a reason to connect them:

1. config-time `process.env`
2. `devflare.config.ts`
3. generated `wrangler.jsonc`
4. runtime Worker `env` bindings
5. local dev/test helpers

The classic mixups are:

- `files.routes` vs top-level `routes`
- `vars` vs `secrets`
- Bun or host `.env*` loading vs runtime secret loading
- config-time `.env*` files vs local runtime `.dev.vars*` files
- Devflare `config.env` overrides vs Wrangler environment blocks
- main-entry `env` vs runtime `env`

### Source of truth vs generated output

Treat these as generated output, not authoring input:

- `.devflare/wrangler.jsonc`
- `.devflare/build/wrangler.jsonc`
- `.devflare/worker-entrypoints/main.ts`
- `.devflare/worker-entrypoints/main.js`
- `.devflare/vite.config.mjs`
- `.wrangler/deploy/config.json`
- `env.d.ts`

The source of truth is still:

- `devflare.config.ts`
- your source files under `src/`
- your tests

If generated output looks wrong, fix the source and regenerate it. Do not hand-edit generated artifacts.

---

## Validation posture and upstream reference anchors

### How to keep this file truthful

This file should be maintained with retrieval-led reasoning, not assumption-led reasoning.

When updating it:

- inspect the current implementation before rewriting claims
- inspect generated output before redefining build or deploy behavior
- inspect workflow files, CLI output, Wrangler-visible state, and browser-visible behavior before claiming end-to-end success
- prefer evidence from source, generated artifacts, runtime behavior, and verified deploy output over inherited examples or stale docs

End-to-end quality matters more than isolated success.

The standard to preserve is:

- authoring config
- local development
- build output
- previewing generated build output
- preview deploys
- production deploys
- workflow automation
- browser reachability
- final validation and re-validation

If upstream docs, repository examples, and implementation ever disagree, trust the current implementation plus current verified runtime behavior, then update the docs.

### Upstream docs this file stays aligned to

These references are the main external anchors behind the deploy, preview, environment, and GitHub Action claims in this file:

- Cloudflare
	- [Preview URLs](https://developers.cloudflare.com/workers/configuration/previews/)
	- [Versions & Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)
	- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
	- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
	- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
	- [Browser Rendering Wrangler reference](https://developers.cloudflare.com/browser-rendering/reference/wrangler/)
	- [Wrangler commands index](https://developers.cloudflare.com/workers/wrangler/commands/)
- GitHub Actions
	- [Creating a composite action](https://docs.github.com/actions/creating-actions/creating-a-composite-action)
	- [Metadata syntax reference](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax)
	- [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
	- [Reusing workflow configurations](https://docs.github.com/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations)
	- [Using secrets in GitHub Actions](https://docs.github.com/actions/security-guides/using-secrets-in-github-actions)
	- [Workflow commands: setting an output parameter](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-output-parameter)

These links are reference anchors, not substitutes for checking the current repo state.

---

## What Devflare is

Devflare is a developer-first layer on top of Cloudflare Workers tooling.

It composes existing tools instead of replacing them:

- **Miniflare** supplies the local Workers runtime
- **Wrangler** supplies deployment config and deploy workflows
- **Vite** participates when the current package opts into Vite-backed mode
- **Bun** is the CLI runtime and affects process-level `.env` loading
- **Devflare** ties those pieces into one authoring model

Core public capabilities today:

- typed config via `defineConfig()`
- compilation from Devflare config into Wrangler-compatible output
- event-first runtime helpers
- request-scoped proxies and per-surface getters
- typed multi-worker references via `ref()`
- local orchestration around Miniflare, Vite, and test helpers
- framework-aware Vite and SvelteKit integration

Devflare is not a replacement runtime. It is a higher-level developer system that sits on top of the Cloudflare ecosystem.

The shortest truthful mental model is:

- **Vite** is the optional outer app/framework host. Devflare runs it when the current package has a local `vite.config.*` or a non-empty `config.vite`, and Devflare merges that config into the actual Vite config it executes.
- **Rolldown** is the inner builder Devflare uses when Devflare itself needs to transform Worker source into runnable Worker modules. Today that covers worker-only main-worker bundles and Durable Object bundles.

### Authoring model

A **surface** is a distinct handler or entry file that Devflare treats as its own concern. The common surfaces are:

- HTTP via `src/fetch.ts`
- queue consumers via `src/queue.ts`
- scheduled handlers via `src/scheduled.ts`
- incoming email via `src/email.ts`
- Durable Objects via `do.*.ts`
- WorkerEntrypoints via `ep.*.ts`
- workflows via `wf.*.ts`
- custom transport definitions via `src/transport.ts`

Prefer one responsibility per file unless you have a strong reason to combine surfaces. That keeps runtime behavior, testing, and multi-worker composition easier to reason about.

---

## Package entrypoints

Use the narrowest import path that matches where the code runs.

| Import | Use it for | Practical rule |
|---|---|---|
| `devflare` | main package entrypoint | config helpers, `ref()`, `workerName`, the main-entry `env`, and selected Node-side helpers |
| `devflare/config` | config files | lightweight config-only helpers such as `defineConfig()` for `devflare.config.*`; this is the import path used by `devflare init` templates |
| `devflare/runtime` | handler/runtime code | event types, middleware, strict `env` / `ctx` / `event` / `locals`, and per-surface getters |
| `devflare/test` | tests | `createTestContext()`, `cf.*`, and test helpers |
| `devflare/vite` | Vite integration | explicit Vite-side helpers |
| `devflare/sveltekit` | SvelteKit integration | SvelteKit-facing helpers |
| `devflare/cloudflare` | Cloudflare account and resource helpers | account/resource/usage helpers |
| `devflare/decorators` | decorators only | `durableObject()` and related decorator utilities |

### `devflare` vs `devflare/runtime`

Default rule:

1. use handler parameters first
2. use `devflare/runtime` in helpers that run inside a live handler trail
3. use the main `devflare` entry when you specifically want the fallback-friendly `env`

`import { env } from 'devflare/runtime'` is strict request-scoped access. It works only while Devflare has established an active handler context.

`import { env } from 'devflare'` is the main-entry proxy. It prefers active handler context and can also fall back to test or bridge-backed context when no live request is active.

Practical example:

```ts
// worker code
import { env, locals, type FetchEvent } from 'devflare/runtime'

export async function fetch(event: FetchEvent<DevflareEnv>): Promise<Response> {
	const pathname = new URL(event.request.url).pathname
	locals.startedAt = Date.now()

	const cached = await env.CACHE.get(pathname)
	if (cached) {
		return new Response(cached, {
			headers: {
				'x-cache': 'hit'
			}
		})
	}

	return new Response(`miss:${pathname}`)
}
```

```ts
// test or bridge code
import { env } from 'devflare'
import { createTestContext } from 'devflare/test'

await createTestContext()
await env.CACHE.put('health', 'ok')
```

### Worker-safe caveat for the main entry

`devflare/runtime` is the explicit worker-safe runtime entry and should be the default teaching path for worker code.

The main `devflare` entry can also resolve to a worker-safe bundle when the resolver selects the package `browser` condition. Treat that as a compatibility detail, not as a signal that the main entry is the best place to import runtime helpers.

In that worker-safe main bundle:

- the browser-safe subset of the main entry remains usable
- Node-side APIs such as config loading, CLI helpers, Miniflare orchestration, and test-context setup are not available and intentionally throw if called

If you need `ctx`, `event`, `locals`, middleware, or per-surface getters, import them from `devflare/runtime`.

---

## Runtime and HTTP model

### Event-first handlers are the public story

Fresh Devflare code should be event-first. Use shapes like:

- `fetch(event: FetchEvent)`
- `queue(event: QueueEvent)`
- `scheduled(event: ScheduledEvent)`
- `email(event: EmailEvent)`
- `tail(event: TailEvent)` when you are wiring a tail surface
- Durable Object handlers with their matching event types

These event types augment native Cloudflare inputs rather than replacing them with unrelated wrappers.

| Event type | Also behaves like | Convenience fields |
|---|---|---|
| `FetchEvent` | `Request` | `request`, `env`, `ctx`, `params`, `locals`, `type` |
| `QueueEvent` | `MessageBatch<T>` | `batch`, `env`, `ctx`, `locals`, `type` |
| `ScheduledEvent` | `ScheduledController` | `controller`, `env`, `ctx`, `locals`, `type` |
| `EmailEvent` | `ForwardableEmailMessage` | `message`, `env`, `ctx`, `locals`, `type` |
| `TailEvent` | `TraceItem[]` | `events`, `env`, `ctx`, `locals`, `type` |
| `DurableObjectFetchEvent` | `Request` | `request`, `env`, `ctx`, `state`, `locals`, `type` |
| `DurableObjectAlarmEvent` | event object only | `env`, `ctx`, `state`, `locals`, `type` |
| `DurableObjectWebSocketMessageEvent` | `WebSocket` | `ws`, `message`, `env`, `ctx`, `state`, `locals`, `type` |
| `DurableObjectWebSocketCloseEvent` | `WebSocket` | `ws`, `code`, `reason`, `wasClean`, `env`, `ctx`, `state`, `locals`, `type` |
| `DurableObjectWebSocketErrorEvent` | `WebSocket` | `ws`, `error`, `env`, `ctx`, `state`, `locals`, `type` |

On worker surfaces, `event.ctx` is the current `ExecutionContext`.

On Durable Object surfaces, `event.ctx` is the current `DurableObjectState`, and Devflare also exposes it as `event.state` for clarity.

### Runtime access: parameters, getters, and proxies

Prefer runtime access in this order:

1. handler parameters such as `fetch(event: FetchEvent)`
2. per-surface getters when a deeper helper needs the current concrete surface
3. generic runtime proxies when surface-agnostic access is enough

Devflare carries the active event through the current handler call trail, so deeper helpers can recover the current surface without manually threading arguments.

Proxy semantics:

- `env`, `ctx`, and `event` from `devflare/runtime` are readonly
- `locals` is the mutable request-scoped storage object
- `event.locals` and `locals` point at the same underlying object
- strict runtime helpers throw when there is no active Devflare-managed context

Per-surface getters:

- worker surfaces: `getFetchEvent()`, `getQueueEvent()`, `getScheduledEvent()`, `getEmailEvent()`, `getTailEvent()`
- Durable Object surfaces: `getDurableObjectEvent()`, `getDurableObjectFetchEvent()`, `getDurableObjectAlarmEvent()`
- Durable Object WebSocket surfaces: `getDurableObjectWebSocketMessageEvent()`, `getDurableObjectWebSocketCloseEvent()`, `getDurableObjectWebSocketErrorEvent()`

Every getter also exposes `.safe()`, which returns `null` instead of throwing.

Practical example:

```ts
import { getFetchEvent, locals, type FetchEvent } from 'devflare/runtime'

function currentPath(): string {
	return new URL(getFetchEvent().request.url).pathname
}

export async function fetch(event: FetchEvent): Promise<Response> {
	locals.requestId = crypto.randomUUID()

	return Response.json({
		path: currentPath(),
		requestId: String(locals.requestId),
		requestUrl: getFetchEvent.safe()?.request.url ?? null,
		method: event.request.method
	})
}
```

### Manual context helpers are advanced/internal

Normal Devflare application code should **not** need `runWithEventContext()` or `runWithContext()`.

Devflare establishes the active event/context automatically before invoking user code in the flows developers normally use:

- generated worker entrypoints for `fetch`, `queue`, `scheduled`, and `email`
- Durable Object wrappers
- HTTP middleware and route resolution
- `createTestContext()` helpers such as `cf.worker`, `cf.queue`, `cf.scheduled`, `cf.email`, and `cf.tail`

That means getters like `getQueueEvent()`, `getScheduledEvent()`, `getEmailEvent()`, and `getDurableObjectFetchEvent()` should work inside ordinary handlers without manual wrapping.

Keep these helpers in the "advanced escape hatch" bucket:

- `runWithEventContext(event, fn)` preserves the exact event you provide
- `runWithContext(env, ctx, request, fn, type)` is a lower-level compatibility helper

Important difference:

- `runWithContext()` only synthesizes rich augmented events for `fetch` and `durable-object-fetch` when a `Request` is available
- if you are manually constructing a non-fetch surface and truly need per-surface getters outside normal Devflare-managed entrypoints, `runWithEventContext()` is the correct low-level helper

### HTTP entry, middleware, and method handlers

Think of the built-in HTTP path today as:

`src/fetch.ts` request-wide entry → same-module method handlers → matched `src/routes/**` leaf module

When the HTTP surface matters to build or deploy output, prefer making it explicit in config:

```ts
files: {
	fetch: 'src/fetch.ts'
}
```

The file router is enabled automatically when a `src/routes` directory exists, unless you set `files.routes: false`.
Use `files.routes` when you want to change the route root or mount it under a prefix.

Supported primary entry shapes today:

- `export async function fetch(...) { ... }`
- `export const fetch = ...`
- `export const handle = ...`
- `export default async function (...) { ... }`
- `export default { fetch(...) { ... } }`
- `export default { handle(...) { ... } }`

`fetch` and `handle` are aliases for the same primary HTTP entry. Export one or the other, not both.

When this document says a `handle` export here, it means the primary fetch export name, not the legacy `handle(...handlers)` helper.

Request-wide middleware belongs in `src/fetch.ts` and composes with `sequence(...)`.

```ts
import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'

async function authHandle(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	if (!event.request.headers.get('authorization')) {
		return new Response('Unauthorized', { status: 401 })
	}

	return resolve(event)
}

async function appFetch({ request }: FetchEvent): Promise<Response> {
	return new Response(new URL(request.url).pathname)
}

export const handle = sequence(authHandle, appFetch)
```

`sequence(...)` uses the usual nested middleware flow:

1. outer middleware before `resolve(event)`
2. inner middleware before `resolve(event)`
3. downstream leaf handler
4. inner middleware after `resolve(event)`
5. outer middleware after `resolve(event)`

Same-module method exports are real runtime behavior:

- method handlers such as `GET`, `POST`, and `ALL` are supported in the fetch module
- if `HEAD` is not exported, it falls back to `GET` with an empty body
- this is same-module dispatch, not file-system routing
- if a module exports a primary `fetch` or `handle` entry and also exports method handlers, the method handlers are the downstream leaf handlers reached through `resolve(event)`
- if no primary `fetch` or `handle` exists, Devflare can still dispatch directly to same-module method handlers

### Routing today

`src/routes/**` is now a real built-in router.

Default behavior:

- if `src/routes` exists, Devflare discovers it automatically
- `files.routes.dir` changes the route root
- `files.routes.prefix` mounts the discovered routes under a fixed prefix such as `/api`
- `files.routes: false` disables file-route discovery

Filename conventions:

- `index.ts` → directory root
- `[id].ts` → single dynamic segment
- `[...slug].ts` → rest segment, one or more path parts
- `[[...slug]].ts` → optional rest segment, including the directory root
- files or directories beginning with `_` are ignored so route-local helpers can live beside handlers

Dispatch semantics:

- route params are populated on `event.params`
- route modules use the same handler forms as fetch modules: HTTP method exports, primary `fetch`, or primary `handle`
- if `src/fetch.ts` exports same-module `GET` / `POST` / `ALL` handlers, those run before the file router for matching methods
- for route-tree apps, keep `src/fetch.ts` focused on request-wide middleware and whole-app concerns
- `resolve(event)` from the primary fetch module falls through to the matched route module when no same-module method handler responded

| Key | What it means today | What it does not do |
|---|---|---|
| `files.routes` | built-in file router configuration for `src/routes/**` discovery, custom route roots, and optional prefixes | it does not replace top-level Cloudflare deployment `routes` |
| top-level `routes` | Cloudflare deployment route patterns such as `example.com/*`, compiled into generated Wrangler config | it does not choose handlers inside your app |
| `wsRoutes` | dev-only WebSocket proxy rules that forward matching local upgrade requests to Durable Objects | it does not replace deployment `routes` or act as general HTTP app routing |

Practical route-tree example:

```ts
// devflare.config.ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: 'api-worker',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
})
```

```ts
// src/fetch.ts
import { sequence } from 'devflare/runtime'

export const handle = sequence(async (event, resolve) => {
	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('x-user-id', event.params.id ?? 'none')
	return next
})
```

```ts
// src/routes/users/[id].ts
import type { FetchEvent } from 'devflare/runtime'

export async function GET({ params }: FetchEvent): Promise<Response> {
	return Response.json({ id: params.id })
}
```

```ts
// GET /api/users/123
// -> { "id": "123" }
// and x-user-id: 123
```

---

## Configuration and compilation

### Stable config flow

This is the stable public flow for Devflare config:

1. write `devflare.config.*` and export it with `defineConfig()`
2. Devflare loads the base config
3. if you select an environment, Devflare merges `config.env[name]` into the base config
4. Devflare compiles the resolved config into Wrangler-compatible output
5. commands such as `dev`, `build`, `deploy`, and `types` use that resolved config for their own work

Current implementation note: Devflare validates config against its schema before compilation, and some commands write generated `wrangler.jsonc` files as build artifacts. Treat generated Wrangler config as output, not source of truth.

### Generated artifacts and `doctor`

Generated output currently lands in these paths:

- `.devflare/wrangler.jsonc` for the Devflare-generated dev/Vite-facing Wrangler config
- `.devflare/build/wrangler.jsonc` for the generated deploy/build Wrangler config
- `.wrangler/deploy/config.json` as Wrangler's deploy redirect pointing at the generated deploy config
- `.devflare/worker-entrypoints/main.ts` when Devflare composes multiple worker surfaces into a generated main entry
- `.devflare/worker-entrypoints/main.js` when Devflare bundles that composed entry for worker-only build/deploy flows
- `.devflare/vite.config.mjs` when Devflare needs a generated Vite wrapper config

Treat all of those as outputs.

Current `doctor` expectations are aligned to that artifact contract:

- it checks for the nearest supported `devflare.config.*`
- it warns when `.devflare/wrangler.jsonc` has not been generated yet
- it warns when `.devflare/build/wrangler.jsonc` has not been generated yet
- it warns when `.wrangler/deploy/config.json` has not been generated yet
- it reports whether the current package is running in worker-only mode or Vite-backed mode

### D1 by name, resolution modes, and resolved config reuse

`bindings.d1` currently accepts three shapes:

- `DB: 'database-name'`
- `DB: { id: 'database-id' }`
- `DB: { name: 'database-name' }`

That split is intentional.

- string shorthand is the stable-name form and is equivalent to `{ name: 'database-name' }`
- `{ id }` is the explicit concrete Cloudflare id form
- string and `{ name }` keep stable naming in `devflare.config.*` and let Devflare resolve the opaque id later

Current resolution behavior is part of the contract:

- local dev and `createTestContext()` use a stable local identifier derived from `id ?? name`, so D1-by-name does **not** require Cloudflare auth for local work
- `build`, `deploy`, `devflare/vite`, and `devflare config print` resolve string and `{ name }` bindings into a real Cloudflare D1 id before they emit Wrangler-facing config
- `compileConfig()` can only emit Wrangler `d1_databases` from concrete ids, so callers using string or `{ name }` bindings should first call `loadResolvedConfig()` or `resolveConfigResources()`

That is the key separation to preserve when documenting or generating code:

- stable non-secret resource names belong in config
- opaque provider ids belong in resolved/generated output
- secret values still belong in `secrets`, Cloudflare secrets, or host-provided env inputs

Public Node-side reuse path:

- `loadResolvedConfig()` loads config, applies `config.env[name]`, and resolves D1-by-name bindings
- `resolveConfigResources()` resolves an already-loaded config object
- `resolveConfigForLocalRuntime()` materializes the local-runtime shape without remote lookup
- `devflare config print --json` and `devflare config print --format wrangler` expose the same resolved data from the CLI

### Supported config files and `defineConfig()`

Supported config filenames:

- `devflare.config.ts`
- `devflare.config.mts`
- `devflare.config.js`
- `devflare.config.mjs`

Use a plain object when your config is static. Use a sync or async function when you need to compute values from `process.env`, the selected environment, or project state.

```ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: 'api-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	},
	vars: {
		APP_NAME: 'api-worker'
	}
})
```

TypeScript note: `defineConfig<T>()` is an advanced typing helper. It is mainly useful when you want stronger `ref()` and entrypoint inference after `env.d.ts` exists.

### Top-level keys

Most projects only need a small set of config keys at first. Start with `name`, `compatibilityDate`, `files`, and the `bindings`, `vars`, `secrets`, `triggers`, `routes`, or `env` your worker actually needs.

Current defaults worth knowing:

- `compatibilityDate` defaults to the current date when omitted
- current default compatibility flags include `nodejs_compat` and `nodejs_als`
- branch-scoped preview deploys omit cron triggers unless `previews.includeCrons` is `true`

Common keys:

| Key | Use it for |
|---|---|
| `name` | Worker name |
| `compatibilityDate` | Workers compatibility date |
| `compatibilityFlags` | Workers compatibility flags |
| `previews` | preview-specific Devflare behavior such as whether branch-scoped preview deploys keep cron triggers |
| `files` | explicit handler paths and discovery globs |
| `bindings` | Cloudflare bindings |
| `triggers` | scheduled trigger config |
| `vars` | non-secret string bindings |
| `secrets` | secret binding declarations |
| `routes` | Cloudflare deployment routes |
| `env` | environment overrides merged before compile |

Secondary keys:

| Key | Use it for |
|---|---|
| `accountId` | account selection for remote and deploy flows |
| `observability` | Workers observability settings |
| `migrations` | Durable Object migrations |
| `assets` | static asset config |
| `limits` | worker limits |
| `wsRoutes` | local WebSocket proxy rules for dev |
| `vite` | inline Vite config for Devflare-run Vite flows |
| `rolldown` | Devflare-owned Worker bundler options |
| `wrangler.passthrough` | raw Wrangler overrides after compile |

### Complete config property reference

Treat this as the exhaustive property checklist for `defineConfig({...})`. The later sections explain behavior in narrative form; this section answers “what keys exist right now, what shape do they accept, and what do they control?”

#### Root properties

| Property | Shape | Required | Current behavior |
|---|---|---|---|
| `name` | `string` | yes | Worker name compiled to Wrangler `name`. It is also the base name used for generated auxiliary DO workers (`${name}-do`) when Devflare creates one. |
| `accountId` | `string` | no | Compiled to Wrangler `account_id`. Most relevant for deploy flows and remote-oriented bindings such as AI and Vectorize. Not currently supported inside `config.env`. |
| `compatibilityDate` | `string` (`YYYY-MM-DD`) | no | Compiled to Wrangler `compatibility_date`. Defaults to the current date when omitted. |
| `compatibilityFlags` | `string[]` | no | Additional Workers compatibility flags. Devflare also forces `nodejs_compat` and `nodejs_als`. |
| `previews` | `{ includeCrons?: boolean }` | no | Devflare preview-behavior controls. Branch-scoped preview deploys omit cron triggers unless `includeCrons` is set to `true`. |
| `files` | object | no | Explicit surface file paths and discovery globs. Use this when a surface matters to generated output. |
| `bindings` | object | no | Cloudflare binding declarations. These compile to Wrangler binding sections and also drive generated typing. |
| `triggers` | object | no | Scheduled trigger configuration such as cron expressions. |
| `vars` | `Record<string, string>` | no | Non-secret runtime bindings compiled into Wrangler `vars`. |
| `secrets` | `Record<string, { required?: boolean }>` | no | Secret declarations only. Values do not live here. |
| `routes` | `Array<{ pattern; zone_name?; zone_id?; custom_domain? }>` | no | Cloudflare deployment routes. This is separate from the built-in file router. |
| `wsRoutes` | `Array<{ pattern; doNamespace; idParam?; forwardPath? }>` | no | Dev-only WebSocket proxy rules that forward matching upgrade requests to Durable Objects. Not compiled into Wrangler config. |
| `assets` | `{ directory: string; binding?: string }` | no | Static asset directory config compiled into Wrangler `assets`. |
| `limits` | `{ cpu_ms?: number }` | no | Worker execution limits compiled into Wrangler `limits`. |
| `observability` | `{ enabled?: boolean; head_sampling_rate?: number }` | no | Workers observability and sampling config compiled into Wrangler `observability`. |
| `migrations` | `Migration[]` | no | Durable Object migration history compiled into Wrangler `migrations`. |
| `rolldown` | object | no | Rolldown builder configuration for Devflare's own code-transformation path across worker-only main-worker bundles and Durable Object bundles. This is not a replacement for the main Vite app build. |
| `vite` | object | no | Inline Vite config merged into the actual Vite config Devflare runs. A local `vite.config.*` remains optional and is merged first when present. |
| `env` | `Record<string, EnvOverride>` | no | Named environment overlays merged into the base config before compile/build/deploy. |
| `wrangler` | `{ passthrough?: Record<string, unknown> }` | no | Escape hatch for unsupported Wrangler keys, merged after native Devflare compile. |
| `build` | object | legacy | Deprecated alias normalized into `rolldown`. Keep accepting it for compatibility; teach `rolldown` in new docs. |
| `plugins` | `unknown[]` | legacy | Deprecated alias normalized into `vite.plugins`. Raw Vite plugin wiring still belongs in `vite.config.*`. |

#### `files`

`files` is where Devflare discovers or pins the files that make up your worker surfaces.

| Key | Shape | Default or convention | Meaning |
|---|---|---|---|
| `fetch` | `string \| false` | `src/fetch.ts` when present | Main HTTP entry. Keep this explicit when build or deploy output depends on it. |
| `queue` | `string \| false` | `src/queue.ts` when present | Queue consumer surface. |
| `scheduled` | `string \| false` | `src/scheduled.ts` when present | Scheduled/cron surface. |
| `email` | `string \| false` | `src/email.ts` when present | Inbound email surface. |
| `durableObjects` | `string \| false` | `**/do.*.{ts,js}` | Discovery glob for Durable Object classes. Respects `.gitignore`. |
| `entrypoints` | `string \| false` | `**/ep.*.{ts,js}` | Discovery glob for `WorkerEntrypoint` classes. Respects `.gitignore`. |
| `workflows` | `string \| false` | `**/wf.*.{ts,js}` | Discovery glob for workflow classes. Respects `.gitignore`. |
| `routes` | `{ dir: string; prefix?: string } \| false` | `src/routes` when that directory exists | Built-in route-tree config. `dir` changes the route root; `prefix` mounts it under a static pathname prefix such as `/api`; `false` disables route discovery. |
| `transport` | `string \| null` | `src/transport.{ts,js,mts,mjs}` when present | Custom serialization transport file. The file must export a named `transport` object. Set `null` to disable autodiscovery explicitly. |

Current `files` rules worth keeping explicit:

- `compileConfig()` only writes Wrangler `main` when `files.fetch` is explicit
- higher-level `build`, `deploy`, and `devflare/vite` flows may still generate a composed `.devflare/worker-entrypoints/main.ts` when multiple surfaces must be stitched together
- `wrangler.passthrough.main` opts out of that composed-entry generation path
- `createTestContext()` and local dev can still auto-discover conventional files even when you omit them from config

#### `bindings`

`bindings` groups Cloudflare service bindings by kind.

| Key | Shape | Meaning |
|---|---|---|
| `kv` | `Record<string, string>` | KV namespace binding name → namespace id |
| `d1` | `Record<string, string \| { id: string } \| { name: string }>` | D1 binding name → stable database name or explicit database id |
| `r2` | `Record<string, string>` | R2 binding name → bucket name |
| `durableObjects` | `Record<string, string \| { className: string; scriptName?: string }>` | Durable Object namespace binding. String form is shorthand for `{ className }`. Object form also covers cross-worker DOs and `ref()`-driven bindings. |
| `queues` | `{ producers?: Record<string, string>; consumers?: QueueConsumer[] }` | Queue producer bindings plus consumer settings |
| `services` | `Record<string, { service: string; environment?: string; entrypoint?: string }>` | Worker service bindings. `ref().worker` and `ref().worker('Entrypoint')` normalize here. |
| `ai` | `{ binding: string }` | Workers AI binding |
| `vectorize` | `Record<string, { indexName: string }>` | Vectorize index bindings |
| `hyperdrive` | `Record<string, string \| { id: string } \| { name: string }>` | Hyperdrive binding name → stable Hyperdrive config name or explicit config id |
| `browser` | `Record<string, string>` | Browser Rendering named-map binding. Devflare currently allows exactly one entry because Wrangler only supports a single browser binding. |
| `analyticsEngine` | `Record<string, { dataset: string }>` | Analytics Engine dataset bindings |
| `sendEmail` | `Record<string, { destinationAddress?: string; allowedDestinationAddresses?: string[]; allowedSenderAddresses?: string[] }>` | Outbound email bindings |

Queue consumer objects currently support:

| Field | Shape | Meaning |
|---|---|---|
| `queue` | `string` | Queue name to consume |
| `maxBatchSize` | `number` | Max messages per batch |
| `maxBatchTimeout` | `number` | Max seconds to wait for a batch |
| `maxRetries` | `number` | Max retry attempts |
| `deadLetterQueue` | `string` | Queue for permanently failed messages |
| `maxConcurrency` | `number` | Max concurrent batch invocations |
| `retryDelay` | `number` | Delay between retries in seconds |

Two `bindings` details that matter in practice:

- `bindings.sendEmail` must use either `destinationAddress` or `allowedDestinationAddresses`, not both
- `bindings.durableObjects.*.scriptName` is how you point a binding at another worker when the class does not live in the main worker bundle
- `bindings.d1.*.{ name }` is the stable-name form; local runtime uses the name directly, while Wrangler-facing flows must resolve it to a real Cloudflare id first
- `bindings.hyperdrive.*` supports the same stable-name pattern as D1; local runtime uses the name directly, while Wrangler-facing flows must resolve it to a real Hyperdrive configuration id first
- `bindings.browser` uses a named-map DX such as `browser: { BROWSER: 'browser' }`, but current compile/deploy flows only accept exactly one browser binding and compile it down to Wrangler's single `browser: { binding: 'BROWSER' }` shape

#### `triggers`, `routes`, and `wsRoutes`

| Property | Shape | Current behavior |
|---|---|---|
| `triggers.crons` | `string[]` | Cloudflare cron expressions compiled into Wrangler `triggers.crons` |
| `routes[].pattern` | `string` | Deployment route pattern such as `example.com/*` |
| `routes[].zone_name` | `string` | Optional zone association |
| `routes[].zone_id` | `string` | Optional zone association alternative to `zone_name` |
| `routes[].custom_domain` | `boolean` | Mark route as a custom domain |
| `wsRoutes[].pattern` | `string` | Local URL pattern to intercept for WebSocket upgrades |
| `wsRoutes[].doNamespace` | `string` | Target Durable Object namespace binding name |
| `wsRoutes[].idParam` | `string` | Query parameter used to pick the DO instance. Defaults to `'id'`. |
| `wsRoutes[].forwardPath` | `string` | Path forwarded inside the DO. Defaults to `'/websocket'`. |

Remember the split:

- `files.routes` is app routing
- top-level `routes` is Cloudflare deployment routing
- `wsRoutes` is local dev-time WebSocket proxy routing for Durable Objects

#### `vars` and `secrets`

| Property | Shape | Current behavior |
|---|---|---|
| `vars` | `Record<string, string>` | Non-secret runtime bindings compiled into Wrangler `vars` |
| `secrets` | `Record<string, { required?: boolean }>` | Secret declarations only. `required` defaults to `true`. Values must come from Cloudflare secrets, tests, or upstream local tooling. |

#### `assets`, `limits`, and `observability`

| Property | Shape | Current behavior |
|---|---|---|
| `assets.directory` | `string` | Required asset directory path |
| `assets.binding` | `string` | Optional asset binding name for programmatic access |
| `limits.cpu_ms` | `number` | Optional CPU limit for unbound workers |
| `observability.enabled` | `boolean` | Enable Worker Logs |
| `observability.head_sampling_rate` | `number` | Log sampling rate from `0` to `1` |

#### `migrations`

Each migration object has this shape:

| Field | Shape | Meaning |
|---|---|---|
| `tag` | `string` | Required migration version label |
| `new_classes` | `string[]` | Newly introduced DO classes |
| `renamed_classes` | `Array<{ from: string; to: string }>` | DO class renames with state preservation |
| `deleted_classes` | `string[]` | Deleted DO classes |
| `new_sqlite_classes` | `string[]` | DO classes migrating to SQLite storage |

#### `rolldown`

`rolldown` config applies to Devflare's own Worker bundling outputs.

| Key | Shape | Current behavior |
|---|---|---|
| `target` | `string` | Accepted for compatibility and normalized from legacy config, but currently ignored by the worker bundler |
| `minify` | `boolean` | Minify Devflare-owned Worker bundles |
| `sourcemap` | `boolean` | Emit source maps for Devflare-owned Worker bundles |
| `options` | `DevflareRolldownOptions` | Additional Rolldown input/output options and plugins, minus Devflare-owned fields |

Current `rolldown.options` ownership rules:

- Devflare owns `cwd`, `input`, `platform`, and `watch`
- Devflare also owns output `codeSplitting`, `dir`, `file`, `format`, and `inlineDynamicImports`
- output stays single-file ESM so Devflare's worker-owned bundles remain worker-friendly
- `rolldown.options.plugins` is the intended extension point for custom transforms and Rollup-compatible plugins

#### `vite`

`vite` is Devflare's inline Vite config namespace. When Devflare runs Vite, this object is merged into the actual Vite config that Vite receives.

| Key | Shape | Current behavior |
|---|---|---|
| `plugins` | `unknown[]` | Accepted by the schema and normalized from the legacy top-level `plugins` alias, then merged into the actual Vite plugin chain when Devflare runs Vite |
| any other key | `unknown` | Passed through as actual Vite config when Devflare runs Vite |

That distinction is intentional:

- use `config.vite` when you want Devflare config to be your Vite config source of truth
- keep `vite.config.ts` when you prefer a standalone Vite config file or need advanced programmatic control
- if both exist, Devflare merges `vite.config.*` first, then `config.vite`, and injects `devflarePlugin()` into the resulting config
- use `devflare/vite` helpers when Devflare needs to participate in the Vite pipeline programmatically

#### `env`

`env` is `Record<string, EnvOverride>`, where each environment can currently override these keys:

- `name`
- `compatibilityDate`
- `compatibilityFlags`
- `previews`
- `files`
- `bindings`
- `triggers`
- `vars`
- `secrets`
- `routes`
- `assets`
- `limits`
- `observability`
- `migrations`
- `rolldown`
- `vite`
- `wrangler`
- deprecated `build`
- deprecated `plugins`

Current exclusions still matter:

- `accountId` is not supported inside `env`
- `wsRoutes` is not supported inside `env`
- nested `env` blocks are not part of the override shape

Merge behavior is also part of the contract:

- scalars override base values
- nested objects merge
- arrays append instead of replacing
- `null` and `undefined` do not delete inherited values

#### `wrangler`

`wrangler` currently exposes one native child key:

| Key | Shape | Current behavior |
|---|---|---|
| `passthrough` | `Record<string, unknown>` | Shallow-merged on top of the compiled Wrangler config. Use this for unsupported Wrangler keys or to take full ownership of `main`. |

#### Deprecated aliases

| Legacy key | Current canonical key | Notes |
|---|---|---|
| `build.target` | `rolldown.target` | Deprecated and still normalized, but the current worker bundler ignores the resulting `target` value |
| `build.minify` | `rolldown.minify` | Deprecated but still normalized |
| `build.sourcemap` | `rolldown.sourcemap` | Deprecated but still normalized |
| `build.rolldownOptions` | `rolldown.options` | Deprecated but still normalized |
| `plugins` | `vite.plugins` | Deprecated top-level alias; raw Vite plugin wiring still belongs in `vite.config.*` |

### Native config coverage vs `wrangler.passthrough`

Devflare natively models the common Worker config it actively composes around. It does **not** try to mirror every Wrangler field one-by-one as a first-class Devflare schema key.

Use `wrangler.passthrough` for unsupported Wrangler options.

Current merge order is:

1. compile native Devflare config
2. shallow-merge `wrangler.passthrough` on top
3. if the same key exists in both places, the passthrough value wins

Practical example:

```ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: 'advanced-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	wrangler: {
		passthrough: {
			placement: {
				mode: 'smart'
			}
		}
	}
})
```

Two practical rules:

- if you want Devflare-managed entry composition, keep using `files.fetch`, `files.routes`, and related surface config, and do **not** set `wrangler.passthrough.main`
- if you want total control of the Worker `main` entry, set `wrangler.passthrough.main` and own that entry file yourself

### `files`

`files` tells Devflare where your surfaces live. Use explicit paths for any surface that matters to build or deploy output, especially `files.fetch`.

| Key | Shape | Default convention | Meaning |
|---|---|---|---|
| `fetch` | <code>string &#124; false</code> | `src/fetch.ts` | main HTTP handler |
| `queue` | <code>string &#124; false</code> | `src/queue.ts` | queue consumer handler |
| `scheduled` | <code>string &#124; false</code> | `src/scheduled.ts` | scheduled handler |
| `email` | <code>string &#124; false</code> | `src/email.ts` | incoming email handler |
| `durableObjects` | <code>string &#124; false</code> | `**/do.*.{ts,js}` | Durable Object discovery glob |
| `entrypoints` | <code>string &#124; false</code> | `**/ep.*.{ts,js}` | WorkerEntrypoint discovery glob |
| `workflows` | <code>string &#124; false</code> | `**/wf.*.{ts,js}` | workflow discovery glob |
| `routes` | <code>{ dir, prefix? } &#124; false</code> | `src/routes` when that directory exists | built-in file router configuration |
| `transport` | <code>string &#124; null</code> | `src/transport.{ts,js,mts,mjs}` when one of those files exists | custom transport definition file |

Discovery does not behave identically in every subsystem:

- local dev and `createTestContext()` can fall back to conventional handler files when present
- local dev, `createTestContext()`, and higher-level worker-entry generation also auto-discover `src/routes/**` unless `files.routes` is `false`
- type generation and discovery use default globs for Durable Objects, entrypoints, and workflows
- `compileConfig()` only writes Wrangler `main` when `files.fetch` is explicit
- higher-level `build`, `deploy`, and `devflare/vite` flows may still generate a composed `.devflare/worker-entrypoints/main.ts`, including route trees
- `wrangler.passthrough.main` disables that composed-entry generation path

Safe rule: if a surface matters to build or deploy output, declare it explicitly even if another subsystem can discover it by convention.

Practical example:

```ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: 'multi-surface-worker',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		},
		durableObjects: 'src/do/**/*.ts',
		entrypoints: 'src/rpc/**/*.ts',
		workflows: 'src/workflows/**/*.ts'
	}
})
```

`files.transport` is convention-first. `createTestContext()` auto-loads `src/transport.{ts,js,mts,mjs}` when present, a string value points at a different transport file, and `files.transport: null` disables transport loading explicitly. The file must export a named `transport` object.

There is no public `files.tail` config key today.

### `.env`, `.dev.vars`, `vars`, `secrets`, and `config.env`

Keep these layers separate:

| Layer | Holds values? | Compiled into generated config? | Use it for |
|---|---|---|---|
| `.env` / `process.env` | yes | indirectly, only when your config reads from it | local process-time inputs |
| `.env.dev` / `.env.<name>` | tool/runtime-dependent | indirectly at most, only if the surrounding tool has already populated `process.env` | local process-time variants, not a Devflare-native contract |
| `.dev.vars` / `.dev.vars.<name>` | yes | no | local runtime secret/value files in upstream Cloudflare tooling when applicable |
| `vars` | yes | yes | non-secret string bindings |
| `secrets` | no, declaration only | no | required/optional runtime secret bindings |
| `config.env` | yes, as config overlays | yes after merge | environment-specific config overrides |

#### `.env`, `.env.dev`, and process env

`loadConfig()` loads the nearest workspace-root `.env` before evaluating `devflare.config.*`. When Devflare finds an ancestor `package.json` with `workspaces`, it uses that directory's `.env` as the shared config-time source for nested packages. If no workspace root is found, it falls back to the nearest ancestor `.env`. Explicit process env values still win.

Important boundary:

- Devflare still sets `dotenv: false` in the underlying c12 config loader after it has already populated `process.env` from the shared `.env`
- Devflare does **not** define special first-class semantics for `.env.dev` or `.env.<name>`
- config-time/build-time code can still read `process.env` inside `defineConfig()` or other Node-side tooling

Treat `.env*` files as **config/build-time inputs**, not as Devflare's runtime secret system.

#### `.dev.vars` and local runtime secrets

Devflare does **not** currently implement its own first-class `.dev.vars` / `.dev.vars.<name>` loader for worker-only dev mode or `createTestContext()`.

That means:

- do not document `.dev.vars*` as a guaranteed Devflare-native feature across all modes
- `secrets` declares the names of expected runtime secrets, but does not provide values
- worker-only dev and `createTestContext()` should not be described as automatically materializing secret values from `.dev.vars*`

In Vite-backed flows, some local runtime variable behavior may come from upstream Cloudflare/Vite tooling rather than from Devflare itself. Document that as inherited upstream behavior, not as a unified Devflare contract.

#### `vars`

Use `vars` for non-secret runtime values that can safely appear in generated config, such as public URLs, modes, IDs, and feature flags.

In the current native Devflare schema, `vars` is:

```ts
Record<string, string>
```

#### `secrets`

`secrets` is a declaration layer. Use it to say which secret bindings your worker expects and whether they are required. Do not put secret values here.

In the current schema, each secret has the shape:

```ts
{ required?: boolean }
```

`required` defaults to `true`, so this:

```ts
secrets: {
	API_KEY: {}
}
```

means “`API_KEY` is a required runtime secret,” not “optional secret with no requirements.”

In practice, secret **values** come from outside Devflare config:

- Cloudflare-stored runtime secrets in deployed environments
- explicit test injection or lower-level mocks in tests
- upstream local-dev tooling when you intentionally rely on it

Do not describe `secrets` as a place that stores values.

#### Example files such as `.env.example` and `.dev.vars.example`

Example files are a **team convention**, not a Devflare feature.

Current truthful guidance:

- use `.env.example` to document required config-time/build-time variables that your config or Node-side tooling reads from `process.env`
- use `.dev.vars.example` to document expected local runtime secret names **if your project chooses to rely on upstream `.dev.vars` workflows**
- keep example files committed with placeholder or fake values only
- do not claim that Devflare auto-generates, auto-loads, or validates these example files today

#### Canonical env and secrets layout

If you want the lowest-confusion setup, use this split:

- `.env.example` documents config-time/build-time inputs
- `.dev.vars.example` documents local runtime secret names **only if your project intentionally relies on upstream `.dev.vars` workflows**
- `devflare.config.ts` reads config-time values from `process.env`, puts safe runtime values in `vars`, and declares required runtime secret names in `secrets`
- deployed secret values live in Cloudflare, not in your repo

Recommended project shape:

```text
my-worker/
├─ .env.example
├─ .dev.vars.example        # optional; only if you intentionally use upstream .dev.vars flows
├─ .gitignore
├─ devflare.config.ts
└─ src/
	└─ fetch.ts
```

Example `.env.example`:

```dotenv
WORKER_NAME=my-worker
API_ORIGIN=http://localhost:3000
```

Example `.dev.vars.example`:

```dotenv
API_KEY=replace-me
SESSION_SECRET=replace-me
```

Typical git ignore pattern for user projects:

```gitignore
.env
.env.*
!.env.example
.dev.vars
.dev.vars.*
!.dev.vars.example
```

Example `devflare.config.ts`:

```ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: process.env.WORKER_NAME ?? 'my-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	},
	vars: {
		API_ORIGIN: process.env.API_ORIGIN ?? 'http://localhost:3000'
	},
	secrets: {
		API_KEY: {},
		SESSION_SECRET: {}
	},
	env: {
		production: {
			vars: {
				API_ORIGIN: 'https://api.example.com'
			}
		}
	}
})
```

Example `src/fetch.ts`:

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function GET({ env }: FetchEvent<DevflareEnv>): Promise<Response> {
	return Response.json({
		origin: env.API_ORIGIN,
		hasApiKey: Boolean(env.API_KEY),
		hasSessionSecret: Boolean(env.SESSION_SECRET)
	})
}
```

Deployed runtime secrets should be created with Cloudflare/Wrangler tooling, not committed to config files or example files.

Typical deployed secret flow:

```bash
bunx --bun wrangler secret put API_KEY
bunx --bun wrangler secret put SESSION_SECRET
```

If you use named Cloudflare environments, set the secret in that environment explicitly:

```bash
bunx --bun wrangler secret put API_KEY --env production
bunx --bun wrangler secret put SESSION_SECRET --env production
```

Practical rule of thumb:

- if a value is needed while evaluating config, put it in the `.env*` / `process.env` bucket
- if a value should exist as a runtime binding but must not be committed, declare it in `secrets`
- if a value is a stable non-secret infrastructure name such as an R2 bucket name or D1 database name, keep it in `devflare.config.*`
- if a project wants local runtime secret files, treat `.dev.vars*` as an upstream convention and document it explicitly per project

#### `devflare types`

`devflare types` generates `env.d.ts` from the resolved config plus discovered surfaces. The stable public result is typed `DevflareEnv` coverage for bindings such as `vars`, `secrets`, services, Durable Objects, and discovered entrypoints.

Import-path behavior stays the same as described earlier: the main-entry `env` is the broader typed access story, while `devflare/runtime` is the strict request-scoped runtime helper.

#### `config.env`

`config.env` is Devflare’s environment override layer. When you pass `--env <name>` or call `compileConfig(config, name)`, Devflare starts from the base config, merges `config.env[name]` into it, and compiles the resolved result.

Current merge behavior uses deep merge semantics:

- scalar fields override base values
- nested objects inherit omitted keys
- arrays append instead of replacing
- `null` and `undefined` do not delete base values

If you need full replacement behavior, compute the final value in `defineConfig()` instead of relying on `config.env`.

Example:

```ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: 'api',
	files: {
		fetch: 'src/fetch.ts'
	},
	vars: {
		APP_ENV: 'development',
		API_ORIGIN: 'http://localhost:3000'
	},
	bindings: {
		kv: {
			CACHE: 'api-cache-dev'
		}
	},
	env: {
		production: {
			vars: {
				APP_ENV: 'production',
				API_ORIGIN: 'https://api.example.com'
			},
			bindings: {
				kv: {
					CACHE: 'api-cache'
				}
			}
		}
	}
})
```

With `--env production`, the resolved config keeps `files.fetch`, overrides the `vars`, and overrides `bindings.kv.CACHE`.

Current limitation: `accountId` and `wsRoutes` are not supported inside `config.env`. Compute those in the outer `defineConfig()` function when you need environment-specific values.

---

## Bindings and multi-worker composition

### Binding groups

| Group | Members | Coverage wording | Safe promise |
|---|---|---|---|
| Core bindings | `kv`, `d1`, `r2`, `durableObjects`, `queues.producers`, `queues.consumers` | well-covered | safest public binding path today across config, generated types, and local dev/test |
| Services and `ref()` | `services` | well-covered with a named-entrypoint caveat | worker-to-worker composition is solid; validate generated output when a named entrypoint matters |
| Remote-oriented bindings | `ai`, `vectorize` | remote-dependent | supported and typed, but not full local equivalents of KV or D1 |
| Narrower bindings | `hyperdrive`, `analyticsEngine`, `browser` | supported, narrower-scope | real public surfaces, but less central than the core storage/runtime path |
| Outbound email binding | `sendEmail` | supported public surface | real outbound email binding; keep it separate from inbound email handling |

### Core bindings

KV, D1, R2, Durable Objects, and queues have the clearest end-to-end story today across config, generated types, and local dev/test flows.

### R2 browser access and public URLs

`bindings.r2` gives you real R2 binding access in local dev, tests, generated types, and compiled config.

What Devflare does **not** currently expose as a public contract is a stable browser-facing local bucket URL.

If you need browser-visible local asset flows:

- serve them through your Worker routes or app endpoints
- test real public/custom-domain URL behavior against an intentional staging bucket
- do not hard-code frontend assumptions about a magic local bucket origin

For delivery patterns and production recommendations, see [`R2.md`](./R2.md).

Practical example:

```ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: 'orders-worker',
	bindings: {
		kv: {
			CACHE: 'orders-cache'
		},
		d1: {
			DB: 'orders-db'
		},
		durableObjects: {
			COUNTER: 'Counter'
		},
		queues: {
			producers: {
				TASK_QUEUE: 'orders-tasks'
			}
		}
	}
})
```

```ts
import type { FetchEvent } from 'devflare/runtime'

export async function POST({ env }: FetchEvent<DevflareEnv>): Promise<Response> {
	const status = await env.DB.prepare('select 1 as ok').first()
	await env.CACHE.put('health', JSON.stringify(status))
	await env.TASK_QUEUE.send({ type: 'reindex-orders' })
	return Response.json({ ok: true })
}
```

### Services and named entrypoints

Service bindings can be written directly or via `ref()`.

```ts
import { defineConfig, ref } from 'devflare'

const auth = ref(() => import('../auth/devflare.config'))

export default defineConfig({
	name: 'gateway',
	bindings: {
		services: {
			AUTH: auth.worker,
			ADMIN: auth.worker('AdminEntrypoint')
		}
	}
})
```

Direct worker-to-worker service composition is a strong public path. Named service entrypoints are typed and configurable, but if a specific entrypoint matters at deployment time, validate the generated output in your project.

Practical example:

```ts
// gateway/devflare.config.ts
import { defineConfig, ref } from 'devflare'

const auth = ref(() => import('../auth/devflare.config'))

export default defineConfig({
	name: 'gateway',
	bindings: {
		services: {
			ADMIN: auth.worker('AdminEntrypoint')
		}
	}
})
```

```ts
// gateway/src/fetch.ts
import type { FetchEvent } from 'devflare/runtime'

export async function GET({ env }: FetchEvent<DevflareEnv>): Promise<Response> {
	const stats = await env.ADMIN.getStats()
	return Response.json(stats)
}
```

### Remote-oriented and narrower bindings

`ai` and `vectorize` are remote-dependent bindings. Devflare supports their config and typing, but they should not be documented as full local equivalents of KV or D1.

`hyperdrive`, `analyticsEngine`, and `browser` are supported narrower-scope surfaces. `browser` also sits closer to the dev-orchestration layer than to the core fetch/queue path.

### `sendEmail` and inbound email

`sendEmail` is the outbound email binding surface. It is supported across config, generated types, and local development flows.

Incoming email is a separate worker surface:

- `files.email`
- `src/email.ts`
- `EmailEvent`

Keep outbound `sendEmail` and inbound email handling separate in docs and examples.

Practical example:

```ts
// devflare.config.ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: 'mail-worker',
	files: {
		fetch: 'src/fetch.ts',
		email: 'src/email.ts'
	},
	bindings: {
		sendEmail: {
			EMAIL: {
				destinationAddress: 'team@example.com'
			}
		}
	}
})
```

```ts
// src/fetch.ts
import type { FetchEvent } from 'devflare/runtime'

export async function POST({ env }: FetchEvent<DevflareEnv>): Promise<Response> {
	await env.EMAIL.send({
		from: 'noreply@example.com',
		to: 'team@example.com',
		subject: 'Welcome',
		text: 'Hello from Devflare'
	})

	return new Response('sent')
}
```

```ts
// src/email.ts
import type { EmailEvent } from 'devflare/runtime'

export async function email({ message }: EmailEvent<DevflareEnv>): Promise<void> {
	await message.forward('ops@example.com')
}
```

### `ref()` and multi-worker composition

Use `ref()` when one worker depends on another worker config.

Main public story:

- `ref(...).worker` for a default service binding backed by `src/worker.ts` or `src/worker.js`
- `ref(...).worker('EntrypointName')` for a named service entrypoint
- typed cross-worker Durable Object handles

```ts
const auth = ref(() => import('../auth/devflare.config'))
```

```ts
const auth = ref('custom-auth-name', () => import('../auth/devflare.config'))
```

Why `ref()` matters:

- worker names stay centralized
- cross-worker Durable Object bindings stay typed
- entrypoint names can be typed from generated `Entrypoints`
- multi-worker systems avoid scattered magic strings

Advanced members such as `.name`, `.config`, `.configPath`, and `.resolve()` are real, but secondary to the main composition story.

---

## Development workflows

### Vite vs Rolldown: the truthful mental model

They are both important, but they are not two names for the same job.

| Tool | Role inside Devflare | When it matters most | What it is not |
|---|---|---|---|
| `Vite` | the optional outer dev/build host for packages that are already Vite apps or frameworks; Devflare plugs generated Worker config, config watching, auxiliary DO workers, and bridge behavior into that pipeline | packages with a local `vite.config.*`, packages that only define inline `config.vite`, SvelteKit, frontend HMR | not Devflare's own Worker bundler |
| `Rolldown` | the inner code-transforming builder Devflare uses when Devflare itself bundles Worker code | worker-only main worker bundles, Durable Object bundles, watch/rebuild, worker-side plugin transforms such as `.svelte` imported by a worker or DO module | not the main app's Vite build |

Three practical consequences fall straight out of the implementation:

- remove both `vite.config.*` and inline `config.vite`, and Devflare drops back to worker-only mode instead of starting Vite
- import `.svelte` from a worker-only surface or Durable Object, and the compilation belongs to `rolldown.options.plugins`, not to the main Vite plugin chain
- generated `.devflare/worker-entrypoints/main.ts` is separate glue code produced by Devflare when it needs to compose fetch, queue, scheduled, email, or route-tree surfaces into one Worker entry

### Operational decision rules

Use these rules in order:

1. a local `vite.config.*` or a non-empty `config.vite` in the current package decides whether `dev`, `build`, and `deploy` run in Vite-backed mode or worker-only mode
2. `devflare/vite` is an explicit helper layer, not a separate CLI mode
3. worker-only mode is a supported first-class path; no local `vite.config.*` and no inline `config.vite` means Devflare does not start Vite
4. `config.vite` is real Vite config when Devflare runs Vite; a local `vite.config.*` remains optional and is merged first when present
5. treat `.devflare/*`, `env.d.ts`, and generated Wrangler config as outputs, not authoring inputs
6. remote mode is mainly for remote-oriented services such as AI and Vectorize, not a blanket “make everything remote” switch

### Vite-backed workflows

A package enters Vite-backed mode when it has a local `vite.config.*` or a non-empty `config.vite`. In that mode, Vite is the outer application pipeline: it owns the package's dev server and app build, while Devflare injects Worker-aware config, generated Wrangler output, auxiliary DO worker config, and bridge behavior into that Vite stack.

Current Vite-backed flow:

1. Devflare loads and validates `devflare.config.*`
2. if a local `vite.config.*` exists, Devflare loads it and merges `config.vite` on top; otherwise Devflare synthesizes `.devflare/vite.config.mjs` from `config.vite`
3. `devflarePlugin()` compiles that config into a generated `.devflare/wrangler.jsonc`
4. Devflare may generate `.devflare/worker-entrypoints/main.ts` when multiple surfaces must be composed into one Worker entry
5. if Durable Object files are discovered, Devflare builds an auxiliary DO worker config for Vite / Cloudflare interop
6. in serve mode, Devflare watches the resolved Devflare config file and triggers a full reload when it changes
7. if `wsRoutes` are configured, Devflare can proxy matching WebSocket upgrade paths to the Miniflare bridge
8. on build, Devflare resolves the current package's local `node_modules/vite/bin/vite.js` and runs `vite build --config .devflare/vite.config.mjs` against that exact file so the package's installed Vite version is used instead of a Bun cache or auto-installed fallback

Two ownership rules matter here:

- setting `wrangler.passthrough.main` tells Devflare to preserve your explicit Worker `main` instead of generating a composed one
- no local `vite.config.*` and no inline `config.vite` means none of this Vite-specific behavior runs; the package stays in worker-only mode

#### `devflare/vite` helpers

| Helper | Use it for | Timing |
|---|---|---|
| `devflarePlugin(options)` | generated `.devflare/wrangler.jsonc`, config watching, DO discovery, DO transforms, and WebSocket proxy wiring | include it in `vite.config.*` plugins |
| `getCloudflareConfig(options)` | compiled programmatic config for `cloudflare({ config })` | call during Vite config creation |
| `getDevflareConfigs(options)` | compiled config plus `auxiliaryWorkers` array for DO workers | call during Vite config creation |
| `resolveViteUserConfig(configEnv, options)` | merge local `vite.config.*`, inline `config.vite`, and `devflarePlugin()` into the actual Vite config object | advanced / generated-config use |
| `writeGeneratedViteConfig(options)` | write `.devflare/vite.config.mjs` for CLI-driven Vite runs | advanced / generated-config use |
| `getPluginContext()` | read resolved plugin state such as `wranglerConfig`, `cloudflareConfig`, discovered DOs, and `projectRoot` | advanced use only, after Vite has resolved config |

`devflarePlugin(options)` currently supports these options:

| Option | Default | What it changes |
|---|---|---|
| `configPath` | auto-resolve local supported config | point Vite at a specific `devflare.config.*` file |
| `environment` | no explicit override | resolve `config.env[name]` before compilation |
| `doTransforms` | `true` | enable or disable Devflare's DO code transforms |
| `watchConfig` | `true` | watch the resolved config file and full-reload on change |
| `bridgePort` | `process.env.DEVFLARE_BRIDGE_PORT`, then `8787` when proxying | choose the Miniflare bridge port for WebSocket proxying |
| `wsProxyPatterns` | `[]` | add extra WebSocket proxy patterns beyond configured `wsRoutes` |

Timing rule of thumb:

- if you need config while building the Vite config object, use `getCloudflareConfig()` or `getDevflareConfigs()`
- if you want Devflare to treat `config.vite` as the actual Vite config source of truth, rely on the CLI-generated config path or `resolveViteUserConfig()`
- if another Vite plugin needs to inspect the already-resolved Devflare state, `getPluginContext()` is the advanced hook

#### Minimal Vite wiring

```ts
import { defineConfig } from 'vite'
import { devflarePlugin } from 'devflare/vite'

export default defineConfig({
	plugins: [devflarePlugin()]
})
```

#### Explicit `@cloudflare/vite-plugin` wiring

```ts
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { devflarePlugin, getDevflareConfigs } from 'devflare/vite'

export default defineConfig(async () => {
	const { cloudflareConfig, auxiliaryWorkers } = await getDevflareConfigs()

	return {
		plugins: [
			devflarePlugin(),
			cloudflare({
				config: cloudflareConfig,
				auxiliaryWorkers: auxiliaryWorkers.length > 0 ? auxiliaryWorkers : undefined
			})
		]
	}
})
```

That is the current high-signal pattern when you want Vite to stay the package's app/build host while Devflare owns Worker config compilation and Durable Object discovery.

#### SvelteKit-backed Worker example

```ts
// devflare.config.ts
import { defineConfig } from 'devflare'

export default defineConfig({
	name: 'notes-app',
	files: {
		fetch: '.svelte-kit/cloudflare/_worker.js',
		durableObjects: 'src/do/**/*.ts',
		transport: 'src/transport.ts'
	},
	bindings: {
		durableObjects: {
			CHAT_ROOM: 'ChatRoom'
		}
	}
})
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { devflarePlugin } from 'devflare/vite'

export default defineConfig({
	plugins: [
		devflarePlugin(),
		sveltekit()
	]
})
```

```ts
// src/hooks.server.ts
export { handle } from 'devflare/sveltekit'
```

Use `createHandle({...})` from `devflare/sveltekit` when you need custom binding hints or want to compose Devflare with other SvelteKit handles via `sequence(...)`.

### Rolldown bundling and plugin workflows

`rolldown` is not just a namespace of knobs. Rolldown is the builder Devflare uses for the code Devflare actively bundles itself. Today that means two Devflare-owned output paths: the worker-only composed main worker bundle and the Durable Object bundle path. Devflare composes worker surfaces when needed, applies its own transforms, lets user plugins transform imports, and emits runnable single-file ESM Worker modules that Miniflare and Wrangler can execute.

That is why `rolldown` is important but different from Vite:

- Vite may host the outer app or framework pipeline
- Rolldown is the inner code-transform step that turns Devflare-owned Worker source into actual runnable worker code
- if a worker-only surface or Durable Object imports `.svelte`, that compilation belongs to the Rolldown plugin pipeline, not to the main Vite app plugin chain

It is still not Vite config, not a replacement for your app's `vite.config.*`, and not the place to configure the main Vite app build.

Current worker bundler behavior:

- in worker-only `dev`, `build`, and `deploy`, Devflare composes the main worker entry to `.devflare/worker-entrypoints/main.ts` and then bundles it to `.devflare/worker-entrypoints/main.js`
- Devflare discovers DO files from `files.durableObjects`
- discovered DO entries are bundled to worker-compatible ESM
- code splitting is disabled so Devflare can emit a worker-friendly single-file bundle
- user `rolldown.options.plugins` are merged into the bundle pipeline
- internal externals cover `cloudflare:*`, `node:*`, and other worker/runtime modules that should stay external
- Devflare also injects a `debug` alias shim so worker bundles do not accidentally drag in a Node-only debug dependency
- this same DO bundling path still matters in unified Vite dev; Vite can host the app while Rolldown rebuilds DO worker code underneath it

Rolldown's plugin API is almost fully compatible with Rollup's, which is why Rollup-style plugins can often be passed through in `rolldown.options.plugins`. That said, compatibility is high, not magical: keep integration tests around nontrivial plugin stacks.

#### Minimal custom transform example

```ts
import { defineConfig } from 'devflare'
import type { Plugin as RolldownPlugin } from 'rolldown'

const inlineSvelteFixturePlugin: RolldownPlugin = {
	name: 'inline-svelte-fixture',
	transform(_code, id) {
		if (!id.endsWith('.svelte')) {
			return null
		}

		return {
			code: 'export default { render() { return { html: "<h1>Hello from Svelte</h1>" } } }',
			map: null
		}
	}
}

export default defineConfig({
	name: 'worker-app',
	files: {
		fetch: 'src/fetch.ts'
	},
	rolldown: {
		options: {
			plugins: [inlineSvelteFixturePlugin]
		}
	}
})
```

That mirrors the kind of `.svelte` transform path the repo now exercises for the composed main worker bundle.

#### Svelte plugin example for Rolldown

This example is intentionally about a `.svelte` import inside a worker-only fetch surface. In that situation, Rolldown — not the main Vite app build — is the plugin pipeline doing the compilation.

For this pattern you typically install `svelte`, `rollup-plugin-svelte`, and `@rollup/plugin-node-resolve` in the package that owns the worker code.

```ts
import { defineConfig } from 'devflare'
import resolve from '@rollup/plugin-node-resolve'
import type { Plugin as RolldownPlugin } from 'rolldown'
import svelte from 'rollup-plugin-svelte'

export default defineConfig({
	name: 'chat-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	rolldown: {
		target: 'es2022',
		sourcemap: true,
		options: {
			plugins: [
				svelte({
					emitCss: false,
					compilerOptions: {
						generate: 'ssr'
					}
				}) as unknown as RolldownPlugin,
				resolve({
					browser: true,
					exportConditions: ['svelte'],
					extensions: ['.svelte']
				}) as unknown as RolldownPlugin
			]
		}
	}
})
```

```svelte
<!-- src/Greeting.svelte -->
<script lang='ts'>
	export let name: string
</script>

<h1>Hello {name} from Svelte</h1>
```

```ts
// src/fetch.ts
import Greeting from './Greeting.svelte'

export async function fetch(): Promise<Response> {
	return new Response(Greeting.render({ name: 'Devflare' }).html, {
		headers: {
			'content-type': 'text/html; charset=utf-8'
		}
	})
}
```

What happens in this flow:

1. Devflare discovers or composes the worker-only main entry from `files.fetch` and related surfaces
2. the worker module imports `Greeting.svelte`
3. Rolldown runs the configured plugin pipeline, including `rollup-plugin-svelte`
4. the Svelte component becomes JavaScript before the Worker bundle is written
5. Devflare writes a runnable single-file Worker bundle for that worker entry

Why this example is shaped that way:

- `emitCss: false` keeps the Worker bundle single-file instead of emitting a separate CSS asset pipeline
- `generate: 'ssr'` fits the Worker-side rendering story better than a browser DOM target
- `@rollup/plugin-node-resolve` helps `.svelte` files and `exports.svelte` packages resolve cleanly
- some Rollup plugins need a type cast to satisfy Rolldown's TypeScript types even when the runtime hooks work fine
- this example is specifically about worker-side component compilation inside a worker-only surface; the same plugin path also applies to DO bundles, while Svelte code in the main app or SvelteKit shell is still Vite's job

If a plugin relies on Rollup-only hooks that Rolldown does not support yet, keep that plugin in your main Vite build instead of the DO bundler.

### Daily development loop

Use the same CLI loop for both worker-only and Vite-backed packages. The presence of a local `vite.config.*` or inline `config.vite` changes the mode automatically.

```bash
bunx --bun devflare dev
bunx --bun devflare types
bunx --bun devflare doctor
bunx --bun devflare build --env staging
bunx --bun devflare deploy --dry-run --env staging
```

Use `--env <name>` on build and deploy when you want Devflare to resolve a named config environment before compilation.

### Preview deploys, version ids, and same-Worker branch previews

Preview deploys reuse the same build and config-resolution pipeline as production deploys.
The important fork happens at the final Wrangler command, not at the authoring model.

#### Shared build and binding resolution

`devflare build`, `devflare deploy`, and `devflare deploy --preview` all start from the same resolved Devflare config:

1. Devflare loads `devflare.config.*`
2. if `--env <name>` is passed, Devflare merges `config.env[name]`
3. Devflare discovers or composes the active worker surfaces such as `fetch`, route trees, queues, scheduled handlers, email handlers, and Durable Objects
4. Devflare writes generated build artifacts such as:
	- `.devflare/wrangler.jsonc`
	- `.devflare/build/wrangler.jsonc`
	- `.wrangler/deploy/config.json`
	- `.devflare/worker-entrypoints/main.ts` when multiple surfaces must be stitched together
	- `.devflare/worker-entrypoints/main.js` when the composed worker is bundled for worker-only build/deploy flows
	- `.devflare/vite.config.mjs` when Devflare needs a generated Vite wrapper config
5. if the package is Vite-backed, Devflare runs the Vite build path; otherwise it skips Vite and bundles the worker entry directly with Rolldown

That shared build path is part of the preview contract:

- preview mode does **not** create a second build system
- preview mode does **not** invent a special preview-only binding model
- both production and preview deploys use the bindings from the resolved config after any `--env` merge
- if preview and production should talk to different KV namespaces, D1 databases, R2 buckets, vars, or service targets, model that difference in `config.env`, worker naming, or your preview deployment strategy

Important binding truth:

- `--env <name>` changes the resolved config before build and deploy
- `--preview` changes the final upload mode after build artifacts already exist
- they can be combined; think “resolve this config first, then upload it as a preview”
- the Devflare preview registry is a control-plane D1 database used by the CLI, not a runtime binding injected into your application Worker

#### Production deploy path vs preview upload path

| Dimension | `devflare deploy` | `devflare deploy --preview` |
|---|---|---|
| Final Wrangler command | `wrangler deploy` | `wrangler versions upload` |
| Worker identity | deploys the resolved Worker as the active production deployment | uploads a new version of the **same Worker** |
| Primary identity returned by Cloudflare | deployment state plus Worker URL(s) | Worker version id, plus preview URL(s) when Cloudflare provides them |
| URL to visit | the normal `workers.dev` URL and/or configured Cloudflare `routes` | prefer the preview alias URL, then the version preview URL |
| Bindings | resolved config after any `--env` merge | the same resolved config after any `--env` merge |
| Good fit | real production or long-lived environment deployment | branch or PR review of the same Worker without creating a second Worker |
| Known limits | normal Wrangler/Cloudflare deploy limits | cannot be the first upload for a brand-new Worker; preview URLs are not generated for Workers with Durable Objects; DO migrations are not supported |

That distinction is the intended branch-preview model.

Same-Worker preview behavior means:

- feature branches can live as preview versions of the same Worker rather than forcing a separate Worker per branch
- Cloudflare version ids become the low-level identity for preview uploads
- preview aliases become the human-friendly stable CI identity for a branch or PR
- Wrangler environments remain a separate concern and should not be documented as the same thing as branch previews

#### Preview alias resolution and sanitization

Preview alias source resolution is part of the contract:

1. `--preview-alias <alias>`
2. `--branch-name <branch>`
3. `GITHUB_HEAD_REF`
4. `GITHUB_REF_NAME`
5. `WORKERS_CI_BRANCH`
6. current git branch

Sanitization rules follow Cloudflare's documented alias restrictions:

- lowercase letters, numbers, and dashes only
- must start with a lowercase letter
- alias length is clamped so `alias-workerName` stays within Cloudflare's 63-character DNS label limit
- if sanitization removes everything, Devflare falls back to `preview`
- if the sanitized alias would not start with a letter, Devflare prefixes it with `b-`

#### How preview URLs are produced and how to visit them

Deploy output handling is also part of the contract:

- Devflare parses Wrangler output for `Version ID`
- preview uploads additionally parse `Preview Alias URL` and `Preview URL`
- if Wrangler omits the preview alias URL, Devflare derives the alias URL from the account's `workers.dev` subdomain and the resolved alias/worker name
- when present, Devflare prints those values again in a stable post-deploy summary

When a preview upload is successful, the safest visit order is:

1. `Preview Alias URL`
	- stable link for the branch or PR
	- best choice for CI comments, PR summaries, and manual review
2. `Preview URL`
	- version-specific link for that exact uploaded Worker version
	- useful when you need to verify one concrete upload
3. the stored preview URL surfaced later by `devflare previews` or the composite action output

Production URLs are different on purpose:

- production deploys are visited through the Worker's normal `workers.dev` hostname or configured deployment `routes`
- preview uploads do **not** replace the active production deployment
- preview uploads sit beside production as separately addressable Worker versions of the same Worker

Useful end-to-end commands:

```bash
bunx --bun devflare build
bunx --bun devflare deploy
bunx --bun devflare deploy --preview --branch-name feature-search
bunx --bun devflare previews
bunx --bun devflare previews documentation
```

#### Inspecting preview state with `devflare previews`

`devflare previews` is the CLI control-plane surface for preview lifecycle management.

The preview registry tracks three record families:

- preview records
	- one record per previewable Worker version
	- includes version id, preview URL, optional alias, and optional alias preview URL
- preview-alias records
	- one record per alias currently mapped to a preview version
	- the best place to answer “what does this branch alias point at right now?”
- deployment records
	- preview and production deployment state tracked in one registry model

The registry uses a D1 database named `devflare-registry` by default.
That database belongs to Devflare's control plane. It is not your app's own `bindings.d1` declaration.

Useful preview-registry commands:

```bash
bunx --bun devflare previews
bunx --bun devflare previews <worker-name>
bunx --bun devflare previews provision
bunx --bun devflare previews reconcile --worker documentation
bunx --bun devflare previews retire --worker documentation --branch feature-search --apply
bunx --bun devflare previews cleanup --worker documentation --days 7 --apply
```

Current behavior:

- `devflare previews` lists grouped preview, alias, and deployment state from the registry
- `devflare previews <worker-name>` is shorthand for listing one worker's preview state
- `devflare previews provision` ensures the registry D1 database exists
- `devflare previews reconcile` syncs the registry against live Cloudflare Worker versions and deployments
- `devflare previews retire` immediately marks one tracked preview, alias, and preview deployment as deleted using branch, alias, version, or commit selectors
- `devflare previews cleanup` is a dry run unless `--apply` is passed
- successful `devflare deploy` and `devflare deploy --preview` runs attempt best-effort registry reconciliation automatically when an account id is available

Cloudflare discovery gap that explains why this command group exists:

- `wrangler versions list` and the dashboard deployments view do not provide a complete, operator-friendly preview inventory
- preview existence currently leaks mostly through sparse version metadata such as `has_preview` and preview-alias annotations
- upstream docs describe `versions list`, `versions view`, `versions upload`, and `versions deploy`, but not first-class `versions delete`, `preview delete`, or alias-deletion commands
- Devflare therefore treats preview inventory, reconciliation, and cleanup as a control-plane problem and keeps its own D1-backed registry

That means the normal human loop is:

1. deploy production or upload a preview
2. copy the printed URL if Devflare returned one immediately
3. use `devflare previews` later when you want the tracked preview, alias, or deployment state again without re-running the deploy

When you need immediate lifecycle teardown rather than age-based cleanup, `devflare previews retire` is the explicit control-plane path.
That command retires Devflare's own preview, alias, and preview-deployment records right away so PR-close and branch-delete automation can stop advertising the preview even though Cloudflare may still keep the alias reachable until a later overwrite or retention eviction.

#### When same-Worker preview mode is the wrong tool

Important Cloudflare caveats that must stay explicit in docs and automation:

- preview uploads cannot be the first upload for a brand-new Worker
- preview URLs must be enabled for the Worker for preview links to be usable
- preview URLs are public unless protected with Cloudflare Access
- preview URLs are not currently generated for Workers that implement Durable Objects
- `wrangler versions upload` does not currently support Durable Object migrations
- branch previews should therefore not be documented as universally available for every Durable Object workflow

Practical consequence:

- for ordinary HTTP Workers, same-Worker previews are the cleanest branch-preview path
- for Durable Object-heavy apps that need a real reachable URL, use a separate preview deployment strategy such as a branch-scoped Worker name or an environment-specific preview Worker

Repository examples deliberately demonstrate both paths:

- `apps/documentation` is the canonical same-Worker preview example and is intentionally configured with `preview_urls: true` and `workers_dev: true`
- `apps/testing` is the canonical “Durable Objects need a different preview strategy” example; its CI preview workflow deploys a branch-scoped preview environment instead of relying on `devflare deploy --preview` for the main worker

### CLI command model

The full CLI surface today is:

- `init`
- `dev`
- `build`
- `deploy`
- `types`
- `doctor`
- `config`
- `account`
- `login`
- `previews`
- `worker`
- `token`
- `ai`
- `remote`
- `help`
- `version`

The top-level parser is intentionally shallow.

Behavior that is part of the contract:

- `devflare` with no command falls back to help output
- `-h` / `--help` short-circuit to help before command dispatch
- `-v` / `--version` short-circuit to version before command dispatch
- `--config <path>` is shared by `dev`, `build`, `deploy`, `types`, `doctor`, and `config`
- `--env <name>` is shared by `build`, `deploy`, and `config`
- `--debug` is used by commands that surface detailed error traces such as `dev`, `build`, `deploy`, and `types`
- command-specific flags remain owned by their command; do not describe them as globally supported unless the implementation does so

The CLI is an orchestrator rather than a single runtime mode.

- `init` scaffolds source files
- `dev` orchestrates Miniflare, Rolldown, and optional Vite
- `build` and `deploy` prepare generated Wrangler artifacts
- `account`, `previews`, `worker`, `token`, and `login` are Cloudflare control-plane helpers
- `ai` and `remote` are operator-facing helper commands rather than build/deploy flows

### Command-by-command contract

#### `init`

`devflare init [name]` scaffolds a new project directory.

Current behavior:

- default project name: `my-devflare-app`
- current templates: `minimal` and `api`
- select a template with `--template <name>`
- refuses to overwrite an existing directory
- writes `devflare.config.ts`, `package.json`, `tsconfig.json`, and starter source files
- generated config files currently import `defineConfig()` from `devflare/config`
- generated `package.json` scripts include `dev`, `build`, `deploy`, and `types`

Template intent today:

- `minimal` gives one `src/fetch.ts`
- `api` gives request-wide middleware plus an `appFetch()` split

#### `dev`

`devflare dev` starts local development.

Current behavior:

- worker-only mode is the default when the package has no effective Vite config
- unified Vite-backed mode starts when the current package has a local `vite.config.*` or a non-empty `config.vite`
- Vite, when enabled, owns the outer app dev server
- Miniflare provides the Cloudflare runtime and bindings
- Rolldown watches and rebuilds Worker and Durable Object bundles
- the Miniflare bridge runs on port `8787`
- `--port <port>` controls the preferred Vite port, not the Miniflare port
- `--persist` persists Miniflare storage between restarts
- `--verbose` enables noisier logs
- `--debug` implies debug-style logging and stack traces
- `--log` writes terminal output to `.log-<timestamp>` as well as stdout
- `--log-temp` writes terminal output to `.log` and overwrites it on each run
- the command installs signal and rejection handlers and shuts the dev server down gracefully on exit

Do not document `dev` as an environment-aware command today. It does not consume `--env`.

#### `build`

`devflare build` prepares production/deploy artifacts from the resolved config.

Current behavior:

- it uses the same build-artifact preparation path that deploy uses
- it respects `--config <path>` and `--env <name>`
- worker-only packages skip Vite-specific build work
- higher-level flows may synthesize a composed `.devflare/worker-entrypoints/main.ts` and bundle it to `.js` when multiple surfaces must be stitched together
- it generates:
	- `.devflare/wrangler.jsonc`
	- `.devflare/build/wrangler.jsonc`
	- `.wrangler/deploy/config.json`

#### `deploy`

`devflare deploy` is the deploy-time wrapper around Wrangler.

Current behavior:

- it resolves config via `loadResolvedConfig()` before deployment
- it respects `--config <path>` and `--env <name>`
- `--dry-run` prints the compiled Wrangler config and skips any deploy
- normal deploys use `wrangler deploy`
- preview deploys use `wrangler versions upload`
- `--preview`, `--preview-alias`, and `--branch-name` are preview-mode flags only

Preview alias resolution order is implementation contract:

1. `--preview-alias <alias>`
2. `--branch-name <branch>`
3. `GITHUB_HEAD_REF`
4. `GITHUB_REF_NAME`
5. `WORKERS_CI_BRANCH`
6. current git branch

Post-deploy behavior that matters to docs and automation:

- Devflare parses Wrangler output for `Version ID`
- preview uploads also parse `Preview Alias URL` and `Preview URL`
- if the alias URL is missing, Devflare derives it from the account `workers.dev` subdomain when possible
- when `DEVFLARE_VERIFY_DEPLOYMENT=true`, Devflare treats control-plane verification as part of deploy success:
	- preview uploads must be re-readable through the Worker version API using the returned version id
	- non-preview deploys must also appear in the Worker deployments API as a deployment that references that version id
	- if Devflare cannot prove that state, the deploy command fails even if Wrangler exited successfully
- successful deploys attempt best-effort preview-registry reconciliation when an account id is available
- registry reconciliation warnings do not fail the underlying deploy

Do not blur preview uploads and environments together:

- `--preview` means same-Worker version uploads
- `--env <name>` means resolve `config.env[name]` before build/deploy
- you can combine them, but they solve different problems: config selection first, upload mode second

#### `types`

`devflare types` generates the `env.d.ts` contract for the current package.

Current behavior:

- default output path: `env.d.ts`
- use `--output <path>` to change the destination
- it respects `--config <path>`
- it discovers Durable Objects from `files.durableObjects` or the default DO glob
- it discovers named Worker entrypoints from `files.entrypoints` or the default entrypoint glob
- it inspects `ref()`-based worker references so service bindings can become typed interfaces instead of generic `Fetcher`s when matching interfaces are present
- it normalizes configured Durable Object bindings before emitting types
- it writes `DevflareEnv` plus an `Entrypoints` type alias

`types` is richer than “dump bindings into a .d.ts file”; it performs discovery and cross-worker typing work.

#### `doctor`

`devflare doctor` is the project diagnostics command.

Current behavior:

- it checks for supported Devflare config filenames, optionally via `--config <path>`
- it validates that the selected config can actually load
- it checks for `package.json`
- it warns when `devflare` is not declared as a dependency
- it reports whether the current package is running in worker-only mode or Vite-backed mode
- when Vite mode is expected, it checks for local Vite dependencies and a local `vite.config.*`
- it checks for `tsconfig.json`
- it warns when generated artifacts are missing:
	- `.devflare/wrangler.jsonc`
	- `.devflare/build/wrangler.jsonc`
	- `.wrangler/deploy/config.json`
- warnings do not fail the command, but hard failures do

#### `config`

`devflare config` is the resolved-config printer.

Current behavior:

- the only supported subcommand today is `print`
- default format is `devflare`
- supported formats are `devflare` and `wrangler`
- choose the format with `--format <devflare|wrangler>`
- it respects `--config <path>` and `--env <name>`
- output is JSON written to stdout

Important truth-first note:

- the implementation contract is `config print --format devflare|wrangler`
- do not document `--json` as a distinct implemented mode today just because older help text mentioned it

#### `account`

`devflare account` is the Cloudflare account inspection and selection surface.

Authentication is required before any `account` subcommand runs.

Current subcommands:

- `info` (default)
- `workers`
- `kv`
- `d1`
- `r2`
- `vectorize`
- `limits`
- `usage`
- `global`
- `workspace`

Account resolution for the resource-reporting subcommands is currently:

1. `--account <id>`
2. workspace account preference
3. `CLOUDFLARE_ACCOUNT_ID`
4. local `config.accountId`
5. the primary Cloudflare account

Subcommand behavior:

- `account` / `account info` lists visible accounts and highlights workspace/global defaults
- `account workers`, `kv`, `d1`, `r2`, and `vectorize` list live resources for the resolved account
- `account usage` shows usage summaries and whether limits are enabled
- `account limits` shows the current limit state
- `account limits set <limit-name> <value>` supports:
	- `ai-requests`
	- `ai-tokens`
	- `vectorize-ops`
- `account limits enable` and `disable` toggle stored usage limits
- `account global` opens an interactive account picker and saves the selection as the global default
- `account workspace` opens an interactive account picker and saves the selection into the workspace package metadata

`global` and `workspace` are selection flows, not reporting subcommands.

#### `login`

`devflare login` is a thin wrapper around `wrangler login`.

Current behavior:

- if Cloudflare auth already resolves and `--force` is not passed, the command does not reopen browser login
- `devflare login --force` always reruns `wrangler login`
- after success, Devflare tries to show the primary account
- if the current token cannot enumerate all accounts, it falls back to the configured workspace/env/config account hint

#### `previews`

`devflare previews` manages the Devflare preview registry.

This is a control-plane command group, not an application-runtime binding surface.

The registry tracks:

- preview records
- preview-alias records
- deployment records

The registry D1 database defaults to `devflare-registry`.

Current subcommands:

- `list` (default)
- `provision`
- `reconcile`
- `retire`
- `cleanup`

Current behavior:

- `devflare previews` defaults to `list`
- `devflare previews <worker-name>` is shorthand for listing one worker
- `--worker <name>` can select the worker explicitly
- `--account <id>` can select the Cloudflare account explicitly
- `--database <name>` can override the registry D1 database name
- `--all` includes historical and deleted records in list/reconcile output
- `retire` accepts `--branch`, `--preview-alias`, `--version-id`, or `--commit-sha` selectors and requires at least one of them
- `cleanup` uses `--days <n>` with a default of `7`
- `cleanup` is a dry run unless `--apply` is passed
- `reconcile` requires a worker name, either from `--worker`, the positional shorthand, or the local config name
- worker and account hints can be resolved from local config when flags are omitted

Operational behavior:

- `provision` ensures the registry database exists
- `list` ensures the registry exists, then prints grouped preview/alias/deployment state
- `reconcile` syncs registry state against Cloudflare Worker versions and deployments
- `retire` marks the matched preview, alias, and preview deployment records as deleted immediately when `--apply` is passed
- `cleanup` can optionally reconcile first when a worker is selected, then marks stale non-active records

Use this command group when you want to answer questions like:

- “Which preview alias URL should I visit for this worker right now?”
- “Which version id is behind this alias?”
- “Which old preview records are safe cleanup candidates?”

#### `worker`

`devflare worker` is the Worker control-plane command group.

Current implementation exposes one subcommand:

- `worker rename <old-name> --to <new-name>`

Current behavior:

- Cloudflare authentication is required
- `--config <path>` can disambiguate which local config should be updated
- if multiple matching configs exist and `--config` is not provided, the command refuses to guess
- it renames the remote Worker when the old name exists and the new name does not
- it then rewrites the selected config's top-level string-literal `name` property
- it scans discovered configs for remaining service-binding or cross-worker Durable Object references that still point at the old Worker name and warns about them
- if the remote rename succeeds but the local config update fails, the command warns that the repo must be updated manually

Preview caveat that remains important:

- existing preview aliases and URLs may continue using the old Worker name until fresh previews are uploaded

#### `tokens`

`devflare tokens <bootstrap-token>` is the account-owned token management flow.

Current behavior:

- the bootstrap token must already have Cloudflare API-token-management permission
- token account resolution is currently:
	1. `--account <id>`
	2. workspace account preference
	3. the bootstrap token's primary account
- all managed token names are normalized to the `devflare-` prefix
- `--new [token-name]` prompts when the name is omitted and creates a Devflare-managed token from the curated Devflare-relevant permission subset
- `--new [token-name] --all-flags` uses every reusable account-scoped permission group visible to the bootstrap token except `Account API Tokens*`, because Cloudflare still does not allow sub-tokens to manage tokens and account-owned tokens skip incompatible zone/user-scoped groups automatically
- `--list` shows only Devflare-managed account-owned tokens for the selected account
- `--delete [token-name]` deletes the normalized matching Devflare-managed token name
- `--delete-all` deletes every Devflare-managed token for the selected account and leaves non-Devflare account tokens untouched
- the legacy singular `devflare token <bootstrap-token>` create flow is kept as a compatibility alias, but `tokens` is the documented surface
- Cloudflare only returns the token secret once, so the command prints it once and warns the caller to store it immediately

#### `ai`

`devflare ai` is an informational command.

Current behavior:

- it prints Workers AI pricing information grouped into LLM, embeddings, image, and audio models
- the data is a curated snapshot sourced from Cloudflare pricing docs, not a live Cloudflare API query

#### `remote`

`devflare remote` manages remote test mode for cost-sensitive remote-only services.

Current subcommands:

- `status` (default)
- `enable [minutes]`
- `disable`

Current behavior:

- `status` is the default when no subcommand is provided
- `enable` stores local state in `~/.devflare/remote.json`
- duration is clamped to `1` through `1440` minutes
- omitted or invalid durations fall back to `30` minutes
- `disable` clears the stored config immediately
- `DEVFLARE_REMOTE=1`, `true`, or `yes` forces remote mode on via environment override
- when that env var is set, `disable` only clears the stored config; remote mode remains effectively active until the env var is unset

Keep the scope narrow in docs:

- remote mode is mainly about remote-oriented services such as AI and Vectorize
- it is not a blanket “make every binding remote” switch

#### `help` and `version`

`devflare help` and `devflare version` are first-class commands, and the short flags `-h` / `--help` and `-v` / `--version` short-circuit to them.

Current behavior:

- help prints the styled command overview from `src/cli/index.ts`
- version reads the installed package version from package metadata

### Related automation surface

The repository ships a reusable composite action at `.github/actions/devflare-deploy`.

The repository also ships a GitHub feedback action at `.github/actions/devflare-github-feedback`.

It is not part of the CLI, but it is intentionally layered on top of the CLI rather than replacing it.

Current behavior:

- it is a composite action, not a reusable workflow
- the caller workflow owns triggers, concurrency, runner selection, permissions, and environments
- the caller workflow also owns all jobs; the composite action itself cannot define jobs or choose a different runner
- Cloudflare credentials must be passed explicitly because composite actions cannot read the `secrets` context directly
- the action installs dependencies, forwards preview identity flags into `devflare deploy`, enables strict control-plane verification by default, and surfaces deploy metadata as outputs even when the deploy step later fails
- example caller workflows in this repo intentionally pass branch identity into Devflare and let Devflare own preview-alias sanitization instead of reimplementing that logic in bash

The GitHub feedback action is where repository-visible deployment reporting belongs:

- `mode: comment` for PR-only preview reporting
- `mode: deployment` for branch-only or production reporting through the Deployments API
- `mode: both` plus `resolve-pr-from-ref: "true"` for combined branch + PR feedback from a single branch-scoped workflow

That split is deliberate because GitHub has stable native comments for PRs, but not for branches.

Current deploy-action inputs include:

- `working-directory`
- `install-working-directory`
- `environment`
- `preview`
- `preview-alias`
- `branch-name`
- `deploy-command`
- `deploy-message`
- `deploy-tag`
- `verify-deployment`
- `require-fresh-production-deployment`
- `cloudflare-api-token`
- `cloudflare-account-id`

Current deploy-action outputs include:

- `preview-alias`
- `preview-url`
- `version-id`
- `verification-note`
- `status`
- `failure-stage`
- `exit-code`
- `log-excerpt`

`preview-url` is intentionally “best reachable URL” rather than “always same shape.”

- in same-Worker preview uploads it prefers the preview alias URL, then the version preview URL
- in separate preview deployment strategies it can be the deployed `workers.dev` URL
- callers should treat it as the URL to verify or post back to the PR, not as proof that preview mode specifically used `wrangler versions upload`

The action's deploy-success contract is control-plane based, not response-content based.

- success means Devflare could prove the uploaded version exists in Cloudflare
- for non-preview deploys, success additionally means Cloudflare reports a deployment that references that version
- later workflow steps may still perform runtime or browser validation, but those are app-acceptance checks, not the primary signal that deploy succeeded

The safest preview caller contract remains:

```yaml
branch-name: ${{ github.head_ref || github.ref_name }}
```

That keeps preview naming deterministic across pull-request, push, and manual-dispatch workflows while leaving sanitization inside Devflare.

Current repository examples of that reporting layer:

- `.github/workflows/documentation-preview-branch.yml` publishes branch-scoped documentation preview aliases on push for non-default branches and reports them through the Deployments API
- `.github/workflows/documentation-preview-branch-cleanup.yml` retires tracked documentation branch-preview metadata and marks matching GitHub deployment feedback inactive when a branch is deleted
- `.github/workflows/documentation-preview-pr.yml` deploys documentation PR previews, upserts a stable PR comment, and retires the tracked preview metadata when the PR closes
- `.github/workflows/documentation-production.yml` deploys documentation production from the repository default branch and publishes a GitHub deployment status with the production URL
- `.github/workflows/testing-preview-branch.yml` deploys the Durable Object-heavy testing app as a branch-scoped preview environment, publishes a branch deployment on every run, and also refreshes the stable PR comment when that branch belongs to an open PR
- `.github/workflows/testing-preview-branch-cleanup.yml` retires tracked testing branch preview metadata, deletes the branch-scoped Workers, and marks matching GitHub deployment feedback plus the stable PR preview comment inactive when applicable
- `.github/workflows/testing-preview-pr.yml` deploys PR-scoped testing previews and retires the stable PR preview comment when the PR closes
- `.github/workflow-examples/branch-preview-cleanup.example.yml` is the copyable branch-delete cleanup template for same-Worker preview flows that retire tracked preview metadata and mark GitHub deployment feedback inactive

### Repository examples and acceptance verification

The repository intentionally splits example coverage across two app directories:

- `apps/documentation/` is the executable SvelteKit example for local dev, build, same-Worker preview uploads, production deploys, workflow automation, Wrangler-visible verification, and browser reachability checks
- `apps/testing/devflare.config.ts` is the exhaustive binding-matrix example for the config contract itself, including preview and production environment overrides where resource names differ by deployment channel

`apps/testing/` is intentionally config-first rather than a second polished app shell, but it now also includes `src/fetch.ts` as a tiny smoke Worker that repository integration tests execute through `devflare/test` under both preview and production config resolution. It is also the repository's concrete example of the Durable Object preview exception path: CI deploys it as a branch-scoped preview environment instead of relying on same-Worker preview URLs for the main worker. Use it to regression-test the authoring contract and a minimal real Worker surface; use `apps/documentation/` to validate the same-Worker preview pipeline end to end.

For that branch-scoped real-preview strategy, Devflare now automatically omits shared queue consumers from the deployed Wrangler config, and it omits cron triggers by default, whenever it detects `--env preview` plus branch scope without `--preview`. Keep the config authoring exhaustive; the deploy layer handles the singleton-resource safety valve.

If that preview should keep its cron schedule, opt in with:

```ts
export default defineConfig({
	previews: {
		includeCrons: true
	}
})
```

If the preview should also use preview-owned Cloudflare resources, author those
binding names with `preview.scope()`:

```ts
import { defineConfig, preview } from 'devflare/config'

const pv = preview.scope()

export default defineConfig({
	bindings: {
		kv: {
			CACHE: pv('my-cache-kv')
		},
		vectorize: {
			SEARCH_INDEX: {
				indexName: pv('my-search-index')
			}
		}
	}
})
```

Devflare resolves those opaque markers back to base names outside preview
environments, and to preview-scoped names such as `my-cache-kv-preview` or a
branch-derived suffix during preview resolution and deploys. Service bindings
created with `ref()` still isolate through worker naming rather than
`preview.scope()`.

Workflow-verification split that matters:

- the documentation branch-preview, PR-preview, and production workflows rely on deploy-action control-plane verification for deploy success, with default-branch targeting decided dynamically from the repository default branch rather than a hardcoded branch name
- the testing branch-preview and PR-preview workflows intentionally keep a later `/status` assertion because they are validating runtime wiring and binding availability, and the branch workflow additionally demonstrates combined branch deployment + PR comment feedback via `mode: both`

Additional repo-specific notes that matter to the example story:

- `apps/documentation/src/hooks.ts` exports an explicit empty `transport` object so the final docs build stays warning-free
- `apps/documentation/package.json` invokes `../../packages/devflare/bin/devflare.js` directly because Bun did not create a `.bin/devflare` shim for the local file dependency

---

## Testing model

Use `devflare/test`.

The default pairing is:

```ts
import { beforeAll, afterAll } from 'bun:test'
import { createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())
```

`createTestContext()` is the recommended default for most integration-style tests.

Current behavior:

- it can auto-discover the nearest supported config file by walking upward from the calling test file
- it sets up the main-entry test env used by `import { env } from 'devflare'`
- it resolves service bindings and cross-worker Durable Object references
- it can infer conventional fetch, queue, scheduled, and email handler files when present
- it also auto-detects `src/tail.ts` when present, even though there is no public `files.tail` config key
- it auto-detects `src/transport.{ts,js,mts,mjs}` when present unless `files.transport` is `null`
- it does not have a first-class `.dev.vars*` loader for populating declared secret values

### Durable Object RPC behavior in tests

`createTestContext()` currently supports two Durable Object RPC paths:

- native stub RPC for Durable Object classes that extend Cloudflare's `DurableObject`
- generated fetch-backed `/_rpc` wrappers for plain exported classes that do not support native Durable Object RPC

That compatibility layer matters because the test-facing unified `env` proxy prefers the hinted/proxied binding when one exists, instead of exposing raw Miniflare bindings first. That keeps test code like `env.COUNTER.getByName(...)` working across both native Durable Object classes and plain-class Durable Object fixtures.

Practical example:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cf, createTestContext } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

describe('users routes', () => {
	test('GET /users/123 uses the built-in file router', async () => {
		const response = await cf.worker.get('/users/123')
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ id: '123' })
	})

	test('queue side effects can be asserted with real bindings', async () => {
		await cf.queue.trigger([
			{ type: 'reindex', id: 'job-1' }
		])

		expect(await env.RESULTS.get('job-1')).toBe('done')
	})
})
```

### Helper behavior

Do not assume every `cf.*` helper behaves the same way.

| Helper | What it does | Waits for `waitUntil()`? | Important nuance |
|---|---|---|---|
| `cf.worker.fetch()` | invokes the configured HTTP surface, including built-in file routes | No | returns when the handler resolves |
| `cf.queue.trigger()` | invokes the configured queue consumer | Yes | drains queued background work before returning |
| `cf.scheduled.trigger()` | invokes the configured scheduled handler | Yes | drains queued background work before returning |
| `cf.email.send()` | sends a raw email through the helper | Yes on the direct-handler path; fallback endpoint behavior is runtime-driven | when `createTestContext()` has wired an email handler, it imports and invokes that handler directly; otherwise it falls back to the local email endpoint |
| `cf.tail.trigger()` | directly invokes a tail handler | Yes | `createTestContext()` auto-detects `src/tail.ts` when present, but there is still no public `files.tail` config key |

Two important consequences:

- `cf.worker.fetch()` is not a “wait for all background work” helper
- helper availability does not mean every helper replays the full Cloudflare dispatch path in the same way

### Email testing

Email testing has two directions:

- incoming email helper dispatch via `cf.email.send()` / `email.send()`
- outgoing email observation via helper state

When `createTestContext()` has wired an email handler, the helper imports that handler directly, creates an `EmailEvent`, and waits for queued `waitUntil()` work.

If no email handler has been wired, the helper falls back to posting the raw email to the local email endpoint.

That makes the helper useful for handler-level tests, but ingress-fidelity-sensitive flows should still use higher-level integration testing.

### Tail testing

Tail helpers are exported publicly, and `createTestContext()` auto-detects `src/tail.ts` when present.

So the truthful public statement is:

- `cf.tail.trigger()` is exported
- `createTestContext()` wires it automatically when `src/tail.ts` exists
- `cf.tail.trigger()` directly imports and invokes that handler and waits for `waitUntil()`
- there is no public `files.tail` config key to advertise today

### Remote mode in tests

Remote mode is mainly about AI and Vectorize. Use `shouldSkip` for cost-sensitive or remote-only test gating. Do not treat remote mode as a blanket “make every binding remote” switch.

---

## Sharp edges

Keep these caveats explicit:

- `files.routes` configures the built-in file router; it is not the same thing as Cloudflare deployment `routes`
- route trees are real now, but `src/fetch.ts` same-module method handlers still take precedence over file routes for matching methods
- route files that normalize to the same pattern are rejected as conflicts
- `_`-prefixed files and directories inside the route tree are ignored
- `vars` values are strings in the current native schema
- `secrets` declares runtime secret bindings; it does not store secret values
- `.env*` and `.dev.vars*` are not a unified Devflare-native loading/validation system; any effect they have comes from Bun or upstream Cloudflare tooling, depending on the mode
- `wrangler.passthrough` is the escape hatch for unsupported Wrangler keys and is merged after native compilation
- named service entrypoints need deployment-time validation if they are critical to your app
- local R2 binding support is real, but there is still no stable public/browser local bucket URL contract to document as public API
- `bindings.browser` uses a named-map authoring shape, but the current compiler only allows exactly one browser binding because Wrangler only supports one
- `sendEmail` is a supported outbound binding, while inbound email is a separate worker surface
- email and tail helpers have real, useful test paths, but they should not be described as identical to full Cloudflare ingress or tail replay
- Vite and Rolldown are different systems and should not be blurred together
- `config.vite` is real Vite config only when Devflare is actually running Vite; it does not replace the worker-only Rolldown bundle path
- `rolldown` config affects Devflare-owned worker bundling outputs (worker-only main bundles and DO bundles), not the main Vite app build
- `rolldown.target` and deprecated `build.target` are accepted for compatibility, but the current worker bundler ignores the target value
- `wrangler.passthrough.main` suppresses Devflare's composed main-entry generation in higher-level build and Vite-backed flows
- `getCloudflareConfig()` and `getDevflareConfigs()` are the safe config-time Vite helpers; `getPluginContext()` is advanced post-resolution state
- Rollup-compatible plugins often work in `rolldown.options.plugins`, but compatibility is high-not-total and plugin-specific validation still matters
- higher-level flows may generate composed main worker entries more aggressively than older docs implied
- preview uploads cannot be the first upload for a brand-new Worker
- preview URLs are not currently generated for Workers that implement Durable Objects
- `wrangler versions upload` does not currently support Durable Object migrations
- Cloudflare's native preview lifecycle surface is still incomplete; Devflare should not assume Wrangler can enumerate and delete preview state ergonomically later
- the token bootstrap command prints a new Cloudflare token secret exactly once; callers must store it immediately
- the bootstrap token must have token-management permission, but the minted Devflare token intentionally will not, because Cloudflare forbids sub-tokens from managing other tokens

---

## TODO cross-check and sign-off map

This section exists so `TODO.md` can be cross-checked against `LLM.md` explicitly instead of relying on vibes.

- Validation posture, retrieval-led reasoning, and upstream doc anchors: covered in `Validation posture and upstream reference anchors`
- Same-Worker previews vs separate Workers: covered in `Preview deploys, version ids, and same-Worker branch previews`
- Shared build path, binding resolution, and visit URLs for preview vs production: covered in `Preview deploys, version ids, and same-Worker branch previews`
- Preview aliases, sanitization rules, version ids, and preview URLs: covered in `Preview deploys, version ids, and same-Worker branch previews`
- Durable Object preview limitations and migration caveats: covered in `Preview deploys, version ids, and same-Worker branch previews` and `Sharp edges`
- Preview discovery and cleanup gap in Cloudflare's native surface: covered in `Inspecting preview state with devflare previews`, `previews`, and `Sharp edges`
- Whole CLI command surface, subcommands, and flag ownership: covered in `CLI command model` and `Command-by-command contract`
- Generated artifact locations and source-of-truth rules: covered in `Source of truth vs generated output` and `Generated artifacts and doctor`
- `devflare tokens <bootstrap-token>` behavior: covered in `Command-by-command contract` under `tokens`
- Composite GitHub Action contract: covered in `Related automation surface`
- Branch/PR preview workflow and production-on-default-branch workflow examples: covered in `Related automation surface`
- Documentation app as the canonical SvelteKit same-Worker preview/deploy example: covered in `Preview deploys, version ids, and same-Worker branch previews` and `Repository examples and acceptance verification`
- `apps/testing` as the exhaustive binding-matrix example, including preview and production overrides plus the Durable Object preview exception path: covered in `Preview deploys, version ids, and same-Worker branch previews` and `Repository examples and acceptance verification`
- D1 stable-name authoring and resolved-id compilation: covered in `D1 by name, resolution modes, and resolved config reuse`
- Browser binding map syntax and single-binding limit: covered in `bindings` and `Sharp edges`
- Worker-only vs Vite-backed build/deploy behavior: covered in `Development workflows`
- `doctor` expectations: covered in `Generated artifacts and doctor` and `doctor`
- Testing expectations, including transport autodiscovery and plain-class Durable Object RPC compatibility: covered in `Testing model` and `Durable Object RPC behavior in tests`
- Browser verification expectations for preview and production URLs: covered in `Repository examples and acceptance verification`
- Wrangler-visible deployment and version-state verification: covered in `Repository examples and acceptance verification`
- Token bootstrap limitation versus the original wish for token-management inheritance: covered in `Command-by-command contract` under `tokens` and `Sharp edges`

Repository verification completed during this work:

- `bun run build` succeeded in `packages/devflare`
- `bun test` succeeded in `packages/devflare`
- the full test suite completed successfully with `467 pass`, `1 skip`, `0 fail` (`468` tests across `56` files) during the final green verification run
- focused follow-up regressions also passed with `10 pass`, `0 fail`, covering login/account fallback, Vite cleanup, composed-worker generation, and preview-registry preservation
- `bun run check` succeeded in `apps/documentation` with `0` errors and `0` warnings
- `bun run types` succeeded in `apps/documentation`
- `bun run build` succeeded in `apps/documentation` after the final docs validation fixes, including redirecting the adapter output to `.adapter-cloudflare` to avoid Windows `EBUSY` cleanup failures and exporting an explicit empty `transport` object from `apps/documentation/src/hooks.ts`
- `tests/integration/examples/configs.test.ts` now exercises `apps/testing/src/fetch.ts` through `devflare/test` with preview and production environment resolution
- the live `documentation` Worker was deleted from Cloudflare and recreated from scratch before the final remote proof pass
- the generated build output was previewed locally from `apps/documentation/.devflare/build/wrangler.jsonc` at `http://127.0.0.1:8791`
- live production deploy succeeded for `apps/documentation`: `https://documentation.refz.workers.dev`
- live preview deploy succeeded on Windows for `apps/documentation`, returning Worker Version ID `6585a91b-fd03-47c6-9a18-15757af79938`, Version Preview URL `https://6585a91b-documentation.refz.workers.dev`, and Preview Alias URL `https://todo-final-sweep-documentation.refz.workers.dev`
- browser validation confirmed the local preview, production URL, preview alias URL, and versioned preview URL all rendered `Welcome to SvelteKit`
- Wrangler revalidated production and preview state directly with `wrangler deployments status`, `wrangler deployments list`, and `wrangler versions list`
- `devflare login` and `devflare account info` were revalidated against real Cloudflare auth from `apps/documentation`, including the configured-account fallback path for credentials that cannot enumerate every account
- `devflare previews list --worker documentation --all` showed the live preview record, preview alias, preview deployment, and production deployments (`1` active preview, `1` active preview alias, `1` active preview deployment, `3` production deployments), and `devflare previews reconcile --worker documentation` preserved those local records even when Cloudflare's native preview discovery omitted them
- `devflare login`, `devflare previews`, and the exported `devflare/cloudflare` helpers now implement the D1-backed preview control plane end to end: provision, deploy-time sync, list, reconcile, cleanup, and shared Zod 4-backed record schemas
- automated coverage exists for the token bootstrap command, but the explicit live one-time token-minting proof remains intentionally unclaimed because it would mint and print a fresh secret
- final diagnostics across `packages/devflare`, `apps/documentation`, and `apps/testing` reported no errors
- the public GitHub Actions page for `https://github.com/Refzlund/devflare` still shows GitHub's starter-workflow state, so real hosted-workflow acceptance remains pending

---

## Summary

Prefer explicit config over discovery, separated surfaces over a monolithic Worker file, and generated output as output rather than source. The safest public path today is explicit `files.fetch`, event-first handlers, explicit bindings, `createTestContext()` for core tests, and `ref()` for cross-worker composition.
