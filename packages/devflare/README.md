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

## Install

For a worker-only project, Devflare works fine with just the Worker toolchain:

```bash
bun add -d devflare wrangler @cloudflare/workers-types
```

If the current package also uses Vite, add Vite and the Cloudflare Vite plugin too:

```bash
bun add -d devflare wrangler @cloudflare/workers-types vite @cloudflare/vite-plugin
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

export async function fetch({ request }: FetchEvent): Promise<Response> {
	const url = new URL(request.url)
	return new Response(
		url.pathname === '/'
			? 'Hello from Devflare'
			: `Hello from Devflare: ${url.pathname}`
	)
}
```

### 3. Generate types

```bash
bunx --bun devflare types
```

This generates `env.d.ts` so bindings, secrets, and discovered entrypoints stay typed.

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
| `devflare` | main package entrypoint: config helpers, `ref()`, unified `env`, bridge helpers, CLI helpers, decorators |
| `devflare/runtime` | worker-safe runtime helpers like `env`, `ctx`, `event`, `locals`, event types/getters, middleware helpers |
| `devflare/test` | `createTestContext`, `cf.*`, mock helpers, bridge test context, skip helpers |
| `devflare/vite` | Vite integration |
| `devflare/sveltekit` | SvelteKit integration |
| `devflare/cloudflare` | Cloudflare account/auth/usage/limits/preferences helpers |
| `devflare/decorators` | decorators only |

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

async function appFetch({ request }: FetchEvent): Promise<Response> {
	return Response.json({ path: new URL(request.url).pathname })
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
- `files`
- `bindings`
- `triggers`
- `vars`
- `secrets`
- `routes`
- `wsRoutes`
- `assets`
- `limits`
- `observability`
- `migrations`
- `rolldown`
- `vite`
- `env`
- `wrangler.passthrough`

### `vars` vs `secrets`

Keep these separate:

- `vars` are **string-valued config bindings** that compile into generated Wrangler config
- `secrets` are **declarations of expected runtime secret bindings**

`loadConfig()` loads the nearest workspace-root `.env` before evaluating `devflare.config.*`.

When Devflare finds an ancestor `package.json` with `workspaces`, it uses that directory's `.env` file as the shared config-time source for nested packages. If no workspace root is found, it falls back to the nearest ancestor `.env`. Explicit process env values still win over `.env` entries.

Important boundary:

- `.env` is treated as a config/build-time input for `devflare.config.*` evaluation
- Devflare does **not** currently provide first-class semantics for `.env.dev` or `.env.<name>`
- Devflare does **not** currently provide a first-class `.dev.vars*` loader for worker-only dev mode or `createTestContext()`
- example files like `.env.example` and `.dev.vars.example` are a team convention, not a Devflare feature

Practical convention:

- use `.env.example` for config-time/build-time variables read from `process.env`
- use `.dev.vars.example` only if your project intentionally relies on upstream `.dev.vars` local-runtime workflows
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
- routes, assets, migrations, observability, and limits
- Vite and Rolldown metadata
- environment overlays

It does **not** try to re-model every Wrangler key as a first-class Devflare schema field.
For unsupported Wrangler options, use `wrangler.passthrough`.

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
			placement: {
				mode: 'smart'
			}
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
- Services
- AI
- Vectorize
- Hyperdrive
- Browser Rendering
- Analytics Engine
- `sendEmail`

### Caveats worth knowing up front

- KV, D1, R2, Durable Objects, queues, and the core test/runtime flow are the strongest surfaces
- AI and Vectorize are remote-oriented bindings
- named service entrypoints are modeled at the Devflare layer, but validate generated deployment output if they are critical to your app
- browser bindings use a named-map authoring shape such as `browser: { BROWSER: 'browser' }`, but current compile/deploy flows allow exactly one browser binding because Wrangler only supports one
- `sendEmail` is modeled through config compilation, generated env types, and local runtime/test flows
- R2 bindings are real in local dev/test/runtime flows, but Devflare does **not** publish a stable browser-facing local bucket URL contract; browser-visible local asset flows should go through your Worker routes

For R2 delivery strategy guidance, see [`R2.md`](./R2.md).

For D1, prefer stable config names when you can:

```ts
export default {
	bindings: {
		d1: {
			DB: { name: 'app-db' },
			AUDIT: { id: 'existing-d1-id' }
		},
		r2: {
			ASSETS: 'app-assets'
		}
	}
}
```

Use `.env*` and `secrets` for values that are actually secret or genuinely process-specific. Do **not** move stable bucket/database names into env vars just to make other tooling happy.

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

For the full contract-level explanation and a concrete Rolldown + Svelte example, see [`LLM.md`](./LLM.md).

---

## Deploys, previews, tokens, and GitHub Actions

### Production deploys vs same-Worker previews

`devflare deploy` publishes production the usual Wrangler way.

`devflare deploy --preview` is different: it uploads a **new version of the same Worker** with `wrangler versions upload` instead of creating a separate Worker environment.

That same-Worker version model is the intended phase-1 branch-preview story:

- each preview upload gets a Cloudflare Worker version id
- preview URLs can point at that uploaded version
- preview aliases can give the branch a stable readable preview identity
- feature branches do **not** need a separate Worker just to get previews

Cloudflare caveats matter here:

- preview URLs must be enabled for the Worker, or the returned links may not be usable
- preview URLs are public unless you protect them with Cloudflare Access
- preview uploads cannot be the first upload for a brand-new Worker
- Cloudflare does **not** currently generate preview URLs for Workers that implement Durable Objects
- `wrangler versions upload` does **not** currently support Durable Object migrations

Preview alias generation follows Cloudflare's documented limits:

- lowercase letters, numbers, and dashes only
- must begin with a lowercase letter
- alias plus worker name must fit within Cloudflare's DNS label limit

Useful preview examples:

```bash
bunx --bun devflare deploy --preview
bunx --bun devflare deploy --preview --preview-alias feature-search
bunx --bun devflare deploy --preview --branch-name my-feature-branch
```

When available, Devflare prints the Worker version id plus preview alias and preview URL outputs after the upload finishes.
If Wrangler omits the preview alias URL line, Devflare derives the alias URL from the account's `workers.dev` subdomain so CI and GitHub Action outputs still get a stable branch preview link.

### Login and preview registry helpers

`devflare login` is the thin authentication wrapper for Cloudflare.

- by default it reuses existing auth when Devflare can already resolve a Cloudflare API token
- `devflare login --force` opens `wrangler login` again even when auth is already present
- after login, Devflare prints the primary account when Cloudflare account discovery succeeds

`devflare previews` is the account-owned preview-registry surface.

The registry is D1-backed and tracks Devflare-managed preview, preview-alias, and deployment records so preview lifecycle management no longer depends only on Cloudflare's sparse discovery APIs.

Useful commands:

```bash
bunx --bun devflare previews
bunx --bun devflare previews provision
bunx --bun devflare previews reconcile --worker documentation
bunx --bun devflare previews retire --worker documentation --branch feature-search --apply
bunx --bun devflare previews cleanup --worker documentation --days 7 --apply
```

Current behavior:

- `devflare previews` lists tracked preview, alias, and deployment records from the Devflare registry
- `devflare previews provision` ensures the registry D1 database exists
- `devflare previews reconcile` syncs the registry against live Cloudflare Worker versions and deployments for the selected Worker
- `devflare previews retire` immediately marks one tracked preview, alias, and preview deployment as deleted by branch name, preview alias, version id, or commit sha
- `devflare previews cleanup` performs a dry run by default and `--apply` soft-deletes stale non-active records after reconciliation
- `devflare deploy` now performs a best-effort registry reconciliation after successful deploys so preview metadata stays warm without extra CI glue

That targeted retirement step is what the example cleanup workflows use when a PR closes or when a branch-scoped preview should be torn down immediately.
Cloudflare's same-Worker preview alias lifecycle is still platform-limited, so Devflare can retire its own registry state and GitHub-visible feedback immediately even when Cloudflare may keep the alias reachable until a later overwrite or retention eviction.

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

The legacy singular `devflare token <bootstrap-token>` create flow is still accepted as a compatibility alias, but `tokens` is now the documented public surface.

### Thin GitHub Action and caller workflows

The repo ships a reusable composite action at [`.github/actions/devflare-deploy`](../../.github/actions/devflare-deploy).

The repo also ships a GitHub-feedback action at [`.github/actions/devflare-github-feedback`](../../.github/actions/devflare-github-feedback) for publishing deployment results back into GitHub.

The action stays intentionally thin:

- the caller workflow owns the runner, triggers, permissions, and environments
- Cloudflare credentials must be passed in explicitly
- by default, the action asks `devflare deploy` to verify Cloudflare control-plane state before the step is considered successful
- the caller workflow should pass `branch-name: ${{ github.head_ref || github.ref_name }}` for deterministic preview identity across PR, push, and manual workflows

The reporting split is also intentional:

- GitHub PR feedback should use a stable PR comment because PRs are issue-backed conversations
- GitHub branch feedback should use Deployments + deployment statuses because GitHub does not provide first-class branch comments
- combined branch + PR reporting should use `mode: both` on the feedback action together with `resolve-pr-from-ref: 'true'`

Current action inputs that matter most:

- `working-directory`
- `environment`
- `preview`
- `preview-alias`
- `branch-name`
- `verify-deployment` (defaults to `true`)
- `cloudflare-api-token`
- `cloudflare-account-id`

When `verify-deployment` is enabled, the action fails if Devflare cannot confirm the uploaded version in Cloudflare, or for non-preview deploys, cannot confirm that a live deployment now references that version.

Action outputs:

- `preview-alias`
- `preview-url` (prefers the preview alias URL, including the derived alias URL fallback when Wrangler omits it)
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
		preview: 'true'
		branch-name: ${{ github.head_ref || github.ref_name }}
		cloudflare-api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
		cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

This repository also includes thin caller workflows and copyable workflow examples:

- [`.github/workflows/documentation-preview-branch.yml`](../../.github/workflows/documentation-preview-branch.yml) for branch-scoped preview aliases published on push
- [`.github/workflows/documentation-preview-branch-cleanup.yml`](../../.github/workflows/documentation-preview-branch-cleanup.yml) for delete-triggered retirement of tracked documentation branch previews plus GitHub deployment cleanup
- [`.github/workflows/documentation-preview-pr.yml`](../../.github/workflows/documentation-preview-pr.yml) for PR previews, stable PR comments, and PR-close cleanup
- [`.github/workflows/documentation-production.yml`](../../.github/workflows/documentation-production.yml) for production deploys from the repository default branch plus GitHub deployment statuses
- [`.github/workflows/testing-preview-branch.yml`](../../.github/workflows/testing-preview-branch.yml) for branch-scoped Durable Object previews, combined branch deployment + PR comment reporting, and later runtime binding verification
- [`.github/workflows/testing-preview-branch-cleanup.yml`](../../.github/workflows/testing-preview-branch-cleanup.yml) for delete-triggered retirement of tracked testing branch previews, deletion of branch-scoped Workers, and GitHub deployment plus PR feedback cleanup
- [`.github/workflows/testing-preview-pr.yml`](../../.github/workflows/testing-preview-pr.yml) for PR-scoped testing previews and PR-close GitHub feedback cleanup
- [`.github/workflow-examples/branch-preview-cleanup.example.yml`](../../.github/workflow-examples/branch-preview-cleanup.example.yml) as a delete-triggered same-Worker preview cleanup template that retires tracked preview metadata and marks GitHub deployment feedback inactive

The live workflows now rely on the deploy action's control-plane verification for deploy success.

If you want other feedback modes in your own repo, the supported patterns are:

- PR-only preview feedback: `mode: comment`
- branch-only preview feedback: `mode: deployment`
- combined branch deployment + PR comment feedback: `mode: both` with `resolve-pr-from-ref: 'true'` (the repo's `testing-preview-branch.yml` now demonstrates this pattern)

Repository-specific runtime checks still exist where they are testing app
behavior rather than deploy success. For example,
[`testing-preview-branch.yml`](../../.github/workflows/testing-preview-branch.yml)
now publishes both a GitHub deployment and, when the branch belongs to an open
pull request, the stable PR comment while still keeping its `/status`
assertion, because it is validating runtime bindings and deployment-channel
wiring rather than merely asking whether Cloudflare accepted the upload.

---

## Repo examples

- [`apps/documentation/`](../../apps/documentation/) is the executable SvelteKit example for dev, build, preview deploys, production deploys, workflow automation, and browser validation
- [`apps/testing/`](../../apps/testing/) is the exhaustive binding-matrix example for the config contract itself, including preview and production environment overrides where bindings differ by deployment channel, and its `src/fetch.ts` smoke Worker is exercised by repository integration tests through `devflare/test`

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
- `cf.tail.trigger()` is exported, and `createTestContext()` auto-detects `src/tail.ts` when present; there is still no public `files.tail` config key
- `cf.email.send()` invokes the configured email handler in `createTestContext()`-backed tests and otherwise falls back to the local email endpoint; for ingress-fidelity-sensitive flows, validate with a higher-level integration test
- remote mode is mainly about AI and Vectorize, not “make every binding remote”

---

## CLI

| Command | What it does |
|---|---|
| `devflare init` | scaffold a project using `src/fetch.ts` and explicit `files.fetch` |
| `devflare dev` | start the worker-only dev server, enabling Vite only when the current package has a local `vite.config.*` |
| `devflare build` | resolve config, generate Devflare/Wrangler build artifacts, and run `vite build` only for Vite-backed packages |
| `devflare deploy` | build and deploy with Wrangler, including same-Worker preview uploads via `--preview` |
| `devflare types` | generate `env.d.ts` |
| `devflare doctor` | check project configuration plus generated artifact locations such as `.devflare/wrangler.jsonc`, `.devflare/build/wrangler.jsonc`, and `.wrangler/deploy/config.json` |
| `devflare config` | print resolved Devflare config or resolved Wrangler JSON |
| `devflare account` | inspect accounts, resources, usage, and limits |
| `devflare login` | authenticate with Cloudflare via Wrangler, reusing existing auth unless `--force` is passed |
| `devflare previews` | inspect, provision, reconcile, retire, and clean up the Devflare preview registry |
| `devflare tokens` | create, list, and delete Devflare-managed account-owned tokens from a bootstrap token with API-token-management permission |
| `devflare ai` | show Workers AI model pricing info |
| `devflare remote` | manage remote test mode |

Useful flags:

- `build --env <name>`
- `deploy --env <name>`
- `deploy --dry-run`
- `deploy --preview`
- `deploy --preview --preview-alias <alias>`
- `deploy --preview --branch-name <branch>`
- `login --force`
- `previews`
- `previews reconcile --worker <name>`
- `previews cleanup --worker <name> --apply`
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

The source of truth is still:

- `devflare.config.ts`
- your source files under `src/`
- your tests

---

## In one sentence

**Devflare helps you build Cloudflare Workers with clearer structure, better local tooling, and a development workflow that stays coherent as the app grows.**
