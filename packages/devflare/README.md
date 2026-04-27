# Devflare

Devflare is a developer-first toolkit for Cloudflare Workers. It keeps config,
runtime helpers, local development, testing, preview deploys, and Cloudflare
operations in one package without pretending Cloudflare boundaries disappear.

The docs app is the authored long-form source. This README is intentionally the
short package map: install, first Worker, import/API map, config and CLI
surface, support stances, and links into the deeper docs. `LLM.md` is generated
from the same docs model and shipped with the package for flattened reading.

## Install

For a worker-only project, install only Devflare:

```bash
bun add -d devflare
```

For Vite-backed apps, add Vite and the Cloudflare Vite plugin:

```bash
bun add -d devflare vite @cloudflare/vite-plugin
```

Assumptions used by the examples: Wrangler 4, Miniflare 4,
`@cloudflare/workers-types` 4, Bun 1.1+, and Node 20+.

## Cloudflare toolchain support

Devflare targets Wrangler 4, Miniflare 4, and @cloudflare/workers-types 4.
Devflare does not support Wrangler 3 in new projects. The package manifest pins
the exact ranges that scaffolds, local runtime behavior, and generated types
are validated against in CI.

## Quick Start

Create a config:

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

Add a fetch handler:

```ts
// src/fetch.ts
import type { FetchEvent } from 'devflare/runtime'

export async function fetch(_event: FetchEvent): Promise<Response> {
	return new Response('Hello from Devflare')
}
```

Generate types and start local dev:

```bash
bunx --bun devflare types
bunx --bun devflare dev
```

Add the first runtime-shaped test:

```ts
// tests/worker.test.ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { cf, createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('GET / returns text', async () => {
	const response = await cf.worker.get('/')

	expect(response.status).toBe(200)
	expect(await response.text()).toBe('Hello from Devflare')
})
```

Run it:

```bash
bun test tests/worker.test.ts
```

## Choose Your Next Path

| Need | Open |
| --- | --- |
| Add route files | `/docs/first-route-tree`, then `/docs/http-routing` |
| Add one binding | `/docs/first-bindings`, then `/docs/binding-chooser` |
| Pick a test helper | `/docs/test-helper-reference` |
| Deploy safely | `/docs/deploy-command-recipes` |
| Check support stance | `/docs/feature-index` |
| Copy a larger example | `/docs/recipe-packs` or `cases/README.md` |

## Package Entrypoints

| Import | Use |
| --- | --- |
| `devflare` | Node-side utilities: `defineConfig`, `preview`, `loadConfig`, `loadResolvedConfig`, `compileConfig`, `stringifyConfig`, `configSchema`, `ref()`, `workerName`, `env`, `durableObject`, `getDurableObjectOptions`, `runCli`, `parseArgs` |
| `devflare/config` | Config and compiler utilities: `defineConfig`, `preview`, `ref`, `loadConfig`, `loadResolvedConfig`, `compileConfig`, `stringifyConfig`, `configSchema`, `resolveResources`, `writeWranglerConfig`, `readWranglerConfig`, `prepareConfigResourcesForDeploy`, `prepareMaterializedConfigResourcesForDeploy`, `resolveConfigPath`, `resolveConfigForEnvironment`, `resolvePreviewIdentifier`, `materializePreviewScopedConfig`, `materializePreviewScopedString`, `isPreviewScopedName`, `resolveMaterializedConfigResources`, `compileBuildConfig`, `validateServiceBindings`, `collectReferencedServiceNames`, `getLocalKVNamespaceIdentifier`, `getLocalD1DatabaseIdentifier`, `getLocalHyperdriveConfigIdentifier`, `getSingleBrowserBindingName`, `normalizeKVBinding`, `normalizeD1Binding`, `normalizeDOBinding`, `normalizeHyperdriveBinding`, `normalizeMtlsCertificateBinding`, `normalizeDispatchNamespaceBinding`, `normalizeWorkflowBinding`, `normalizePipelineBinding`, `normalizeImagesBinding`, `normalizeMediaBinding`, `normalizeArtifactsBinding` |
| `devflare/runtime` | Worker-safe runtime helpers: `env`, `ctx`, `event`, `locals`, `sequence`, `defineFetchHandler`, `defineQueueHandler`, `defineScheduledHandler`, `markResolveStyle`, `markWorkerStyle`, `createResolveFetch`, `invokeFetchHandler`, `invokeFetchModule`, `matchFetchRoute`, `invokeRouteModules`, `createRouteResolve`, event creators and getters |
| `devflare/test` | Testing helpers: `createTestContext`, `env`, `cf`, `worker`, `queue`, `scheduled`, `email`, `tail`, `shouldSkip`, `createOfflineEnv`, `createOfflineBindings`, `describeOfflineSupport`, `getOfflineSupportMatrix`, `containers`, `detectContainerEngine`, `getContainerSkipReason`, `stopActiveContainers`, `createMockEnv`, `createMockKV`, `createMockD1`, `createMockR2`, `createMockQueue`, `createMockRateLimit`, `createMockVersionMetadata`, `createMockWorkerLoader`, `createMockMTLSCertificate`, `createMockDispatchNamespace`, `createMockWorkflow`, `createMockPipeline`, `createMockImagesBinding`, `createMockMediaBinding`, `createMockArtifacts`, `createMockAISearchInstance`, `createMockAISearchNamespace`, `createMockTestContext`, `withTestContext`, `resolveServiceBindings`, `resolveDOBindings`, `clearBundleCache` |
| `devflare/vite` | Vite integration: `devflarePlugin`, `getCloudflareConfig`, `getDevflareConfigs`, `getPluginContext`, `hasInlineViteConfig`, `resolveEffectiveViteProject`, `resolveViteUserConfig`, `writeGeneratedViteConfig` |
| `devflare/sveltekit` | SvelteKit integration: `createDevflarePlatform`, `createHandle`, `handle`, `getBridgePort`, `isDevflareDev`, `resetPlatform`, `resetConfigCache` |
| `devflare/cloudflare` | Cloudflare account and preview registry helpers: `account`, `ensurePreviewRegistry`, `cleanupPreviewRegistry`, `getPreviewRegistryContext`, `listTrackedRegistryState`, `listTrackedPreviewRecords`, `listTrackedPreviewScopeRecords`, `listTrackedDeploymentRecords`, `reconcilePreviewRegistry`, `retirePreviewRegistry` |
| `devflare/decorators` | Durable Object decorators: `durableObject`, `getDurableObjectOptions` |

Runtime import rule of thumb:

- Use `devflare/config` in config files.
- Use `devflare/runtime` in Worker code.
- Use `devflare/test` in tests.
- Use bare `devflare` for Node-side package tooling and the unified env proxy only when that is intentional.

## Config Map

The most important top-level keys are:

- `accountId`
- `assets`
- `baseDir`
- `bindings`
- `compatibilityDate`
- `compatibilityFlags`
- `containers`
- `env`
- `files`
- `findAdditionalModules`
- `limits`
- `migrations`
- `name`
- `observability`
- `placement`
- `preserveFileNames`
- `previews`
- `rolldown`
- `routes`
- `rules`
- `secrets`
- `tailConsumers`
- `triggers`
- `vars`
- `vite`
- `wrangler.passthrough`
- `wsRoutes`

Open `/docs/full-config`, `/docs/config-basics`, and `/docs/generated-types`
for examples with file paths.

## CLI

| Command | Use |
| --- | --- |
| `devflare account` | inspect Cloudflare account resources, limits, and usage |
| `devflare ai` | inspect Workers AI model pricing information |
| `devflare build` | generate deploy-ready local artifacts |
| `devflare config` | print resolved Devflare or Wrangler-facing config |
| `devflare deploy` | deploy explicitly to production or preview |
| `devflare dev` | start local development |
| `devflare doctor` | inspect local project health |
| `devflare help` | print help for root or nested commands |
| `devflare init` | scaffold a starter project |
| `devflare login` | authenticate through Wrangler |
| `devflare previews` | inspect and clean preview scopes |
| `devflare productions` | inspect or manage production Worker versions |
| `devflare remote` | manage remote test mode |
| `devflare tokens` | create and manage Devflare-scoped API tokens |
| `devflare types` | generate `env.d.ts` |
| `devflare version` | print the installed version |
| `devflare worker` | run Worker control-plane helpers |

## Support Stance Index

The full support matrix is in `/docs/feature-index`. The short version is:
offline-first when deterministic local behavior is meaningful, remote-gated
when Cloudflare owns the product behavior, and explicit skip helpers when CI
cannot safely run the dependency.

### AutoRAG migration stance

AutoRAG is documented under AI Search. The previous `env.AI.autorag()` binding
shape should move to native AI Search config. Use `bindings.aiSearchNamespaces`
or `bindings.aiSearch` so the binding is visible in config, generated types,
and tests.

### AI Gateway binding methods

AI Gateway does not use a separate Wrangler binding. It is a method surface on
Workers AI: `env.AI.gateway(id)` exposes `patchLog()`, `getLog()`, `getUrl()`,
and `run()`.

### Browser Run product boundary

Browser Run is the current product name for Browser Rendering. Devflare can
wire the binding and test useful local integration code, but Devflare does not
manage Live View URLs, Human in the Loop handoff, recordings, browser session
storage, or Browser Run account-level product state.

### Containers local testing

Devflare supports native top-level `containers` config and local container
testing helpers. Containers have full local support when Docker or Podman is
available: Devflare can build local Dockerfile paths, run prebuilt image tags,
and interact with instances through fetch, logs, state, stop, and cleanup
helpers. Devflare container tests are offline-first by default when the image
already exists locally or the Dockerfile can build from cached layers. Set
`DEVFLARE_CONTAINER_TESTS=1` for container lanes, and gate them with
`shouldSkip.containers` because GitHub Actions or Cloudflare runners may not
have Docker/Podman. Cloudflare still owns the deployed Containers control plane,
managed registry rollout, SSH, scaling, and hosted platform behavior.

### Cloudflare Builds stance

Cloudflare Builds is CI/CD orchestration, not a Worker runtime binding.
Devflare does not connect Git repositories, manage build hooks, own Cloudflare
Builds project settings, or replace GitHub Actions workflows.

### Workers for Platforms lifecycle stance

Devflare supports dispatch namespace bindings, not the tenant Worker control
plane. Devflare does not upload user Workers, manage Worker metadata, own tenant
routing policy, or provide the Workers for Platforms lifecycle API.

### Workflows local simulation stance

Local Workflows are useful for handler-level tests, class shape, and
transport-aware examples. Use deployed or Wrangler-backed tests for production
Workflow lifecycle behavior, retries, durability, and platform scheduling.

### Pipelines source and sink lifecycle stance

Pipelines local tests are useful for producer-code assertions. Devflare does not
create streams, pipelines, SQL transformations, sinks, or R2 buckets for the
deployed product lifecycle.

### Images transformation testability stance

Images local tests can validate Worker integration code and deterministic call
shape. Devflare does not provision hosted Images storage, variants, signed URLs,
or custom delivery rules.

### Media Transformations remote binding stance

Media Transformations local execution is remote-binding only. Devflare does not
configure zone-level transformation enablement, source origins, signed URL
policy, cache behavior, or billing controls.

### Artifacts persistence and deployment stance

Artifacts pure mocks are in-memory and process-local. Devflare does not create
Artifacts namespaces, persist local Git repositories, or emulate Git-over-HTTPS
remotes.

### Preview resource lifecycle policy

Devflare preview provisioning is intentionally limited to KV, D1, R2, Queues,
Vectorize, and the documented Hyperdrive reuse/resolve paths. Preview cleanup
does not delete Workflows, Pipelines, Images, Media Transformations, Artifacts,
AI Search, AI Gateway, Browser Run, Containers, Secrets Store, mTLS
certificates, or dispatch namespace resources.

### Cross-feature implementation decisions

Remote mode decisions are per feature, not global. Generated types are emitted
only for native binding keys. Test helpers exist when Devflare provides a
deterministic local mock or useful pure assertion surface. Every native binding
documented above includes a minimal config and Env usage example. Move from
`wrangler.passthrough` to native config when a binding appears in the native
list. Cloudflare dependency CI targets the pinned current Wrangler, Miniflare,
and workers-types majors documented in Cloudflare toolchain support.

### Offline-first testing support matrix

`createOfflineEnv(config, fixtures)` derives a deterministic pure-test `env`
from Devflare config. Offline-native means Devflare or Miniflare can run a
useful local simulator. Offline-fixture means Devflare provides an explicit
in-memory or handler-backed mock. Remote-boundary means meaningful behavior
lives in Cloudflare.

Use `shouldSkip.aiSearch`, `shouldSkip.aiGateway`, `shouldSkip.media`,
`shouldSkip.mtlsCertificates`, `shouldSkip.artifacts`, and `shouldSkip.builds`
for remote-boundary lanes. Offline-first tests should not claim to cover real
Workers AI inference, Vectorize search semantics, AI Search indexing/ranking/
crawling, Media Transformations output, mTLS certificate presentation,
Artifacts Git remotes, Browser Run live/HITL/recordings, Cloudflare Builds, or
the deployed Containers control plane.

## Machine-Checked Support Statements

These statements are intentionally exact because the docs tests use them as
public stance guards:

- Use `bindings.aiSearchNamespaces` or `bindings.aiSearch`.
- `env.AI.gateway(id)` exposes `patchLog()`, `getLog()`, `getUrl()`, and `run()`.
- Devflare does not manage Live View URLs, Human in the Loop handoff.
- Set `DEVFLARE_CONTAINER_TESTS=1`.
- Containers have full local support when Docker or Podman is available.
- Cloudflare still owns the deployed Containers control plane.
- Devflare does not connect Git repositories, manage build hooks.
- Devflare supports dispatch namespace bindings, not the tenant Worker control plane.
- Devflare does not upload user Workers, manage Worker metadata.
- Use deployed or Wrangler-backed tests for production Workflow lifecycle behavior.
- Devflare does not create streams, pipelines, SQL transformations, sinks, or R2 buckets.
- Devflare does not provision hosted Images storage, variants, signed URLs, or custom delivery rules.
- Devflare does not configure zone-level transformation enablement, source origins, signed URL policy, cache behavior, or billing controls.
- Devflare does not create Artifacts namespaces, persist local Git repositories, or emulate Git-over-HTTPS remotes.
- Devflare preview provisioning is intentionally limited to KV, D1, R2, Queues, Vectorize, and the documented Hyperdrive reuse/resolve paths.
- Preview cleanup does not delete Workflows, Pipelines, Images, Media Transformations, Artifacts, AI Search, AI Gateway, Browser Run, Containers, Secrets Store, mTLS certificates, or dispatch namespace resources.
- Generated types are emitted only for native binding keys.
- Test helpers exist when Devflare provides a deterministic local mock or useful pure assertion surface.
- Every native binding documented above includes a minimal config and Env usage example.
- Move from `wrangler.passthrough` to native config when a binding appears in the native list.
- Cloudflare dependency CI targets the pinned current Wrangler, Miniflare, and workers-types majors documented in Cloudflare toolchain support.
- `createOfflineEnv(config, fixtures)` derives a deterministic pure-test `env` from Devflare config.
- Offline-native means Devflare or Miniflare can run a useful local simulator.
- Offline-fixture means Devflare provides an explicit in-memory or handler-backed mock.
- Remote-boundary means meaningful behavior lives in Cloudflare.
- `shouldSkip.aiSearch`, `shouldSkip.aiGateway`, `shouldSkip.media`, `shouldSkip.mtlsCertificates`, `shouldSkip.artifacts`, and `shouldSkip.builds`.
- real Workers AI inference, Vectorize search semantics, AI Search indexing/ranking/crawling, Media Transformations output, mTLS certificate presentation, Artifacts Git remotes, Browser Run live/HITL/recordings, Cloudflare Builds, or the deployed Containers control plane.

## Verification

Docs and README drift are covered by:

```bash
bun run devflare:docs-integrity
```

The package publish path regenerates `packages/devflare/LLM.md` from the docs
model through `bun run --cwd packages/devflare llm:generate`.
