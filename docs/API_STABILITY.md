# API Stability Policy

This document defines the public API surface of the `devflare` npm package and
the stability guarantee that surface carries.

It is the single authoritative list of frozen entrypoints. The package
[`README.md`](../packages/devflare/README.md) and the docs site describe the
exports in more detail, but this page owns the stability contract for them.

## What "stable" means

`devflare` follows [semantic versioning](./VERSIONING_AND_RELEASE.md).

The package is currently published on the prerelease lane as `1.0.0-next.X`
(npm dist-tag `next`). During the prerelease lane the public surface may still
change between prereleases.

Once `1.0.0` ships:

- The entrypoints listed under **Frozen public entrypoints** below are covered
  by semver. A breaking change to any of them — removing an export, renaming an
  export, or changing the type/signature of an export in a
  non-backward-compatible way — requires a **major** version bump.
- Additive changes (new exports, new optional parameters, widened input types)
  are made in **minor** versions.
- Backward-compatible bug fixes are made in **patch** versions.
- A public symbol can be marked `@deprecated` in a minor/patch release and is
  only removed in a subsequent **major** release.

## Frozen public entrypoints

Each entrypoint is a subpath in the package `exports` map
([`packages/devflare/package.json`](../packages/devflare/package.json)). The
import path is what consumers write; the source index is where the surface is
defined.

| Import path | Source index | Surface |
| --- | --- | --- |
| `devflare` | `src/index.ts` | Node-side package entry: config utilities (`defineConfig`, `preview`, `loadConfig`, `loadResolvedConfig`, `compileConfig`, `stringifyConfig`, `configSchema`, `ref`, the config errors), `workerName`, Durable Object decorators, the CLI (`runCli`, `parseArgs`), and the unified `env`/`vars` proxy. `defineConfig` is also the default export. |
| `devflare/config` | `src/config-entry.ts` | Lightweight config-file entry (avoids the full Node barrel): `defineConfig`, the config `env` var-descriptor helper, `preview`, `ref`, the schema types, and `defineConfig` as default. |
| `devflare/runtime` | `src/runtime/index.ts` | Worker-safe runtime surface: request proxies (`env`, `vars`, `ctx`, `event`, `locals`); context management (`runWithContext`, `runWithEventContext`, `getContext`/`getContextOrNull`, `getEventContext`/`getEventContextOrNull`, `hasContext`, the `create*Event` constructors, the per-surface `get*Event` accessors); `ContextAccessError`; `createContextProxy`; middleware (`sequence`, the `define*Handler` helpers, resolve/invoke helpers); the router (`matchFetchRoute`, …); the Durable Object decorators; and the local sendEmail binding helpers. |
| `devflare/test` | `src/test/index.ts` | Test helpers: `createTestContext` + `env`; the `cf`/`worker`/`queue`/`scheduled`/`email`/`tail` triggers; service-binding resolution; `shouldSkip`; container helpers; the offline-bindings matrix; AI-Search mocks; the `createMock*` family; and `withTestContext`. |
| `devflare/vite` | `src/vite/index.ts` | Vite plugin: `devflarePlugin` (also default), `getPluginContext`, `getCloudflareConfig`, `getDevflareConfigs`, and the config-file helpers (`hasInlineViteConfig`, `resolveEffectiveViteProject`, `resolveViteUserConfig`, `writeGeneratedViteConfig`). This entry re-exports Vite's `Plugin` / `ConfigEnv` / `UserConfig` types, so type-checking it requires `vite` (an optional peer dependency) to be installed — which it always is in a Vite project. |
| `devflare/sveltekit` | `src/sveltekit/index.ts` | SvelteKit integration: `handle`, `createDevflarePlatform`, `createHandle`, `resetPlatform`, `resetConfigCache`, `isDevflareDev`, `getBridgePort`, and the Platform types. |
| `devflare/cloudflare` | `src/cloudflare/index.ts` | Cloudflare account / preview-registry API: the `account` object, the registry zod schemas, the preview-registry functions (`ensurePreviewRegistry`, reconcile/cleanup/retire, the `listTracked*` helpers), and `CloudflareAPIError`/`AuthenticationError`. |
| `devflare/decorators` | `src/decorators/index.ts` | Durable Object decorators only: `durableObject`, `getDurableObjectOptions`, and `type DurableObjectOptions`. |

There are four distinct `env` exports, one per entrypoint, that resolve
differently — keep them straight:

- `devflare` `env` — the unified request-then-bridge proxy (from `src/env`).
- `devflare/runtime` `env` — the request-context proxy (from `src/runtime/exports`).
- `devflare/config` `env` — the config var-descriptor builder (from `src/config/env-vars`).
- `devflare/test` `env` — the test env (from `src/test`).

## Not covered by the stability guarantee

- **`devflare/internal/send-email`** — this subpath exists in the `exports` map
  but is **internal**. The generated composed worker imports it; it is not part
  of the frozen public surface and may change in any release. The `/internal/`
  prefix marks any such subpath as non-frozen.
- **Deep imports** — importing from `devflare/dist/...` or any path that is not
  one of the entrypoints above is unsupported and not covered. `src/config/index.ts`
  is a real internal barrel but is **not** its own package subpath; its publicly
  reachable members are only those re-exported through the bare `devflare`
  entry.
- **Runtime behavior of remote-gated bindings** — Cloudflare owns the product
  behavior of remote-only bindings; see the support matrix in the docs.
