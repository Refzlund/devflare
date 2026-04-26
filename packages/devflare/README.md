# Devflare

**Build Cloudflare Workers like an application, not a pile of glue.**

Devflare is a developer-first layer on top of Cloudflare Workers, Miniflare, Bun, Vite, and Wrangler-compatible config.

It gives you:

- typed config with `defineConfig()`
- convention-friendly worker surfaces
- local orchestration for multi-surface Worker apps
- first-class Durable Object and multi-worker workflows
- test helpers that mirror real handler surfaces
- worker-safe runtime helpers under `devflare/runtime`
- optional Vite and SvelteKit integration when your package actually uses them

Miniflare gives you a local runtime.

Devflare turns that runtime into a **coherent development system**.

For the deeper public contract, caveats, and current feature boundaries, see [`LLM.md`](./LLM.md).

---

## Monorepo contributor workflow

When you are working on `packages/devflare` inside this monorepo, use the repo-root Turbo scripts instead of assembling ad-hoc commands by hand:

- `bun run devflare:dev`
- `bun run devflare:test:watch`
- `bun run devflare:build`
- `bun run devflare:typecheck`
- `bun run devflare:test`
- `bun run devflare:types`
- `bun run devflare:check`
- `bun run devflare:ci`

These scripts intentionally keep the default shared lane focused on the parts of the workspace that are currently stable in local development and CI. In particular, the shared test lane excludes `@devflare/case5-multi-worker`, and the shared check lane stays centered on `apps/documentation` because `cases/case18` still expects Cloudflare-backed resource resolution outside the default contributor workflow.

---

## Cloudflare toolchain support

Devflare tracks one current Cloudflare toolchain major at a time instead of maintaining compatibility shims for multiple Wrangler/Miniflare generations.

Current supported package majors are Wrangler 4, Miniflare 4, and @cloudflare/workers-types 4.

| Package | Supported policy | Why it matters |
|---|---|---|
| `wrangler` | Wrangler 4 | Devflare emits Wrangler-compatible config, runs deploy flows through Wrangler, and follows Wrangler 4 command/config semantics. |
| `miniflare` | Miniflare 4 | Devflare's local runtime and test context are built around the current Miniflare runtime surface. |
| `@cloudflare/workers-types` | `@cloudflare/workers-types` 4 | Generated Env declarations and local mocks follow the current Workers type surface. |

Devflare does not support Wrangler 3. If a Cloudflare feature is newer than Devflare's native config model, use `wrangler.passthrough` with Wrangler 4 syntax and treat that as a documented escape hatch rather than local runtime support.

---

## Install

For a worker-only project, the smallest install is just Devflare:

```bash
bun add -d devflare vite @cloudflare/vite-plugin
```
A local `vite.config.*` opts that package into Vite-backed flows. Without one, Devflare stays in worker-only mode.

---

## Quick start

### 1. Create a config

```ts
// devflare.config.ts
import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'hello-worker',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
})
```

Use `devflare/config` for config files so Bun only loads the lightweight config helpers instead of the full Node-side Devflare barrel.

### 2. Add a fetch handler

```ts
// src/fetch.ts
import type { FetchEvent } from 'devflare/runtime'

export async function fetch({ url }: FetchEvent): Promise<Response> {
	return new Response(`Hello from Devflare: ${url.pathname}`)
}
```

### 3. Generate types

```bash
bunx --bun devflare types
```

### 4. Start development

```bash
bunx --bun devflare dev
```

### 5. Add a test

```ts
// tests/worker.test.ts
import { beforeAll, afterAll, describe, expect, test } from 'bun:test'
import { createTestContext, cf } from 'devflare/test'
import { env } from 'devflare'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

describe('hello-worker', () => {
	test('GET / returns text', async () => {
		const response = await cf.worker.get('/')
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('Hello from Devflare')
	})
})
```

---

## Package entrypoints

Use subpaths intentionally.

| Import | Use for |
|---|---|
| `devflare` | main package entrypoint: `defineConfig`, `defineWorker`, `ref()`, the unified `env`/`ctx`/`event`/`locals` proxies, `sequence`, `defineFetchHandler`, decorators |
| `devflare/config` | lightweight config-only entry for `devflare.config.ts` files (Bun loads only the config helpers, not the full Node-side barrel) |
| `devflare/runtime` | worker-safe runtime helpers: strict `env`, `ctx`, `event`, `locals`, event types/getters, middleware helpers |
| `devflare/test` | `createTestContext`, `cf.*`, local `containers` helpers, `shouldSkip`, `createOfflineEnv`, `createOfflineBindings`, `getOfflineSupportMatrix`, and mock helpers (`createMockKV`/`createMockD1`/`createMockR2`/`createMockRateLimit`/`createMockWorkerLoader`/`createMockMTLSCertificate`/`createMockDispatchNamespace`/`createMockWorkflow`/`createMockPipeline`/`createMockImagesBinding`/`createMockMediaBinding`/`createMockArtifacts`/`createMockAISearchInstance`/`createMockAISearchNamespace`/`createMockEnv`/`createMockTestContext`/`withTestContext`) |
| `devflare/vite` | Vite integration |
| `devflare/sveltekit` | SvelteKit integration |
| `devflare/cloudflare` | Cloudflare account/auth/usage/limits/preferences helpers |
| `devflare/decorators` | decorators only |

Internal bridge and transform helpers are intentionally not re-exported from bare `'devflare'`. If you previously imported them from the main entry, switch to the matching subpath — see "Public API surface and migration notes" below.

### Runtime import rule of thumb

- use `import { env } from 'devflare/runtime'` for **strict request-scoped runtime access**
- use `import { env } from 'devflare'` when you want the **unified proxy** that can fall back to test or bridge context outside a live request

The reduced worker-safe main entry for `devflare` is selected through the package `browser` export condition. `devflare/runtime` is the direct worker-safe runtime subpath.

---

## Event-first handlers

Fresh Devflare code should be event-first:

- `fetch(event: FetchEvent)`
- `queue(event: QueueEvent)`
- `scheduled(event: ScheduledEvent)`
- `email(event: EmailEvent)`
- Durable Object lifecycle handlers with their matching event types

Devflare stores the active event in `AsyncLocalStorage`, and Devflare-managed entrypoints establish that context for you before your handler runs. That includes generated worker wrappers, the local dev server, and `createTestContext()` helper surfaces.

Helpers deeper in the same call trail can recover the current surface with getters like:

- `getFetchEvent()`
- `getQueueEvent()`
- `getScheduledEvent()`
- `getEmailEvent()`
- `getDurableObjectFetchEvent()`

Every getter also exposes `.safe()`, which returns `null` instead of throwing.

In normal app code you should not need to call `runWithEventContext()` or `runWithContext()` yourself.

---

## HTTP structure that matches the runtime today

The built-in HTTP story now has **two cooperating layers**:

1. an optional global fetch module at `src/fetch.ts`
2. a built-in file router rooted at `src/routes/**`

Use `src/fetch.ts` for request-wide middleware and whole-app HTTP concerns.
Use `src/routes/**` for leaf handlers.

### Request-wide middleware

Use `sequence(...)` with a single exported primary fetch entry:

```ts
import { sequence } from 'devflare/runtime'
import type { FetchEvent, ResolveFetch } from 'devflare/runtime'

async function corsHandle(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization'
			}
		})
	}

	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('Access-Control-Allow-Origin', '*')
	return next
}

async function appFetch({ url }: FetchEvent): Promise<Response> {
	return Response.json({ path: url.pathname })
}

export const handle = sequence(corsHandle, appFetch)
```

Important rules:

- `fetch` and `handle` are two names for the same primary HTTP entry
- export **one** of them from a given module, never both
- if `src/fetch.ts` exports same-module `GET()` / `POST()` handlers, those run before file routes for matching methods
- for route-tree apps, keep `src/fetch.ts` focused on request-wide middleware and put leaf handlers in `src/routes/**`

### File router

`src/routes/**` is now a real built-in router.

By default, Devflare discovers `src/routes/**` automatically when that directory exists.

You can customize or disable it with `files.routes`:

```ts
export default {
	name: 'api-worker',
	files: {
		fetch: 'src/fetch.ts',
		routes: {
			dir: 'src/routes',
			prefix: '/api'
		}
	}
}
```

- `files.routes.dir` changes the route root
- `files.routes.prefix` mounts the route tree under a fixed prefix
- `files.routes: false` disables automatic route discovery entirely

Route conventions:

- `src/routes/index.ts` → `/`
- `src/routes/users/index.ts` → `/users`
- `src/routes/users/[id].ts` → `/users/:id`
- `src/routes/blog/[...slug].ts` → `/blog/*` with `params.slug = 'a/b'`
- `src/routes/docs/[[...slug]].ts` → optional catch-all, including `/docs`
- files or directories that start with `_` are ignored so you can keep route-local helpers nearby

Route module exports use the same fetch-module rules as `src/fetch.ts`:

- `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `ALL`
- route-local `fetch(event)` / `handle(event, resolve)` if you want per-route middleware
- `HEAD` falls back to `GET` when no explicit `HEAD` export exists

Route params are available on `event.params`.

```ts
// src/routes/users/[id].ts
export async function GET(event): Promise<Response> {
	return Response.json({ id: event.params.id })
}
```

### Resolution order

When a request comes in, Devflare resolves HTTP in this order:

1. create the initial fetch event and populate `event.params` from the matched file route, if any
2. run the primary `src/fetch.ts` `fetch` / `handle` export if present
3. inside `resolve(event)`, try same-module method handlers from `src/fetch.ts`
4. if no same-module handler matched, dispatch to the matched route module from `src/routes/**`
5. return `404 Not Found` if nothing matched

That means global middleware can see `event.params`, while route files remain the main leaf-handler story.

For example:

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

---

## Config highlights

Devflare looks for these config filenames:

- `devflare.config.ts`
- `devflare.config.mts`
- `devflare.config.js`
- `devflare.config.mjs`

The most important top-level keys are:

- `name`
- `accountId`
- `compatibilityDate`
- `compatibilityFlags`
- `previews`
- `files`
- `bindings`
- `triggers`
- `rules`
- `findAdditionalModules`
- `baseDir`
- `preserveFileNames`
- `vars`
- `secrets`
- `routes`
- `wsRoutes`
- `assets`
- `containers`
- `placement`
- `limits`
- `observability`
- `migrations`
- `rolldown`
- `vite`
- `env`
- `wrangler.passthrough`

### Compatibility dates and flags

`compatibilityDate` compiles to Wrangler's `compatibility_date`. If omitted, Devflare defaults it to the current `YYYY-MM-DD` date before generating Wrangler config.

`compatibilityFlags` compiles to Wrangler's `compatibility_flags`. Devflare always prepends `nodejs_compat` and `nodejs_als`, then appends user flags with duplicates removed. Environment overrides replace the custom flag list, but the forced flags are re-added before Devflare emits generated Wrangler config.

### `vars` vs `secrets`

Keep these separate:

- `vars` are **string-valued config bindings** that compile into generated Wrangler config
- `secrets` are **declarations of expected runtime secret bindings**

`loadConfig()` loads the nearest workspace-root `.env` before evaluating `devflare.config.*`.

When Devflare finds an ancestor `package.json` with `workspaces`, it uses that directory's `.env` file as the shared config-time source for nested packages. If no workspace root is found, it falls back to the nearest ancestor `.env`. Explicit process env values still win over `.env` entries.

Local runtime behavior:

- config-time `.env` loading only affects `process.env` while `devflare.config.*` is evaluated
- worker-only `devflare dev`, `createTestContext()`, and `startMiniflareFromConfig(config, { cwd })` load Worker runtime bindings from `.dev.vars` or `.env*` using Wrangler's current local-dev-var loader
- `.dev.vars` suppresses `.env*`; `.dev.vars.<environment>` replaces generic `.dev.vars`
- when `.dev.vars*` is absent, `.env*` files are merged by Wrangler's local development rules
- `secrets` declarations with `required !== false` compile to Wrangler's experimental `secrets.required` list and filter local secret files to those required names
- example files like `.env.example` and `.dev.vars.example` are a team convention, not a Devflare feature

Practical convention:

- use `.env.example` for config-time/build-time variables read from `process.env`
- use `.dev.vars.example` for Worker runtime secrets expected by `devflare dev` or `createTestContext()`
- keep non-secret infrastructure names such as R2 bucket names and D1 database names in `devflare.config.*`, not in `secrets` or ad-hoc CI env vars

### `config.env`

`config.env` is a Devflare merge layer, not a raw Wrangler env mirror.

When you select `--env name`, Devflare merges `config.env[name]` into the base config before compiling.

### D1 by name and resolved config reuse

`bindings.d1` accepts three shapes:

- `'database-name'`
- `{ id: 'database-id' }`
- `{ name: 'database-name' }`

String shorthand is the stable-name form, so `'database-name'` is equivalent to `{ name: 'database-name' }`.

Use string shorthand or `{ name }` when you want `devflare.config.*` to stay the source of truth for stable D1 naming.

- local dev and tests normalize string and `{ name }` bindings into a stable local identifier, so you do **not** need Cloudflare auth just to run locally
- `build`, `deploy`, `devflare/vite`, and `devflare config print` resolve string and `{ name }` bindings into a real Cloudflare D1 database id before they emit Wrangler-facing config
- `compileConfig()` can only emit Wrangler `d1_databases` from concrete ids, so Node-side automation should call `loadResolvedConfig()` or `resolveConfigResources()` first

That means stable names stay in config, while opaque Cloudflare ids are resolved only for the flows that actually need them.

If you want to inspect or reuse those resolved values in automation, use either:

- `bunx --bun devflare config print --json`
- `bunx --bun devflare config print --json --format wrangler`
- `loadResolvedConfig()` from Node-side tooling

```ts
import { loadResolvedConfig } from 'devflare'

const config = await loadResolvedConfig({
	cwd: process.cwd(),
	environment: 'production'
})

console.log(config.bindings?.r2?.ASSETS)
console.log(config.bindings?.d1?.DB)
```

If you need Cloudflare account/resource data while computing config, use an async config with `devflare/cloudflare` helpers:

```ts
import { defineConfig } from 'devflare/config'
import { account } from 'devflare/cloudflare'

export default defineConfig(async () => {
	const primary = await account.getPrimaryAccount()
	const buckets = await account.r2(primary.id)

	if (!buckets.some((bucket) => bucket.name === 'app-assets')) {
		throw new Error('Missing R2 bucket "app-assets" in the selected Cloudflare account')
	}

	return {
		accountId: primary.id,
		name: 'app-worker',
		compatibilityDate: '2026-03-17',
		bindings: {
			d1: {
				DB: { name: 'app-db' }
			},
			r2: {
				ASSETS: 'app-assets'
			}
		}
	}
})
```

### Native config vs Wrangler coverage

Devflare natively models the Worker config it actively composes around:

- handler/file surfaces
- core bindings and service composition
- routes, assets, containers, migrations, placement, observability, and limits
- Vite and Rolldown metadata
- environment overlays

It does **not** try to re-model every Wrangler key as a first-class Devflare schema field.
For unsupported Wrangler options, use `wrangler.passthrough`.

### Static Assets

Devflare's `assets` config compiles to Wrangler's top-level `assets` object, including the current Workers Static Assets routing options.

```ts
export default {
	name: 'site-worker',
	compatibilityDate: '2026-04-26',
	assets: {
		directory: './public',
		binding: 'ASSETS',
		html_handling: 'force-trailing-slash',
		not_found_handling: 'single-page-application',
		run_worker_first: ['/api/*', '!/api/docs/*']
	}
}
```

`run_worker_first` accepts either `true` or an ordered array of route patterns. Devflare validates the Wrangler enum values for `html_handling` and `not_found_handling`, preserves the configured fields during path rebasing, and leaves actual static asset upload/routing behavior to Wrangler and Cloudflare.

### Observability

Devflare's `observability` config compiles to Wrangler's top-level `observability` object, including current nested log and trace controls.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	observability: {
		enabled: true,
		head_sampling_rate: 0.5,
		logs: {
			enabled: true,
			head_sampling_rate: 0.25,
			invocation_logs: false,
			persist: true,
			destinations: ['workers_logs']
		},
		traces: {
			enabled: true,
			head_sampling_rate: 0.1,
			persist: true,
			destinations: ['cloudflare']
		}
	}
}
```

Sampling rates are validated from `0` to `1`. Devflare emits these settings for Wrangler/Cloudflare deployment, but local Miniflare execution does not emulate Cloudflare Workers Logs, trace persistence, destinations, or invocation-log billing behavior.

### Limits

Devflare's `limits` config compiles to Wrangler's top-level `limits` object.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	limits: {
		cpu_ms: 1000,
		subrequests: 50000
	}
}
```

Devflare currently validates the Wrangler-supported keys `cpu_ms` and `subrequests` and rejects unsupported limit options. Cloudflare enforces Worker limits only when deployed to Cloudflare's network; local Miniflare execution does not terminate requests based on these settings.

### Placement

Devflare's `placement` config compiles to Wrangler's top-level `placement` object for Smart Placement and explicit Placement Hints.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	placement: {
		region: 'aws:us-east-1'
	}
}
```

Use `placement: { mode: 'smart' }` when Cloudflare should infer placement from observed traffic. Use exactly one explicit hint, such as `region`, `host`, or `hostname`, when the upstream location is known. Devflare validates the mutually exclusive Wrangler formats and emits the config for Cloudflare deployment; local Miniflare execution does not simulate geographic placement or `cf-placement` headers.

### Module rules and non-JavaScript assets

Devflare's `rules` config compiles to Wrangler module rules for imported module assets.

```ts
export default {
	name: 'asset-worker',
	compatibilityDate: '2026-04-26',
	files: {
		fetch: './src/index.ts'
	},
	rules: [
		{ type: 'Text', globs: ['**/*.txt'] },
		{ type: 'Data', globs: ['**/*.bin'] },
		{ type: 'CompiledWasm', globs: ['**/*.wasm'] }
	],
	findAdditionalModules: true,
	baseDir: './src',
	preserveFileNames: true
}
```

Supported native rule types are `ESModule`, `CommonJS`, `Text`, `Data`, and `CompiledWasm`. Devflare emits `rules`, `find_additional_modules`, `base_dir`, and `preserve_file_names` for Wrangler, maps `rules` to Miniflare `modulesRules` for file-backed local workers, and generates ambient module declarations for text, data, and compiled WASM imports.

Devflare does not run Rust or other language toolchains for you; compile those projects to JavaScript/WASM before Devflare starts. Python Workers are still beta and currently belong to Cloudflare's `pywrangler` workflow, so Devflare rejects native `PythonModule` and `PythonRequirement` rules. Use `wrangler.passthrough` only when you intentionally hand that beta config directly to Wrangler.

### Durable Object migrations

Devflare's `migrations` config compiles to Wrangler Durable Object migrations.

```ts
export default {
	name: 'counter-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		durableObjects: {
			COUNTER: { className: 'Counter' }
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['Counter']
		}
	]
}
```

Supported native migration directives are `new_sqlite_classes`, `new_classes`, `renamed_classes`, and `deleted_classes`. New Durable Object classes should use `new_sqlite_classes`; `new_classes` is the legacy key-value storage backend. Migration entries are strict so unsupported fields are rejected instead of being silently stripped.

Cloudflare's docs describe Durable Object transfer migrations, but the current Wrangler 4.85 schema Devflare targets does not expose `transferred_classes`. Until Wrangler's package schema and parser support that field, treat transfer migrations as blocked-upstream for native Devflare config. If you are deliberately using a Wrangler build that supports them, replace the generated migrations array with `wrangler.passthrough.migrations`.

Current compile order is:

1. Devflare compiles native config into Wrangler-compatible output
2. `wrangler.passthrough` is shallow-merged on top
3. if the same key exists in both places, the passthrough value wins

```ts
export default defineConfig({
	name: 'advanced-worker',
	files: {
		fetch: 'src/fetch.ts'
	},
	wrangler: {
		passthrough: {
			logpush: true
		}
	}
})
```

Special case: `wrangler.passthrough.main` tells higher-level `build`, `deploy`, and `devflare/vite` flows to stop generating a composed `.devflare/worker-entrypoints/main.ts` and use your explicit main entry instead.

---

## Bindings

Devflare natively models:

- KV
- D1
- R2
- Durable Objects
- Queues
- Rate Limiting
- Version Metadata
- Worker Loaders
- mTLS Certificates
- Dispatch Namespaces
- Workflows
- Pipelines
- Images
- Media Transformations
- Artifacts
- Secrets Store
- Services
- AI
- AI Search
- Vectorize
- Hyperdrive
- Browser Rendering
- Analytics Engine
- `sendEmail`

### Caveats worth knowing up front

- KV, D1, R2, Durable Objects, queues, and the core test/runtime flow are the strongest surfaces
- Workers AI and Vectorize are remote-oriented bindings
- AI Gateway does not use a separate Wrangler binding; it is configured through `bindings.ai`, and Devflare remote tests expose `env.AI.gateway(id)` methods against Cloudflare's REST/API surfaces
- AI Search compiles to Wrangler's `ai_search_namespaces` and `ai_search` bindings and is typed as `AiSearchNamespace` or `AiSearchInstance`; Devflare wires the bindings but does not create namespaces, index data, or simulate Cloudflare search ranking locally
- AutoRAG is treated as the legacy name/API path for AI Search; use Devflare's AI Search bindings instead of adding new `env.AI.autorag()` support
- Rate Limiting uses Wrangler 4's stable `ratelimits` config and Miniflare's local simulator; Cloudflare does not support per-binding remote connections for Rate Limiting in local development
- Version Metadata compiles to Wrangler's `version_metadata` binding; `createTestContext()` uses deterministic local metadata while worker-only dev uses Miniflare's generated local version metadata
- Worker Loaders compile to Wrangler's `worker_loaders` array for Dynamic Workers and are passed to Miniflare locally; Devflare wires the binding but does not bundle or provision dynamic Worker payloads
- mTLS Certificates compile to Wrangler's `mtls_certificates` array and are typed as `Fetcher`; local tests can mock Fetcher behavior, but real certificate presentation is a Cloudflare/Wrangler remote capability
- Dispatch Namespaces compile to Wrangler's `dispatch_namespaces` array and are typed as `DispatchNamespace`; Devflare wires the dispatcher binding but does not manage user Worker upload/lifecycle inside the namespace
- Workflows compile to Wrangler's `workflows` array and are typed as `Workflow`; Devflare passes Workflow bindings to Miniflare locally but leaves resource provisioning and production instance inspection to Wrangler/Cloudflare
- Pipelines compile to Wrangler's `pipelines` array and are typed as `Pipeline` from `cloudflare:pipelines`; local sends are simulated by Miniflare or recorded by `createMockPipeline()`, but the full stream batching and R2 sink lifecycle stays on Cloudflare
- Images compiles to Wrangler's singleton `images` binding and is typed as `ImagesBinding`; Devflare passes it to Miniflare's low-fidelity local Images simulator and pure unit tests can provide `createMockImagesBinding()`
- Media Transformations compiles to Wrangler's singleton `media` binding and is typed as `MediaBinding`; Cloudflare/Miniflare do not provide local simulation, so local worker execution requires remote binding support while pure unit tests can provide `createMockMediaBinding()`
- Artifacts compile to Wrangler's `artifacts` array and are typed as `Artifacts`; Devflare wires the binding to Miniflare's remote binding surface and pure unit tests can use `createMockArtifacts()`, but real Git storage, repo remotes, and namespace access remain Cloudflare-managed
- Containers compile from native top-level `containers` config and `devflare/test` exposes an offline-first Docker/Podman launch shim for explicit container tests; Wrangler/Cloudflare still own deployed rollout controls, registry push, SSH, and the full `@cloudflare/containers` Durable Object runtime
- Secrets Store compiles to Wrangler's `secrets_store_secrets` bindings and worker-only local/dev flows pass those bindings to Miniflare; pure unit tests can provide fixed values with `createMockSecretsStoreSecret()` or `createMockEnv({ secretsStore: ... })`
- Tail Consumers compile to Wrangler's `tail_consumers` array for deployment; local tests trigger Tail handlers directly with `cf.tail.trigger()`
- Services compile to Wrangler's `services` array, including optional `environment` and named `entrypoint` fields; `ref()`-based service bindings are bundled into multi-worker `createTestContext()` runs with both default and named entrypoints available locally
- browser bindings use a named-map authoring shape such as `browser: { BROWSER: { remote: true } }`, but current compile/deploy flows allow exactly one browser binding because Wrangler only supports one
- Browser Run is covered through the Browser Rendering binding surface; Live View, Human in the Loop, recordings, external CDP sessions, and session governance are Cloudflare-managed product features
- `sendEmail` is modeled through config compilation, generated env types, and local runtime/test flows
- R2 bindings are real in local dev/test/runtime flows, but Devflare does **not** publish a stable browser-facing local bucket URL contract; browser-visible local asset flows should go through your Worker routes

For R2 delivery strategy guidance, use the `R2 uploads & delivery` page in the documentation site.

### Cross-feature implementation decisions

Remote mode decisions are per feature, not global. Devflare remote mode is intentionally focused on bindings where the package owns a tested remote shim, such as Workers AI, AI Gateway, and Vectorize. For other bindings, use the binding's documented local simulator, pure mock, Wrangler remote binding support, deployed tests, or `wrangler.passthrough` escape hatch.

Generated types are emitted only for native binding keys. If a project relies on `wrangler.passthrough` for a newer Cloudflare feature, use Wrangler's own generated types or hand-authored project declarations until Devflare adds native schema/compiler/typegen support.

Test helpers exist when Devflare provides a deterministic local mock or useful pure assertion surface. Features whose meaningful behavior lives in the Cloudflare control plane are documented with remote/deployed-test guidance instead of pretending to be locally complete.

Every native binding documented above includes a minimal config and Env usage example in this README or the feature-specific section below. Move from `wrangler.passthrough` to native config when a binding appears in the native list, then rerun `bunx --bun devflare types` so generated Env declarations follow Devflare's supported shape.

Cloudflare dependency CI targets the pinned current Wrangler, Miniflare, and workers-types majors documented in Cloudflare toolchain support. Devflare does not maintain a compatibility matrix for older Wrangler or Miniflare majors; upgrade the Cloudflare toolchain together with the package when adopting newly native bindings.

### Service bindings and entrypoints

Service bindings use Cloudflare's Worker-to-Worker binding model.

```ts
export default {
	name: 'gateway-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		services: {
			AUTH: { service: 'auth-worker' },
			ADMIN: {
				service: 'auth-worker',
				environment: 'production',
				entrypoint: 'AdminEntrypoint'
			}
		}
	}
}
```

For multi-worker apps in one repo, prefer `ref()` so Devflare can resolve the target config for local tests and type generation:

```ts
const authWorker = ref(() => import('./auth/devflare.config'))

export default defineConfig({
	name: 'gateway-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		services: {
			AUTH: authWorker.worker,
			ADMIN: authWorker.worker('AdminEntrypoint')
		}
	}
})
```

Devflare validates the service binding shape strictly, compiles `service`, `environment`, and `entrypoint` to Wrangler, validates deployed target worker names during deploy, and uses discovered `src/worker.*` plus `files.entrypoints`/`ep.*` classes for multi-worker `createTestContext()` coverage.

For D1 and Hyperdrive, prefer stable config names when you can:

```ts
export default {
	bindings: {
		d1: {
			DB: { name: 'app-db' },
			AUDIT: { id: 'existing-d1-id' }
		},
		hyperdrive: {
			DB: 'app-postgres',
			ANALYTICS_DB: { id: 'existing-hyperdrive-id' }
		},
		r2: {
			ASSETS: 'app-assets'
		}
	}
}
```

Use `.env*` and `secrets` for values that are actually secret or genuinely process-specific. Do **not** move stable bucket/database/Hyperdrive names into env vars just to make other tooling happy.

### Workers AI local and remote behavior

Workers AI bindings compile to Wrangler's top-level `ai` object. Devflare preserves Wrangler's `remote` flag for local development tooling and the optional `staging` flag when you want Cloudflare's staging AI environment:

```ts
export default defineConfig({
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	accountId: 'your-cloudflare-account-id',
	bindings: {
		ai: {
			binding: 'AI',
			remote: true,
			staging: true
		}
	}
})
```

Cloudflare does not provide a local Workers AI model simulation. In Wrangler's local development model, Workers AI always connects remotely; setting `remote: false` is an error and omitting `remote` still connects remotely with a warning.

Devflare's boundary is intentionally narrower:

- `devflare build` and `devflare deploy` emit `binding`, `remote`, and `staging` for Wrangler
- worker-only Devflare dev does not synthesize Wrangler's remote proxy session for AI
- `createTestContext()` exposes AI only through Devflare remote mode (`DEVFLARE_REMOTE=1` or `devflare remote enable`), using Cloudflare's REST API for `env.AI.run()`
- the remote-test shim exposes `env.AI.gateway(id)` methods, but direct `env.AI.run(model, input, { gateway })` behavior still belongs to Cloudflare's native Worker runtime

Remote Workers AI calls hit Cloudflare models and can incur usage. For deterministic pure unit tests, inject your own fake `Ai` object with `createMockEnv({ custom: { AI: fakeAi } })`.

### AI Gateway binding methods

AI Gateway does not use a separate Wrangler binding. Add the normal Workers AI binding and call Gateway methods from `env.AI`:

```ts
export default defineConfig({
	name: 'gateway-worker',
	compatibilityDate: '2026-04-26',
	accountId: 'your-cloudflare-account-id',
	bindings: {
		ai: {
			binding: 'AI',
			remote: true
		}
	}
})
```

In Worker code, `env.AI.run(model, input, { gateway: { id: 'my-gateway' } })` is Cloudflare's native runtime path for routing model calls through a gateway. The method `env.AI.gateway(id)` exposes `patchLog()`, `getLog()`, `getUrl()`, and `run()` for log feedback, log lookup, SDK base URLs, and universal provider requests.

Devflare's remote `createTestContext()` AI binding implements `env.AI.gateway(id)` with Cloudflare-facing methods:

- `getUrl(provider?)` builds the current Gateway URL shape for the configured account
- `run(request)` posts a universal AI Gateway request and returns the raw `Response`
- `patchLog(logId, data)` and `getLog(logId)` call Cloudflare's AI Gateway log APIs

These methods require `DEVFLARE_REMOTE=1` or `devflare remote enable`, Cloudflare auth, and a real gateway in the selected account. Devflare does not create gateways, configure provider credentials, emulate cache/rate-limit/billing behavior locally, or translate the third argument of `env.AI.run()` into a remote REST call. For deterministic unit tests, inject a fake `Ai` or `AiGateway` object.

### AI Search bindings

AI Search exposes two current Worker binding families. Use `bindings.aiSearchNamespaces` for namespace bindings and `bindings.aiSearch` for instance bindings:

```ts
export default defineConfig({
	name: 'search-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		aiSearchNamespaces: {
			AI_SEARCH: {
				namespace: 'default',
				remote: true
			}
		},
		aiSearch: {
			DOCS_SEARCH: {
				instanceName: 'docs',
				remote: true
			}
		}
	}
})
```

Devflare emits those as Wrangler's `ai_search_namespaces` and `ai_search` arrays:

```json
{
	"ai_search_namespaces": [
		{
			"binding": "AI_SEARCH",
			"namespace": "default",
			"remote": true
		}
	],
	"ai_search": [
		{
			"binding": "DOCS_SEARCH",
			"instance_name": "docs",
			"remote": true
		}
	]
}
```

Generated env types expose namespace bindings as `AiSearchNamespace` and instance bindings as `AiSearchInstance`. `createTestContext()` and worker-only `devflare dev` pass AI Search binding metadata to Miniflare, but Devflare does not create AI Search resources, crawl or index content, clone data for preview scopes, or emulate Cloudflare's search behavior. The `remote` flag is preserved for Wrangler-compatible tooling; worker-only Devflare dev does not synthesize Wrangler's remote proxy connection.

Remote AI Search calls hit real Cloudflare resources and can incur usage. For deterministic unit tests, inject a fake search binding with `createMockEnv({ custom: { AI_SEARCH: fakeNamespace, DOCS_SEARCH: fakeInstance } })`.

### AutoRAG migration stance

Cloudflare's current AutoRAG Workers binding docs redirect to AI Search, and the previous `env.AI.autorag()` binding is no longer the recommended Worker API. Devflare therefore treats AutoRAG as a legacy name for the same product family rather than a separate binding surface.

Use `bindings.aiSearchNamespaces` or `bindings.aiSearch` for new work:

```ts
export default defineConfig({
	name: 'search-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		aiSearch: {
			DOCS_SEARCH: {
				instanceName: 'docs'
			}
		}
	}
})
```

Devflare does not add a legacy `autorag` config key, generate `env.AI.autorag()` shims, or emulate the old method shape in remote tests. Projects still using the old Workers AI method should migrate to the AI Search instance or namespace bindings so generated Wrangler config, Env types, and Miniflare metadata all follow the current Cloudflare surface.

### Browser Rendering local and remote behavior

Browser Rendering bindings compile to Wrangler's top-level singleton `browser` object. Devflare still accepts the older string map form, but use the object form when you need Wrangler's `remote` flag:

```ts
export default defineConfig({
	name: 'render-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		browser: {
			BROWSER: {
				remote: true
			}
		}
	}
})
```

Devflare emits:

```json
{
	"browser": {
		"binding": "BROWSER",
		"remote": true
	}
}
```

Cloudflare recommends `remote: true` when local development needs a real Cloudflare Browser Rendering session. Devflare's own worker-only dev server keeps using its local Browser Rendering shim and does not create Wrangler's remote proxy session; run through Wrangler or Cloudflare's Vite tooling when you need to exercise the remote Browser Rendering service from local Worker code.

`createTestContext()` does not start a real browser by default. For unit tests, inject a fake `Fetcher` with `createMockEnv({ custom: { BROWSER: fakeBrowserFetcher } })`, or cover full browser flows through a higher-level local dev or deployed integration test. Preview-scoped string labels such as `browser: { BROWSER: preview.scope()('browser') }` remain accepted for old configs, but Browser Rendering does not own account-scoped resources that Devflare can provision or delete.

### Browser Run product boundary

Browser Run is the current product name for Browser Rendering. Devflare's native config surface remains the Worker browser binding, compiled to Wrangler's singleton `browser` object and typed as a `Fetcher`.

That means Devflare handles the binding and the local worker-only shim, but Cloudflare owns the product behaviors around remote browser sessions:

- Live View and remote session inspection
- Human in the Loop handoff
- browser recordings and replay
- external CDP connection workflows
- account/session limits, billing, and queueing

Devflare does not manage Live View URLs, Human in the Loop handoff, recording storage, external CDP credentials, or Browser Run session lifecycle APIs. Use `browser: { BROWSER: { remote: true } }` with Wrangler or Cloudflare's Vite tooling when local development needs the real Browser Run service. Use Devflare's local shim only for local `@cloudflare/puppeteer` connectivity, and cover interactive Browser Run product behavior with deployed or Wrangler-backed integration tests.

### Containers local testing

Cloudflare Containers are a Worker plus Container image feature, not just an env binding. Wrangler's config uses a top-level `containers` array, a matching Durable Object binding, and migrations for the Container class.

Devflare supports native top-level `containers` config and compiles it to Wrangler's `containers` array. Keep the matching Durable Object binding and SQLite migration in normal Devflare config:

```ts
export default defineConfig({
	name: 'container-worker',
	compatibilityDate: '2026-04-26',
	containers: [
		{
			className: 'MyContainer',
			image: './Dockerfile',
			maxInstances: 5
		}
	],
	bindings: {
		durableObjects: {
			MY_CONTAINER: {
				className: 'MyContainer'
			}
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['MyContainer']
		}
	]
})
```

For tests that need the container process itself, `devflare/test` exposes a host-side launch shim:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { containers, shouldSkip } from 'devflare/test'

const skipContainers = await shouldSkip.containers
let api: Awaited<ReturnType<typeof containers.start>>

describe.skipIf(skipContainers)('container integration', () => {
	beforeAll(async () => {
		api = await containers.start('MyContainer', {
			port: 8080,
			instance: 'case-1'
		})
	})

	afterAll(async () => {
		await api.stop()
	})

	test('responds through the local container process', async () => {
		const response = await api.fetch('/health')
		expect(await response.text()).toBe('ok')
	})
})
```

Devflare container tests are offline-first by default:

- Set `DEVFLARE_CONTAINER_TESTS=1` before real container tests run
- Docker or Podman must be installed and the engine/socket must be reachable (`docker info` or `podman info` must succeed)
- image references must already exist locally; Devflare checks with `docker image inspect` / `podman image inspect` and does not pull by default
- local Dockerfile builds pass the engine's no-pull option (`--pull=false` for Docker, `--pull=never` for Podman) so missing base layers fail clearly instead of silently using the network
- pass `offline: false` to `containers.start()` only when a test is intentionally allowed to pull an image
- GitHub Actions jobs can opt in when Docker is available; restricted Cloudflare/service runners should leave `DEVFLARE_CONTAINER_TESTS` unset and let `shouldSkip.containers` skip cleanly

The returned container handle supports `fetch()`, `logs()`, `getState()`, `stop()`, `destroy()`, and automatic cleanup when `env.dispose()` tears down a `createTestContext()` run. This shim is for launching and interacting with local processes during tests. Devflare does not fully emulate the `@cloudflare/containers` Durable Object runtime, Container class lifecycle hooks, placement behavior, rollout controls, SSH, registry credentials, or deployed image push. Use Wrangler's `containers` commands and Cloudflare's local/deployed Container workflow for those behaviors. `wrangler.passthrough.containers` still works as an escape hatch for Wrangler fields Devflare has not modeled yet, with passthrough values winning during the final shallow merge.

### Sandbox SDK passthrough stance

Cloudflare's Sandbox SDK is built on Containers. Its minimum Wrangler setup is the same three-part shape: a `containers` entry for the Sandbox image, a Durable Object binding for the `Sandbox` class, and a migration that initializes that class.

Use normal Devflare config for the Container, Durable Object, and migration:

```ts
export default defineConfig({
	name: 'sandbox-worker',
	compatibilityDate: '2026-04-26',
	compatibilityFlags: ['nodejs_compat'],
	containers: [
		{
			className: 'Sandbox',
			image: './Dockerfile'
		}
	],
	bindings: {
		durableObjects: {
			Sandbox: {
				className: 'Sandbox'
			}
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['Sandbox']
		}
	]
})
```

Devflare can launch the Sandbox container image through the same offline-first `devflare/test` container shim, but it does not emulate the Sandbox SDK APIs, run untrusted code safely by itself, manage Sandbox backup credentials, or validate Sandbox-specific environment variables. Keep those flows on the official Sandbox SDK, Wrangler Containers tooling, and deployed integration tests.

### Agents SDK stance

Cloudflare Agents are Durable Objects with an SDK layer. The required Wrangler surface is a Durable Object binding plus migrations for each Agent class, and Devflare supports that natively:

```ts
export default defineConfig({
	name: 'agent-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		durableObjects: {
			ChatAgent: {
				className: 'ChatAgent'
			}
		}
	},
	migrations: [
		{
			tag: 'v1',
			new_sqlite_classes: ['ChatAgent']
		}
	]
})
```

Devflare compiles the binding and migration to Wrangler and runs Durable Object-backed tests through its existing Durable Object support. It does not add Agents-specific decorators, client SDK helpers, durable execution recovery assertions, or AI/chat framework abstractions; those stay in `agents` and Cloudflare's runtime. Use deployed or Wrangler integration tests for Agents behavior that depends on Cloudflare-side scheduling, hibernation, recovery, or client connection semantics.

### Vectorize local and remote behavior

Vectorize bindings compile to Wrangler's `vectorize` array. Devflare authoring uses `indexName`, plus Wrangler's `remote` flag when you want local development tooling that understands remote bindings to connect to the real index:

```ts
export default defineConfig({
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		vectorize: {
			DOCUMENTS: {
				indexName: 'app-documents',
				remote: true
			}
		}
	}
})
```

Cloudflare does not provide a local Vectorize simulation. Devflare therefore treats Vectorize as remote-only for runtime behavior:

- `devflare build` and `devflare deploy` emit `index_name` and `remote` for Wrangler
- normal deploys verify that named Vectorize indexes already exist and fail before creating other resources if they do not
- preview deploys can create preview-scoped Vectorize indexes by cloning the base index dimensions, metric, and description; vector data is not copied
- `createTestContext()` only exposes Vectorize through Devflare remote mode (`DEVFLARE_REMOTE=1` or `devflare remote enable`), using Cloudflare's REST API directly

Remote Vectorize operations affect the real index and can incur Cloudflare usage. For deterministic pure unit tests, inject your own fake `VectorizeIndex` object with `createMockEnv({ custom: { DOCUMENTS: fakeIndex } })`.

### Hyperdrive local and remote behavior

Hyperdrive bindings accept a stable config name, `{ name }`, or `{ id }`. Devflare preserves names in offline build artifacts, resolves names to real Hyperdrive config IDs for deploys, and fails early if a named Hyperdrive config is missing. It does not auto-create Hyperdrive configs because the origin database credentials needed to create one cannot be inferred or cloned from Cloudflare.

For local dev and `createTestContext()`, provide a direct database connection string when you want a usable local Hyperdrive binding:

```ts
export default defineConfig({
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		hyperdrive: {
			POSTGRES: {
				name: 'app-postgres',
				localConnectionString: 'postgres://user:password@localhost:5432/app'
			}
		}
	}
})
```

The `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` environment variable takes precedence over `localConnectionString`, matching Wrangler's local development behavior. Local Hyperdrive connects directly to the configured database through Miniflare; it does not exercise Cloudflare Hyperdrive caching or connection pooling. Use a deployed Worker or Wrangler remote development when you need to test those Cloudflare-side behaviors.

Preview-scoped Hyperdrive bindings have three explicit paths:

- create the preview Hyperdrive config in Cloudflare and let Devflare resolve the preview-scoped name
- set `previewId` on the binding when the preview Hyperdrive config has a fixed ID
- set `previewFallback: 'base'` to intentionally reuse the base Hyperdrive config when no preview config exists

`previewLocalConnectionString` is still accepted as a legacy local-dev alias, but new config should use `localConnectionString`. A local connection string helps local dev/tests only; it is not a substitute for a Cloudflare Hyperdrive config during deploy.

### Tail Consumers

Devflare authoring uses `tailConsumers` and compiles it to Wrangler's top-level `tail_consumers` array. Use string shorthand for the common case, or object form when the tail Worker uses a Wrangler environment.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	tailConsumers: [
		'observability-tail',
		{
			service: 'staging-observability-tail',
			environment: 'staging'
		}
	]
}
```

Tail Worker source files can be configured through `files.tail` or discovered at `src/tail.ts`:

```ts
export default {
	files: {
		tail: 'src/observability-tail.ts'
	}
}
```

`cf.tail.trigger()` supports both Devflare's event-object style and Cloudflare's native `tail(events, env, ctx)` shape.

### Rate Limiting

Devflare authoring uses `bindings.rateLimits` and compiles it to Wrangler's top-level `ratelimits` array.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		rateLimits: {
			MY_RATE_LIMITER: {
				namespaceId: '1001',
				simple: {
					limit: 100,
					period: 60
				}
			}
		}
	}
}
```

Generated env types expose the binding as `RateLimit`:

```ts
const { success } = await env.MY_RATE_LIMITER.limit({ key: userId })
```

`createTestContext()` and worker-only `devflare dev` pass Rate Limiting bindings to Miniflare for local simulation. Pure unit tests can use `createMockRateLimit()` or `createMockEnv({ rateLimits: ... })`.

### Version Metadata

Devflare authoring uses `bindings.versionMetadata` and compiles it to Wrangler's top-level `version_metadata` object.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		versionMetadata: {
			binding: 'CF_VERSION_METADATA'
		}
	}
}
```

Generated env types expose the binding as `WorkerVersionMetadata`:

```ts
const { id, tag, timestamp } = env.CF_VERSION_METADATA
```

`createTestContext()` and `createMockEnv({ versionMetadata: 'CF_VERSION_METADATA' })` expose deterministic local metadata:

```ts
{
	id: 'devflare-local-version',
	tag: 'local',
	timestamp: '1970-01-01T00:00:00.000Z'
}
```

### Worker Loaders

Devflare authoring uses `bindings.workerLoaders` and compiles it to Wrangler's top-level `worker_loaders` array.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		workerLoaders: {
			LOADER: {}
		}
	}
}
```

Generated env types expose each binding as `WorkerLoader`:

```ts
const stub = env.LOADER.load({
	compatibilityDate: '2026-04-26',
	mainModule: 'index.js',
	modules: {
		'index.js': 'export default { fetch() { return new Response("ok") } }'
	}
})
```

`createTestContext()` and worker-only `devflare dev` pass Worker Loader bindings to Miniflare. Pure unit tests can use `createMockWorkerLoader()` or `createMockEnv({ workerLoaders: ['LOADER'] })`; pass an explicit `stub` when the test needs behavior from `load()` or `get()`.

### mTLS Certificates

Devflare authoring uses `bindings.mtlsCertificates` and compiles it to Wrangler's top-level `mtls_certificates` array.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		mtlsCertificates: {
			API_CERT: {
				certificateId: 'cert-123',
				remote: true
			}
		}
	}
}
```

String shorthand and Wrangler's snake_case object form are also accepted:

```ts
export default {
	bindings: {
		mtlsCertificates: {
			API_CERT: 'cert-123',
			LEGACY_CERT: { certificate_id: 'cert-456' }
		}
	}
}
```

Generated env types expose each binding as `Fetcher`:

```ts
const response = await env.API_CERT.fetch('https://secured-origin.example')
```

Devflare does not upload certificates or resolve certificate names. Use the certificate ID returned by `wrangler mtls-certificate upload` or `wrangler mtls-certificate list`. For pure unit tests, provide the Fetcher behavior explicitly:

```ts
const env = createMockEnv({
	mtlsCertificates: {
		API_CERT: async () => new Response('ok')
	}
})
```

### Dispatch Namespaces

Devflare authoring uses `bindings.dispatchNamespaces` and compiles it to Wrangler's top-level `dispatch_namespaces` array.

```ts
export default {
	name: 'dispatch-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		dispatchNamespaces: {
			DISPATCHER: {
				namespace: 'customers',
				outbound: {
					service: 'outbound-worker',
					parameters: ['ctx']
				},
				remote: true
			}
		}
	}
}
```

String shorthand is accepted for the common case:

```ts
export default {
	bindings: {
		dispatchNamespaces: {
			DISPATCHER: 'customers'
		}
	}
}
```

Generated env types expose each binding as `DispatchNamespace`:

```ts
const response = await env.DISPATCHER.get('tenant-worker').fetch(request)
```

Devflare does not upload user Workers, create dispatch namespaces, or simulate the full Workers for Platforms lifecycle. `createTestContext()` and worker-only `devflare dev` pass the binding to Miniflare; pure unit tests can model named tenant Workers explicitly:

```ts
const env = createMockEnv({
	dispatchNamespaces: {
		DISPATCHER: {
			workers: {
				tenant: async () => new Response('ok')
			}
		}
	}
})
```

### Workers for Platforms lifecycle stance

Devflare supports dispatch namespace bindings, not the tenant Worker control plane. The native surface is `bindings.dispatchNamespaces`, Wrangler output, generated `DispatchNamespace` typing, Miniflare binding metadata, and pure-test mocks.

Workers for Platforms also includes user Worker upload, script metadata, placement, dynamic routing, outbound workers, tag-based routing, customer subdomains, limits, and lifecycle operations around the scripts inside a dispatch namespace. Those are Cloudflare control-plane concerns.

Devflare does not upload user Workers, manage Worker metadata, create dispatch namespaces, emulate dispatch routing for arbitrary uploaded tenants, or provide a local tenant-script registry. For local tests, use `createMockDispatchNamespace()` or `createMockEnv({ dispatchNamespaces })` and model the tenant Workers needed by the test explicitly. For end-to-end Workers for Platforms flows, use Cloudflare/Wrangler integration tests against a real dispatch namespace.

### Workflows

Devflare authoring uses `bindings.workflows` and compiles it to Wrangler's top-level `workflows` array.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		workflows: {
			ORDER_WORKFLOW: {
				name: 'orders',
				className: 'OrderWorkflow',
				scriptName: 'workflow-worker',
				limits: {
					steps: 10000
				}
			}
		}
	}
}
```

Generated env types expose each binding as `Workflow`:

```ts
const instance = await env.ORDER_WORKFLOW.create({ id: 'order-123' })
return Response.json(await instance.status())
```

`createTestContext()` and worker-only `devflare dev` pass Workflow bindings to Miniflare, mapping `limits.steps` to Miniflare's local `stepLimit`. Pure unit tests can use `createMockWorkflow()` or `createMockEnv({ workflows: ['ORDER_WORKFLOW'] })`. Devflare does not discover or provision Workflow resources; Wrangler and Cloudflare remain the source of truth for deployed Workflow lifecycle and production instance state.

### Workflows local simulation stance

Local Workflows are useful for handler-level tests: binding shape, `create()` calls, status polling, step-limit plumbing, and pure mock behavior. They are intentionally a fast local approximation, not a full copy of Cloudflare's production Workflow control plane.

Use deployed or Wrangler-backed tests for production Workflow lifecycle behavior, including durable retries, long-running execution, scheduling, step recovery, concurrency, observability, production instance inspection, and Cloudflare lifecycle state. Devflare does not create Workflow resources, replay production history locally, or guarantee that Miniflare's simulator matches every hosted Workflow edge case.

### Pipelines

Devflare authoring uses `bindings.pipelines` and compiles it to Wrangler's top-level `pipelines` array.

```ts
export default {
	name: 'events-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		pipelines: {
			EVENTS: 'events-stream',
			AUDIT: {
				pipeline: 'audit-stream',
				remote: true
			}
		}
	}
}
```

Generated env types expose each binding as `Pipeline` from `cloudflare:pipelines`:

```ts
await env.EVENTS.send([{ event: 'signup' }])
```

`createTestContext()` and worker-only `devflare dev` pass Pipeline bindings to Miniflare, whose local implementation accepts `send()` calls without running the full pipeline. Pure unit tests can use `createMockPipeline()` or `createMockEnv({ pipelines: ['EVENTS'] })` to record sent records. Devflare does not create streams/pipelines or manage R2 sink lifecycle; provision those resources with Wrangler or Cloudflare.

### Pipelines source and sink lifecycle stance

Pipelines local tests are useful for producer-code assertions: the binding exists, `send()` is called with the expected records, and pure mocks can record those records for inspection. They do not prove hosted stream durability, batching, SQL transformation, exactly-once delivery, or sink writes.

Devflare does not create streams, pipelines, SQL transformations, sinks, or R2 buckets, and it does not discover Pipeline resources by friendly name. Configure the Worker binding with the pipeline name that Cloudflare expects, provision streams and sinks with Wrangler or the Cloudflare API, and use deployed or Wrangler-backed tests when the source-to-sink lifecycle matters.

### Images

Devflare authoring uses `bindings.images` as a named map and compiles the single configured binding to Wrangler's top-level `images` object.

```ts
export default {
	name: 'image-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		images: {
			IMAGES: {
				remote: true
			}
		}
	}
}
```

Generated env types expose the binding as `ImagesBinding`:

```ts
const response = (await env.IMAGES
	.input(stream)
	.transform({ width: 320 })
	.output({ format: 'image/webp' })).response()
```

Wrangler and Miniflare currently support one Images binding per Worker, so Devflare rejects multiple `bindings.images` entries. `createTestContext()` and worker-only `devflare dev` pass the binding to Miniflare's local Images simulator. Pure unit tests can use `createMockImagesBinding()` or `createMockEnv({ images: 'IMAGES' })`; the default mock covers `info()` and the transform/output chain, while hosted Images CRUD should be supplied as a custom binding if a test needs it.

### Images transformation testability stance

Images local tests can validate Worker integration code: the binding is present, image streams flow through `input()`, transform/output options are assembled correctly, and a response is returned with the expected content type. Cloudflare's local Images support is lower fidelity than the hosted service, and Devflare's pure mock does not perform pixel processing, codec validation, billing accounting, cache behavior, or hosted image storage operations.

Devflare does not provision hosted Images storage, variants, signed URLs, or custom delivery rules, and it does not discover Images resources by account state. Use Wrangler/Cloudflare remote development or deployed tests for high-fidelity transformations, `draw()` behavior, content credentials, private delivery, transformation billing, or hosted Images CRUD.

### Media Transformations

Devflare authoring uses `bindings.media` as a named map and compiles the single configured binding to Wrangler's top-level `media` object.

```ts
export default {
	name: 'media-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		media: {
			MEDIA: {
				remote: true
			}
		}
	}
}
```

Generated env types expose the binding as `MediaBinding`:

```ts
const result = env.MEDIA
	.input(video.body)
	.transform({ width: 480, height: 270 })
	.output({ mode: 'video', duration: '5s' })

return result.response()
```

Wrangler and Miniflare currently support one Media Transformations binding per Worker, so Devflare rejects multiple `bindings.media` entries. The binding does not support local simulation; use `remote: true` with Wrangler-backed local development for real media operations. Pure unit tests can use `createMockMediaBinding()` or `createMockEnv({ media: 'MEDIA' })`; the default mock covers the fixed `input().transform().output()` and `input().output()` chains without doing video processing.

### Media Transformations remote binding stance

Media Transformations local execution is remote-binding only. Devflare can emit the singleton `media` binding, generate `MediaBinding` types, pass the binding metadata to Miniflare/Wrangler, and provide a pure unit mock for application code that assembles the fixed `input().transform().output()` or `input().output()` chain.

Devflare does not configure zone-level transformation enablement, source origins, signed URL policy, cache behavior, or billing controls, and it does not simulate video/audio/frame extraction locally. Use Cloudflare remote binding development or deployed tests for real transformation output, origin restrictions, media errors, caching, Stream/Media billing, and R2 writeback flows.

### Artifacts

Devflare authoring uses `bindings.artifacts` and compiles it to Wrangler's top-level `artifacts` array.

```ts
export default {
	name: 'artifacts-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		artifacts: {
			ARTIFACTS: 'default',
			ARCHIVE: {
				namespace: 'archive',
				remote: true
			}
		}
	}
}
```

Generated env types expose each binding as `Artifacts`:

```ts
const created = await env.ARTIFACTS.create('starter-repo', {
	description: 'Repository for automation experiments'
})

return Response.json({
	name: created.name,
	remote: created.remote
})
```

`createTestContext()` and worker-only `devflare dev` pass Artifacts bindings to Miniflare using each configured namespace. Artifacts is a Cloudflare-managed Git-compatible service, so Devflare does not create namespaces, provide a durable local Git backend, or emulate remote Git protocol behavior. Pure unit tests can use `createMockArtifacts()` or `createMockEnv({ artifacts: ['ARTIFACTS'] })` for in-memory repo/token assertions.

### Artifacts persistence and deployment stance

Artifacts pure mocks are in-memory and process-local. They are useful for unit tests that assert application calls to `create()`, `get()`, `list()`, `delete()`, fork/import helpers, and token methods, but they do not write Git objects, survive process restarts, expose real remotes, or model Cloudflare's replicated repository storage.

Devflare does not create Artifacts namespaces, persist local Git repositories, or emulate Git-over-HTTPS remotes. Use Cloudflare/Wrangler or the Artifacts API for namespace access, deployed repository behavior, token authorization, Git client interoperability, imports, and cross-region persistence.

### Secrets Store

Devflare authoring uses `bindings.secretsStore` and compiles it to Wrangler's top-level `secrets_store_secrets` array.

```ts
export default {
	name: 'api-worker',
	compatibilityDate: '2026-04-26',
	bindings: {
		secretsStore: {
			API_TOKEN: {
				storeId: 'store-123',
				secretName: 'api-token'
			}
		}
	}
}
```

Generated env types expose each binding as `SecretsStoreSecret`:

```ts
const token = await env.API_TOKEN.get()
```

Devflare does not resolve Secrets Store resources by name or move secret values into generated config. Use the Cloudflare store id and secret name in config. For pure unit tests, pass explicit values:

```ts
const env = createMockEnv({
	secretsStore: {
		API_TOKEN: 'test-token'
	}
})
```

---

## Dev, build, deploy, Vite, and Rolldown

Devflare is worker-only first.

### Mode selection

- a local `vite.config.*` or a non-empty `config.vite` opts the current package into **Vite-backed** flows
- Vite-related dependencies without either a local config or inline `config.vite` do **not** switch the package into Vite mode
- without a local `vite.config.*` and without inline `config.vite`, `dev`, `build`, and `deploy` stay in **worker-only** mode

### Mental model

Vite and Rolldown both matter here, but they do different jobs:

- **Vite** is the optional outer app/framework host. Devflare enters Vite-backed mode when the current package has a local `vite.config.*` or a non-empty `config.vite`, and then Devflare merges that config into the actual Vite config it runs.
- **Rolldown** is the inner builder Devflare uses when Devflare itself needs to transform Worker code into runnable bundles. Today that covers worker-only main-worker bundles and Durable Object bundles.

Short version:

- no local `vite.config.*` and no inline `config.vite` → no Vite process; Devflare stays worker-only
- `.svelte` imported by a worker-only fetch/route/queue/scheduled/email surface or by a Durable Object → that compilation belongs to the Rolldown plugin pipeline, not to the main Vite app build
- generated `.devflare/worker-entrypoints/main.ts` is separate Devflare glue that composes worker surfaces when needed

### Current behavior that matters

- worker-only `dev` is a real first-class path
- `build` and `deploy` skip Vite only when the current package has no effective Vite config (`vite.config.*` or inline `config.vite`)
- when Devflare runs Vite, `config.vite` is merged into the actual Vite config, and Devflare writes a generated `.devflare/vite.config.mjs` when it needs one
- higher-level `build`, `deploy`, and `devflare/vite` flows currently synthesize `.devflare/worker-entrypoints/main.ts` whenever a fetch, route tree, queue, scheduled, or email surface is discovered
- `wrangler.passthrough.main` disables that composed-entry generation path
- in worker-only mode, Devflare now bundles the composed main worker to `.devflare/worker-entrypoints/main.js` via Rolldown before handing it to Miniflare or Wrangler
- Rolldown still rebuilds Durable Object worker code in unified Vite dev flows where Vite hosts the outer app

For the full contract-level explanation and a concrete Rolldown + Svelte example, see the generated [`LLM.md`](./LLM.md) handbook entries for workflow modes and Svelte in workers.

---

## Deploys, previews, tokens, and GitHub Actions

### Production deploys vs same-Worker previews

`devflare deploy` publishes production the usual Wrangler way.

`devflare deploy --preview` is different: it uploads a **new version of the same Worker** with `wrangler versions upload` instead of creating a separate Worker environment.

Named preview deploys are now the primary preview model:

- each preview scope deploys its own dedicated Worker (or Worker family)
- preview-scoped bindings and resources can be assigned only to that scope
- feature branches and PRs get stable preview URLs from the scope name itself

Preview scope names should still be lowercase and dash-friendly so they map cleanly into Worker names and `workers.dev` URLs.

Useful preview examples:

```bash
bunx --bun devflare deploy --preview next
bunx --bun devflare deploy --preview pr-42
```

When available, Devflare prints the Worker version id and preview URL outputs after the deploy finishes.

### Login and preview scope helpers

`devflare login` is the thin authentication wrapper for Cloudflare.

- by default it reuses existing auth when Devflare can already resolve a Cloudflare API token
- `devflare login --force` opens `wrangler login` again even when auth is already present
- after login, Devflare prints the primary account when Cloudflare account discovery succeeds

`devflare previews` is the config-aware preview-scope surface for dedicated preview Workers.

Useful commands:

```bash
bunx --bun devflare previews
bunx --bun devflare previews bindings --scope next
bunx --bun devflare previews cleanup --scope next --apply
bunx --bun devflare previews cleanup --all --apply
```

Current behavior:

- `devflare previews` lists stable workers plus discovered dedicated preview scopes for the current worker family using live Cloudflare Worker names
- `devflare previews bindings` resolves preview-scoped resources for one scope and shows how many deployed workers reference them
- `devflare previews cleanup` deletes dedicated preview Workers plus preview-scoped KV, D1, R2, Queue, Vectorize, and reusable Hyperdrive resources for one scope or every discovered scope; it is a dry run unless `--apply` is present
- `devflare deploy` still performs best-effort internal preview metadata synchronization after successful deploys so cleanup flows can remove deleted preview workers cleanly without extra CI glue

### Preview resource lifecycle policy

Devflare preview provisioning is intentionally limited to KV, D1, R2, Queues, Vectorize, and the documented Hyperdrive reuse/resolve paths. Newly supported bindings that are just Worker metadata, explicit Cloudflare resource names, remote-only services, or control-plane products are not automatically created for preview scopes unless this README says so in that binding's section.

Preview cleanup does not delete Workflows, Pipelines, Images, Media Transformations, Artifacts, AI Search, AI Gateway, Browser Run, Containers, Secrets Store, mTLS certificates, or dispatch namespace resources. Clean those product resources through Wrangler, the Cloudflare dashboard, or the product API when a preview no longer needs them.

### Manage Devflare tokens

`devflare tokens <bootstrap-token>` manages Devflare-owned account API tokens using a bootstrap token that already has Cloudflare API-token-management permission.

The command:

- resolves the effective account id from `--account`, workspace preference, or the bootstrap token's primary account
- normalizes managed token names to the `devflare-` prefix, so `preview` becomes `devflare-preview` while `devflare-preview` stays unchanged
- `--new [token-name]` prompts for a token name when it is omitted, then creates a new Devflare-managed account-owned token from the curated Devflare permission set
- `--new [token-name] --all-flags` uses every reusable account-scoped permission group visible to the bootstrap token except `Account API Tokens*`, because Cloudflare does not allow sub-tokens to inherit token-management permission and account-owned tokens skip incompatible zone/user-scoped groups automatically
- `--list` lists only the Devflare-managed tokens in the selected account
- `--delete [token-name]` deletes the matching Devflare-managed token after normalizing the name to the `devflare-` prefix
- `--delete-all` deletes every Devflare-managed token in the selected account while leaving non-Devflare account tokens untouched
- prints a new token value once, because Cloudflare only returns the secret a single time

Examples:

```bash
bunx --bun devflare tokens <bootstrap-token> --new preview
bunx --bun devflare tokens <bootstrap-token> --new preview --all-flags
bunx --bun devflare tokens <bootstrap-token> --list
bunx --bun devflare tokens <bootstrap-token> --delete preview
bunx --bun devflare tokens <bootstrap-token> --delete-all
```

### Thin GitHub Action and caller workflows

The repo ships a reusable composite action at [`.github/actions/devflare-deploy`](../../.github/actions/devflare-deploy).

The repo also ships a shared workspace setup action at [`.github/actions/devflare-setup-workspace`](../../.github/actions/devflare-setup-workspace) so one workflow job can install dependencies once and then deploy multiple preview targets from the same checkout.

The repo also ships a GitHub-feedback action at [`.github/actions/devflare-github-feedback`](../../.github/actions/devflare-github-feedback) for publishing deployment results back into GitHub.

The action stays intentionally thin:

- the caller workflow owns the runner, triggers, permissions, and environments
- Cloudflare credentials must be passed in explicitly
- by default, the action asks `devflare deploy` to verify Cloudflare control-plane state before the step is considered successful
- the caller workflow should pass a deterministic `preview-scope`, such as the branch name or `pr-<number>`, for stable dedicated preview Worker naming across PR, push, and manual workflows

The reporting split is also intentional:

- GitHub PR feedback should use a stable PR comment because PRs are issue-backed conversations
- GitHub branch feedback should use Deployments + deployment statuses because GitHub does not provide first-class branch comments
- one preview workflow can publish both branch deployment feedback and the shared PR comment in the same run when a pushed branch already belongs to an open pull request

Current action inputs that matter most:

- `working-directory`
- `environment`
- `production`
- `preview-scope`
- `skip-setup`
- `skip-install`
- `verify-deployment` (defaults to `true`)
- `cloudflare-api-token`
- `cloudflare-account-id`

When `verify-deployment` is enabled, the action fails if Devflare cannot confirm the uploaded version in Cloudflare, or for non-preview deploys, cannot confirm that a live deployment now references that version.

Action outputs:

- `preview-url`
- `version-id`
- `status`
- `exit-code`
- `log-excerpt`

Those extra outputs are especially useful when the caller workflow uses `continue-on-error: true` on the deploy step so it can still post a failure comment or deployment status before failing the job.

Minimal preview step:

```yaml
- id: deploy
	uses: ./.github/actions/devflare-deploy
	with:
		working-directory: apps/documentation
		preview-scope: ${{ github.head_ref || github.ref_name }}
		cloudflare-api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
		cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

This repository now keeps preview delivery in one shared workflow plus one production workflow:

- [`.github/workflows/preview.yml`](../../.github/workflows/preview.yml) handles documentation + testing previews, push + PR lifecycle triggers, branch + PR targets, and cleanup flows from one place
- [`.github/workflows/documentation-production.yml`](../../.github/workflows/documentation-production.yml) handles production deploys from the repository default branch plus GitHub deployment statuses
- [`.github/workflow-examples/branch-preview-cleanup.example.yml`](../../.github/workflow-examples/branch-preview-cleanup.example.yml) remains as a copyable delete-triggered preview-scope cleanup template for downstream repos that want a smaller starting point

The live workflows now rely on the deploy action's control-plane verification for deploy success.

If you want other feedback modes in your own repo, the supported patterns are:

- PR-only preview feedback: `mode: comment`
- branch-only preview feedback: `mode: deployment`
- combined branch deployment + PR comment feedback: either `mode: both` with `resolve-pr-from-ref: 'true'`, or separate deployment/comment steps inside one shared preview workflow when you want finer control over grouped PR comments

Repository-specific runtime checks still exist where they are testing app
behavior rather than deploy success. For example,
[`preview.yml`](../../.github/workflows/preview.yml)
deploys testing previews for both branch and PR scopes from one prepared job
when a pushed branch already belongs to an open pull request, while still
keeping its deployed-binding verification because it is validating runtime
bindings and deployment-channel wiring rather than merely asking whether
Cloudflare accepted the upload.

For branch-scoped real preview deploys such as `apps/testing`, Devflare now
automatically omits shared queue consumers from the deployed Wrangler config,
and it omits cron triggers by default, when it detects the branch-preview
strategy (`--env preview` plus branch scope, without `--preview`). That keeps
previews from colliding on singleton Cloudflare resources while leaving the
authoring config itself fully exhaustive for local dev, tests, and production
deploys.

If a branch-scoped preview really should keep its cron schedule, opt in with:

```ts
export default defineConfig({
	previews: {
		includeCrons: true
	}
})
```

If those previews also need preview-owned Cloudflare resources, use
`preview.scope()` in the config authoring layer:

```ts
import { defineConfig, preview } from 'devflare/config'

const pv = preview.scope()

export default defineConfig({
	bindings: {
		kv: {
			CACHE: pv('my-cache-kv')
		},
		r2: {
			ASSETS: pv('my-assets-bucket')
		}
	}
})
```

Devflare resolves those opaque markers to base names outside preview
environments, and to preview-scoped names such as `my-cache-kv-preview` (or a
branch-derived suffix when `DEVFLARE_PREVIEW_BRANCH`, `DEVFLARE_PREVIEW_PR`, or
`DEVFLARE_PREVIEW_IDENTIFIER` is present) for preview resolution and deploys.
During `devflare deploy --env preview`, Devflare also provisions missing
preview-scoped KV, D1, R2, Queue, and Vectorize resources automatically before
the Wrangler deploy runs. Preview-scoped Hyperdrive names are reused when the
matching preview config already exists. If no preview Hyperdrive exists,
Devflare only reuses the base Hyperdrive config when the binding explicitly sets
`previewFallback: 'base'`; otherwise preview deploy fails so it does not
silently talk to the wrong database. Use
`devflare previews cleanup --env preview --apply` during PR-close or
branch-delete cleanup to delete the preview-owned resources again.
Service bindings created through `ref()` still follow the referenced worker
names, so branch-scoped worker naming remains the way to isolate preview
service bindings.

### Cloudflare Builds stance

Cloudflare Builds is CI/CD orchestration, not a Worker runtime binding. It connects a Worker to a GitHub or GitLab repository, runs a build command, then runs a deploy command such as `npx wrangler deploy` for the production branch or `npx wrangler versions upload` for non-production branches.

Devflare can be the command you run inside that build, but it does not own the Git connection itself:

```sh
bun install
bunx --bun devflare deploy
```

Use Cloudflare's Builds settings for repository connection, production branch selection, non-production branch builds, build variables and secrets, API tokens, root directory, deploy hooks, and provider-level build status integrations. The Worker name in Cloudflare must still match the generated Wrangler `name` for the selected root directory, because Workers Builds validates that relationship when deploying.

Devflare does not connect Git repositories, manage build hooks, configure Workers Builds branch controls, create Cloudflare-managed build tokens, or mirror Workers Builds preview URL/status behavior locally. Devflare's built-in GitHub Actions remain the supported Devflare-owned CI path when you want config-aware preview scopes, resource provisioning, deployment verification, and cleanup controlled from your own repository workflows.

---

## Repo examples

- [`apps/documentation/`](../../apps/documentation/) is the executable SvelteKit example for dev, build, preview deploys, production deploys, workflow automation, and browser validation
- [`apps/testing/`](../../apps/testing/) is the exhaustive binding-matrix example for the config contract itself, including `preview.scope()`-driven preview resource names, production overrides where bindings differ by deployment channel, and a tiny `src/fetch.ts` smoke Worker exercised by repository integration tests through `devflare/test`

---

## Testing

Use `devflare/test`.

The high-level entrypoint is `createTestContext()`, and the unified helper surface is `cf`:

- `cf.worker`
- `cf.queue`
- `cf.scheduled`
- `cf.email`
- `cf.tail`

### `createTestContext()` autodiscovery

If you omit the config path, `createTestContext()` walks upward from the calling test file and looks for the nearest supported config filename:

- `devflare.config.ts`
- `devflare.config.mts`
- `devflare.config.js`
- `devflare.config.mjs`

It also auto-detects conventional `src/fetch.ts`, `src/queue.ts`, `src/scheduled.ts`, `src/email.ts`, built-in `src/routes/**`, and `src/tail.ts` when they are present.

### Important current testing truth

- `cf.worker.fetch()` returns when the handler resolves and does **not** eagerly wait for all `waitUntil()` work
- `cf.worker.fetch()` and the shorthand helpers dispatch through both `src/fetch.ts` and built-in `src/routes/**` file routes when present
- `cf.queue.trigger()` and `cf.scheduled.trigger()` do wait for queued background work before they return
- `cf.tail.trigger()` is exported, and `createTestContext()` auto-detects `src/tail.ts` when present; `files.tail` can set a custom tail handler path or disable tail discovery with `false`
- `cf.email.send()` invokes the configured email handler in `createTestContext()`-backed tests and otherwise falls back to the local email endpoint; for ingress-fidelity-sensitive flows, validate with a higher-level integration test
- remote mode is mainly about AI and Vectorize, not “make every binding remote”

### Choosing pure mocks vs Miniflare-backed `createTestContext()`

`devflare/test` ships two complementary lanes. Pick by what you are validating:

- **Pure mocks** (`createMockKV`, `createMockD1`, `createMockR2`, `createMockEnv`, `createMockTestContext`, `withTestContext`):
	- Fast, in-process, no Miniflare boot
	- Use when you are unit-testing a function that reads or writes a single binding and you control the inputs
	- Behavior is approximate: KV is binary-safe, D1 supports `SELECT`/`INSERT` per-table fixtures, R2 stores bytes — anything beyond those primitives will diverge from production
- **`createTestContext()` (Miniflare-backed)**:
	- Boots a real Workers runtime locally with your `devflare.config.ts`
	- Use when you are testing handler dispatch, multi-binding flows, queues/scheduled/email/Durable Objects, route discovery, middleware composition, or anything that needs accurate Workers semantics
	- Slower per test, so reuse one context per test file when possible

Rule of thumb: if the assertion is "given inputs X, my function returns Y", reach for the mocks. If the assertion is "the worker behaves correctly when this binding/handler/route fires", use `createTestContext()`.

### Offline-first testing support matrix

`createOfflineEnv(config, fixtures)` derives a deterministic pure-test `env` from Devflare config without booting Miniflare, Docker/Podman, Wrangler, or Cloudflare. Use it when you want unit tests to follow the same binding names as `devflare.config.ts` while keeping all Cloudflare credentials and network access out of the test path.

```ts
import { createOfflineEnv, shouldSkip } from 'devflare/test'
import config from '../devflare.config'

const env = createOfflineEnv(config, {
	secretsStore: {
		API_TOKEN: 'test-token'
	},
	aiSearch: {
		DOCS_SEARCH: {
			items: [
				{
					key: 'offline.md',
					content: 'Offline fixtures make tests deterministic'
				}
			]
		}
	}
})

const result = await env.DOCS_SEARCH.search({ query: 'fixtures' })
```

`createOfflineBindings(config, fixtures)` returns the same `env` plus `support`, `remoteBoundaries`, and `missingFixtures` metadata. Missing Secrets Store values never trigger network calls; they produce an explicit `missingFixtures` entry and a binding whose `get()` throws with the fixture key to pass.

Offline-native means Devflare or Miniflare can run a useful local simulator. This includes Rate Limiting, Version Metadata, core storage bindings, Workflows at the application-call level, Pipelines send recording, Images chain-shape tests, local Send Email capture, and explicit Containers tests when Docker or Podman is available and opted in.

Offline-fixture means Devflare provides an explicit in-memory or handler-backed mock. This includes Worker Loader stubs, mTLS Fetcher handlers, Dispatch Namespace tenant fetchers, Media Transformations chain mocks, Artifacts repository metadata/tokens, AI Search instances/namespaces, and fixed Secrets Store values.

Remote-boundary means meaningful behavior lives in Cloudflare. Devflare does not simulate real Workers AI inference, Vectorize search semantics, AI Search indexing/ranking/crawling, Media Transformations output, mTLS certificate presentation, Artifacts Git remotes, Browser Run live/HITL/recordings, Cloudflare Builds, or the deployed Containers control plane.

Use `getOfflineSupportMatrix()` or `describeOfflineSupport(service)` when a test harness, template, or documentation generator needs the current stance in code. For integration tests that intentionally cross remote boundaries, `shouldSkip.aiSearch`, `shouldSkip.aiGateway`, `shouldSkip.media`, `shouldSkip.mtlsCertificates`, `shouldSkip.artifacts`, and `shouldSkip.builds` mirror the existing `shouldSkip.ai` / `shouldSkip.vectorize` pattern: they skip unless remote mode and Cloudflare auth are available. Container tests remain separate under `shouldSkip.containers` because they require a local Docker/Podman engine instead of Cloudflare auth.

---

## Public API surface and migration notes

Devflare's bare `'devflare'` import is intentionally narrow and only exposes the documented public API. Internal helpers for the bridge, transform, and test runner are reachable from dedicated subpaths instead:

- `devflare` — primary public API (`defineConfig`, `defineWorker`, `sequence`, `defineFetchHandler`, runtime context accessors, etc.)
- `devflare/test` — `createTestContext`, `cf`, mock factories
- `devflare/runtime` — runtime accessors (`env`, `ctx`, `event`, `locals`, helpers)
- `devflare/cloudflare` — Cloudflare API helpers
- `devflare/sveltekit` — SvelteKit platform glue
- `devflare/decorators` — `@durableObject` and other decorators

If you previously imported internal helpers (e.g., bridge serialization or transform helpers) from bare `'devflare'`, switch to the matching subpath. The internal modules are not considered stable public API and may change between minor versions.

---

## CLI

Every top-level command supports `--help`, and nested command groups support both:

- `bunx --bun devflare <command> --help`
- `bunx --bun devflare <command> <subcommand> --help`
- `bunx --bun devflare help <command> [subcommand]`

| Command | What it does |
|---|---|
| `devflare init` | scaffold a project using `src/fetch.ts` and explicit `files.fetch` |
| `devflare dev` | start the worker-only dev server, enabling Vite only when the current package has a local `vite.config.*` |
| `devflare build` | resolve config locally, preserve named bindings in generated build artifacts, and run `vite build` only for Vite-backed packages |
| `devflare deploy` | build or reuse a prior artifact via `--build`, provision named deploy resources, and deploy with Wrangler, including same-Worker preview uploads via `--preview` |
| `devflare types` | generate `env.d.ts` |
| `devflare doctor` | check project configuration plus generated artifact locations such as `.devflare/wrangler.jsonc`, `.devflare/build/wrangler.jsonc`, and `.wrangler/deploy/config.json` |
| `devflare config` | print resolved Devflare config or resolved Wrangler JSON |
| `devflare account` | inspect accounts, resources, usage, and limits |
| `devflare login` | authenticate with Cloudflare via Wrangler, reusing existing auth unless `--force` is passed |
| `devflare previews` | inspect and clean dedicated preview Workers plus preview-owned scope resources |
| `devflare productions` | inspect live production Workers, list recent versions, roll back, or delete a live Worker script |
| `devflare worker` | run Worker control-plane actions such as remote renaming and local config sync |
| `devflare tokens` | create, list, and delete Devflare-managed account-owned tokens from a bootstrap token with API-token-management permission |
| `devflare help` | print the command overview or the detailed help page for a command path |
| `devflare version` | print the installed Devflare version |
| `devflare ai` | show Workers AI model pricing info |
| `devflare remote` | manage remote test mode |

Command defaults:

- `devflare config` defaults to `devflare config print`
- `devflare previews` defaults to `devflare previews list`
- `devflare productions` defaults to `devflare productions list`

### Command groups

| Group | Subcommands / operations |
|---|---|
| `account` | `info`, `workers`, `kv`, `d1`, `r2`, `vectorize`, `usage`, `limits`, `limits set`, `limits enable`, `limits disable`, `global`, `workspace` |
| `config` | `print` |
| `previews` | `list`, `bindings`, `cleanup` |
| `productions` | `list`, `versions`, `rollback`, `delete` |
| `remote` | `status`, `enable`, `disable` |
| `worker` | `rename` |
| `tokens` | `--list`, `--new`, `--roll`, `--delete`, `--delete-all` (flag-driven operations rather than subcommands) |

Useful flags:

- `build --env <name>`
- `deploy --build <path>`
- `deploy --env <name>`
- `deploy --dry-run`
- `deploy --preview <name>`
- `login --force`
- `previews`
- `previews cleanup --scope <name> --apply`
- `config print --json`
- `config print --format wrangler`
- `types --output <path>`
- `doctor --config <path>`
- `account --account <id>`
- `tokens <bootstrap-token> --new [name]`
- `tokens <bootstrap-token> --list`

Recommended invocation style:

```bash
bunx --bun devflare dev
bunx --bun devflare types
bunx --bun devflare build
bunx --bun devflare help account limits set
bunx --bun devflare previews cleanup --help
```

---

## Generated artifacts

Treat these as generated output, not source of truth:

- `.devflare/wrangler.jsonc`
- `.devflare/build/wrangler.jsonc`
- `.devflare/worker-entrypoints/main.ts`
- `.devflare/worker-entrypoints/main.js`
- `.devflare/vite.config.mjs`
- `.wrangler/deploy/config.json`
- `env.d.ts`

`devflare build` keeps name-based bindings as names in these generated artifacts. `devflare deploy` is the step that resolves or provisions the concrete Cloudflare resources and rewrites the generated Wrangler config with the IDs Wrangler needs.

The source of truth is still:

- `devflare.config.ts`
- your source files under `src/`
- your tests

---

## Maintainer scripts

These scripts live in `packages/devflare/scripts/` and are intended for Devflare maintainers, not for end-user applications.

### `refresh-permission-groups`

Fetches the live Cloudflare permission-group catalog and rewrites `src/cloudflare/known-permission-group-ids.generated.ts` so the symbolic Devflare permission-group names (`WORKERS_SCRIPTS_WRITE`, etc.) map to verified Cloudflare UUIDs instead of falling back to display-name matching.

```sh
# from the repo root
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bun run --cwd packages/devflare refresh-permission-groups
```

Flags:

- `--dry-run` — print the would-be generated file to stdout instead of writing to disk; useful for CI drift checks.
- `--keep-existing` — keep the previously-known UUID for entries missing from the API response, instead of clearing them to `null`.
- `--output <path>` — override the destination file; defaults to `packages/devflare/src/cloudflare/known-permission-group-ids.generated.ts`.

The API token must have permission to read `/accounts/:id/tokens/permission_groups`. The script never touches `tokens.ts` directly, so the public matcher API and its display-name fallback continue to work even when the generated file ships with all-`null` entries.

---

## In one sentence

**Devflare helps you build Cloudflare Workers with clearer structure, better local tooling, and a development workflow that stays coherent as the app grows.**
