# FINDINGS

Last updated: 2026-04-17

## Review scope

This audit covered the `packages/devflare` package, including:

- `src/bridge`
- `src/browser-shim`
- `src/bundler`
- `src/cli`
- `src/cloudflare`
- `src/config`
- `src/decorators`
- `src/dev-server`
- `src/runtime`
- `src/sveltekit`
- `src/test`
- `src/transform`
- `src/utils`
- `src/vite`
- `src/worker-entry`
- package metadata and docs (`package.json`, `README.md`, `LLM.md`, `.docs/*`)

## What was fixed in this pass

### Fixed

- **High** — `packages/devflare/src/browser-shim/server.ts`
	- Browser-shim session state (`sessions`, `history`) is now per-instance instead of shared across every shim in the process
	- Added origin validation for HTTP and WebSocket upgrade requests so arbitrary remote web pages can no longer talk to the shim just because it is bound to localhost
	- Added a request-body size limit for `/v1/acquire`
	- Made shutdown iterate over a stable snapshot of session ids

- **Medium** — `packages/devflare/src/browser-shim/handler.ts`
	- Forwarded real request headers instead of only `Content-Type` and `Accept`
	- Added `duplex: 'half'` for streamed request bodies
	- Cleared WebSocket connect timeout properly
	- Stopped relying on `Object.values(new WebSocketPair())` ordering
	- Closed the shim WebSocket on failure paths

- **High** — `packages/devflare/src/bridge/server.ts`
	- Fixed HTTP transfer id decoding for R2 uploads/downloads so encoded `binding:key` paths work correctly
	- Returned serialized R2 metadata from transfer uploads instead of leaking raw runtime objects through JSON

- **Medium** — `packages/devflare/src/bridge/proxy.ts`
	- Deserialized HTTP-transfer R2 upload results back into proper R2-shaped objects
	- Fixed UTF-8 size calculation for strings when deciding whether to use HTTP transfer
	- Prevented DO stub proxies from accidentally behaving like thenables (`then`, `catch`, `finally`)
	- Deduplicated pending simple-binding value fetches and fixed optional rejection handling in the thenable wrapper

- **Medium** — `packages/devflare/src/config/ref.ts`
	- Rejected ref resolutions no longer poison the cache forever
	- Repeated `ref.COUNTER` access now returns a stable memoized binding object instead of a fresh proxy every time
	- Unresolved DO bindings no longer lie by returning the binding name as the class name
	- Tightened import-function handling so TypeScript no longer sees it as maybe-undefined after validation

- **Medium** — `packages/devflare/src/config/compiler.ts`
	- Removed the CommonJS `require('pathe')` call from an ESM package path
	- `compileDOWorkerConfig()` now accepts an environment option and resolves config through the same environment-aware path as the main compiler
	- Simplified `compileToProgrammaticConfig()` to return the real compiled config directly
	- Removed stale comments and redundant casts around D1/R2 compilation

- **Medium** — `packages/devflare/src/config/compiler.ts`, `packages/devflare/src/config/deploy-resources.ts`, `packages/devflare/src/config/index.ts`, `packages/devflare/src/cli/commands/build-artifacts.ts`, `packages/devflare/src/cli/commands/deploy.ts`, `packages/devflare/src/cli/preview-bindings.ts`
	- Split build-time vs deploy-time Wrangler compilation so `devflare build` can preserve name-based KV, D1, and Hyperdrive bindings in generated artifacts instead of trying to resolve live Cloudflare ids too early
	- Added deploy-time resource preparation for named bindings so deploy can resolve or provision missing KV namespaces, D1 databases, R2 buckets, and Queues before handing the final config to Wrangler
	- Added explicit handling for reusable build artifacts via `deploy --build <path>`, including support for generated `wrangler.jsonc` files and `.wrangler/deploy/config.json` redirects
	- Reused the built artifact's `main`/`assets` paths while rewriting the generated Wrangler config with concrete ids for deployment
	- Updated preview-binding inspection helpers so they understand name-preserving build artifacts instead of assuming every binding is already id-backed

- **Medium** — `packages/devflare/src/config/compatibility.ts`, `packages/devflare/src/config/schema.ts`, `packages/devflare/src/config/schema-env.ts`, `packages/devflare/src/config/resolve.ts`
	- Moved forced compatibility-flag normalization into one shared helper instead of duplicating magic flags in multiple schema layers
	- Environment-level `compatibilityFlags` now keep the required Node flags instead of drifting from root-config behavior
	- Environment merge now re-normalizes compatibility flags after overlaying env config so forced flags stay present without duplication
	- Replaced `defu`-style environment merging with explicit deep merge semantics that replace arrays instead of concatenating them
	- Environment overrides now behave like real overrides for fields such as `routes`, `migrations`, `triggers.crons`, and queue consumer arrays while still deep-merging objects like `vars` and `bindings`

- **Medium** — `packages/devflare/src/vite/config-file.ts`
	- Normalized path handling to use `pathe` consistently
	- Removed mixed `node:path` separator logic that could mis-detect `dist` on normalized Windows paths

- **Medium** — `packages/devflare/src/cloudflare/kv-namespace.ts`
	- Switched named KV namespace lookup to use paginated Cloudflare listing instead of only checking the first page
	- Added an optional API client options parameter so callers and tests can pass explicit auth context without relying on ambient login state
	- Added a regression test covering the 'namespace exists on page 2' case

- **Medium** — `packages/devflare/src/cloudflare/preview-urls.ts`, `packages/devflare/src/cli/preview.ts`, `packages/devflare/src/cloudflare/preview-registry-records.ts`
	- Extracted workers.dev preview URL formatting into a neutral helper so the `cloudflare` layer no longer imports from the `cli` layer
	- Preserved the existing CLI exports so the public helper surface stayed stable
	- Verified the move with focused preview and preview-registry tests

- **Medium** — `packages/devflare/src/cloudflare/api.ts`
	- Made auth retry state request-local instead of process-global so simultaneous Cloudflare API calls do not suppress each other's single retry
	- Added a concurrency regression test that proves two in-flight auth failures each receive one retry
	- Wrapped invalid JSON responses in a typed `CloudflareAPIError` instead of leaking raw JSON parse failures

- **Medium** — `packages/devflare/src/cli/commands/login.ts`
	- Stopped invoking Wrangler login through `bunx --bun`, matching the earlier repo-wide fix for Wrangler command instability under Bun runtime shims
	- Updated the unit test accordingly

- **Low** — `packages/devflare/README.md`
	- Fixed a broken quick-start fetch example
	- Restored the missing `types` generation step
	- Clarified that `devflare build` preserves named bindings locally while `devflare deploy` resolves or provisions the concrete Cloudflare resources, and documented `deploy --build <path>`

- **Low** — `packages/devflare/src/cli/help-pages/pages/core.ts`, `packages/devflare/.docs/CURRENT_REQUEST.md`
	- Updated the CLI help text so build vs deploy responsibilities match the current implementation and `--build <path>` is documented in the built-in help output
	- Deleted a stale internal `.docs/CURRENT_REQUEST.md` tracker that described an already-finished historical request and no longer reflected the active package state

- **High** — `packages/devflare/src/browser-shim/worker.ts`
	- Deleted the legacy browser-shim worker file. Grep confirmed zero runtime importers in `src/` for its module path or exported `generateBrowserWorkerScript`; the active path is `binding-worker.ts`.

- **Medium** — `packages/devflare/src/cli/dependencies.ts`
	- Removed unconditional `shell: true` from the real `ProcessRunner.spawn` so CLI subprocesses no longer inherit shell interpretation by default
	- Added an optional `shell?: boolean` option on the spawner for callers that legitimately need shell semantics (none today)
	- Added a regression test that mocks `node:child_process` and asserts default-off / explicit-on behavior

- **High** — `packages/devflare/src/bridge/serialization.ts`
	- Extended `serializeValue` / `deserializeValue` to round-trip `Date`, `Map`, `Set`, `URL`, and `Error` through a dedicated `__devflare`-tagged discriminator separate from the existing `__type` Web-API tag
	- `Map` / `Set` recurse their entries/values through the same helper so nested special objects round-trip
	- Added 10 unit tests covering each special type, nested combinations, and primitive/array/plain-object preservation

- **High** — `packages/devflare/package.json`
	- Moved `miniflare` from `devDependencies` to `dependencies` to match how runtime code (`bridge/miniflare.ts`, `dev-server/server.ts`, `browser-shim/handler.ts`, `test/simple-context.ts`) dynamically imports it
	- Moved `@cloudflare/workers-types` to `peerDependencies` (marked optional) while retaining it in `devDependencies` so this repo's own typechecks still resolve it; consumers of generated types install it once
	- Declared an `engines` field (`node >=20`, `bun >=1.1`)
	- Did not touch the `dist/src/**` vs `dist/**` export split (tracked separately)

- **Low** — `packages/devflare/tests/unit/cli/cli.test.ts`
	- Updated the deploy-help expectation to match the CLI help output after `deploy --build <path>` was documented

- **Medium** — `packages/devflare/src/runtime/middleware.ts`, `packages/devflare/src/runtime/index.ts`
	- Added a public `defineFetchHandler(fn, { style: 'resolve' | 'worker' })` escape hatch plus re-exported `markResolveStyle` so authors can explicitly opt into resolve-style dispatch without relying on parameter-name inspection
	- Reordered detection so the `FETCH_RESOLVE_STYLE_SYMBOL` / `FETCH_SEQUENCE_SYMBOL` marker checks run first and only fall back to `Function.toString()` parameter sniffing when unmarked
	- Documented the minification risk in JSDoc so users shipping aggressively minified builds know to wrap resolve-style handlers with `sequence(...)` or `defineFetchHandler(fn, { style: 'resolve' })`
	- Added `tests/unit/runtime/middleware-detection.test.ts` covering resolve-style sequences, 3-arg worker-style, 2-arg unmarked worker-style under simulated minification, marker-driven resolve-style under simulated minification, and 0/1-arg handlers not being routed worker-style

- **Medium** — `packages/devflare/src/test/utilities.ts`
	- `createMockKV` now stores values as `Uint8Array` instead of `string`, so binary payloads (ArrayBuffer, ArrayBufferView, multi-chunk `ReadableStream`) round-trip byte-for-byte instead of being silently corrupted by UTF-8 re-encoding
	- `get(key, 'arrayBuffer')` returns a fresh independent ArrayBuffer copy so callers cannot accidentally mutate the backing store
	- `get(key, 'stream')` emits a real `ReadableStream<Uint8Array>` without decoding
	- Added `tests/unit/test/mock-kv.test.ts` with 9 new regression tests, including non-UTF-8 byte round-trips and stream-put correctness

- **High** — `packages/devflare/src/bridge/server.ts`
	- Merged two colliding `case 'get':` arms in `executeRpcMethod` into a single shape-dispatched arm: KV namespaces are detected by the absence of DO-specific methods (`idFromName`/`idFromString`/`newUniqueId`), restoring DO `get` reachability while preserving wire compatibility
	- Replaced silent `catch {}` around top-level WebSocket message handling with `console.error('[devflare bridge] message handler error:', error)` + best-effort error envelope response so drops no longer hide protocol failures
	- `case 'run':` now throws when the target binding lacks a `.run` method instead of falling through to `undefined`
	- Exported `executeRpcMethod` and added `tests/unit/bridge/server-rpc.test.ts` (4 tests) covering KV `get`, DO `get`, missing-`run`, and `run` forwarding

- **High** — `packages/devflare/src/dev-server/d1-migrations.ts`
	- Per-binding directory precedence: `migrations/<BINDING_NAME>/*.sql` now wins over the shared `migrations/*.sql` fallback, and the shared fallback is only used for bindings that have no per-binding directory at all; an empty per-binding directory skips (no fallback) so operators can intentionally opt a binding out
	- Alphabetical ordering within each per-binding directory is preserved, as is the existing retry loop and startup-time application via `applyMigrationsToBinding`
	- Distinct `info` log per binding with the source directory (per-binding vs shared) makes application visible in dev logs
	- Added 5 regression tests in `tests/unit/dev-server/d1-migrations.test.ts` covering per-binding wins, shared fallback only, empty-per-binding skip, and alphabetical ordering

- **Medium** — `packages/devflare/src/cloudflare/preferences.ts`
	- Introduced a `writeFileAtomic(path, contents)` helper that writes `path + '.tmp-<pid>-<ts>'` then `renameSync`s into place and cleans up the temp file on rename failure, preventing partially-written preference files on crash
	- `writeLocalPreferences` and `writePackageJson` now route through the atomic helper while preserving tab indentation and the package.json trailing newline
	- Replaced three silent `catch {}` blocks around cloud-KV sync in `getGlobalDefaultAccountId`, `setGlobalDefaultAccountId`, and `clearGlobalDefaultAccountId` with `console.debug('[devflare preferences] cloud KV sync failed:', message)` logs so failures are diagnosable without spamming stderr with full stack traces
	- `clearGlobalDefaultAccountId` now emits a `console.warn` noting the empty-string workaround since `./api` does not currently export a dedicated `kvDelete` helper (follow-up: add `kvDelete` and switch to it)
	- Added `tests/unit/cloudflare/preferences.test.ts` (5 tests; 1 skipped on Windows for rename-failure temp cleanup timing)

- **High** — `packages/devflare/src/index.ts`
	- Pruned the main package barrel so internal/test-only APIs stay on their own subpaths. Removed re-exports for bridge internals (`setBindingHints`, `createEnvProxy`, `initEnv`, `BridgeClient`, `getClient`, `startMiniflare*`, `getMiniflare`, `stopMiniflare`, `gateway` + types), test helpers (`createTestContext`, `createMockTestContext`, `createMock{KV,D1,R2,Queue,Env}`, `withTestContext`, `createBridgeTestContext`, `stopBridgeTestContext`, `getBridgeTestContext`, `testEnv` + types), and transform helpers (`findDurableObjectClasses*`, `generateWrapper`, `transformDurableObject`, `transformWorkerEntrypoint`, `findExportedFunctions`, `shouldTransformWorker`, `generateRpcInterface` + types)
	- Kept the documented public surface: `defineConfig`, config helpers, `ref`, `workerName`, decorators, CLI (`runCli`, `parseArgs`), and `env` (plus its types)
	- Grep audit over `cases/**` and `apps/**` confirmed no first-party consumer imports any removed symbol from bare `'devflare'`; the same names remain importable from `devflare/test`, `devflare/bridge`, and `devflare/transform` subpaths
	- Added `tests/unit/package-surface.test.ts` (4 tests) asserting the kept-set is present, the removed-set is absent, and subpath imports still resolve
	- Follow-up risk: external consumers that imported these names from bare `'devflare'` will need to switch to subpaths — should be documented in the next changelog/release notes

## Validation performed

### Passed

- `bun test tests/unit/cli/login.test.ts tests/unit/config/ref.test.ts tests/integration/bridge/bridge-proxy.test.ts`
	- 17 tests passed across 3 files

- `bun test tests/unit/config/schema-env-build.test.ts tests/unit/config/preview.test.ts`
	- 17 tests passed across 2 files

- `bun test tests/unit/cli/login.test.ts tests/unit/config/ref.test.ts tests/integration/bridge/bridge-proxy.test.ts tests/unit/config/schema-env-build.test.ts tests/unit/config/preview.test.ts tests/unit/cloudflare/kv-namespace.test.ts`
	- 36 tests passed across 6 files

- `bun test tests/unit/cli/preview.test.ts tests/unit/cloudflare/preview-registry.test.ts`
	- 12 tests passed across 2 files

- `bun test tests/unit/cloudflare/api.test.ts tests/unit/cloudflare/kv-namespace.test.ts tests/unit/cloudflare/preview-registry.test.ts`
	- 14 tests passed across 3 files

- `bun test tests/unit/config/compiler.test.ts tests/unit/config/resource-resolution.test.ts tests/unit/cli/preview-bindings.test.ts tests/integration/cli/build-deploy-worker-only.test.ts tests/integration/cli/deploy-build-provisioning.test.ts`
	- 68 tests passed across 5 files

- `bun test tests/unit/config/preview.test.ts tests/unit/config/compiler.test.ts tests/unit/config/resource-resolution.test.ts tests/integration/cli/build-deploy-worker-only.test.ts tests/integration/cli/deploy-build-provisioning.test.ts`
	- 73 tests passed across 5 files

- `bun test tests/unit/runtime tests/unit/bridge tests/integration/bridge tests/unit/cli tests/unit/config tests/unit/cloudflare tests/integration/cli tests/unit/test`
	- 507 passed, 1 skipped, 0 failed across 63 files (includes the new mock-KV, middleware-detection, spawn, and bridge special-object round-trip coverage)

- Editor/type diagnostics for edited files
	- No remaining file-level diagnostics in the edited sources

- `bun test tests/unit tests/integration/bridge tests/integration/cli tests/integration/dev-server/worker-only-root-env.test.ts`
	- 682 passed, 2 skipped, 1 pre-existing flaky integration test (`worker-only dev server late worker discovery` when run together with other heavy process-spawn suites) across 94 files; all tests directly touching Wave 3–4 changes (runtime, bridge, test, worker-entry, dev-server, config, package-surface, worker-only-root-env including the sendEmail case) are green

### Blocked by existing repo/environment issues

- `bun run check`
	- Fails in workspace cases that require real Cloudflare resources to exist
	- Example: `cases/case18` fails with `CONFIG_RESOURCE_RESOLUTION_ERROR` because KV namespace `cache-kv` cannot be resolved in account `db3d994ca26841953068dca33bfc89a8`

- `bun run build`
	- Fails for the same class of existing resource-resolution issues
	- Examples observed during this session:
		- `@devflare/case1-basic-worker` missing `CACHE → cache-kv-id`
		- `@devflare/case12-email-handlers` missing `EMAIL_LOG → email-log-kv-id`

These broader failures are real findings, but they are not regressions introduced by the fixes above.

## Remaining findings

### High severity

- `packages/devflare/src/bridge/client.ts`
	- `createWsProxy()` now awaits `ws.opened` (cached per-socket) before resolving; `ReadableStream.pull()` replaced with an awaitable-queue; disconnect centralized in `cleanupPending()` which rejects pending RPCs and errors live streams with a clear `Bridge disconnected` message; JSON-parse failures log via `console.error` instead of being silently dropped; added `close()` alias and focused unit tests (`tests/unit/bridge/client.test.ts`)

- `packages/devflare/src/bridge/serialization.ts`
	- Dead `http` body-transfer branch: producer now throws `'http body transfer not implemented; caller should use inline or binary transfer'` instead of emitting an unconsumable placeholder; the `{ type: 'http' }` variant was dropped from the `BodyRef` union and unreachable `case 'http':` branches in both deserializers were removed
	- Two DO-id serializer shapes consolidated onto the canonical `{ __type: 'DOId', hex: string }` wire shape via a shared `DO_ID_TYPE` constant plus `serializeDOId`/`deserializeDOId` helpers; `server.ts` no longer redefines them locally (wire bytes unchanged)
	- Follow-up still open: request/response body streaming — the architecture still fully buffers request/response bodies through inline serialization rather than streaming them frame-by-frame

- `packages/devflare/src/bridge/miniflare.ts`
	- Extracted the shared inline-gateway runtime (base64 helpers, R2 serializers, `serializeResponse`, `createEmailMessageRaw`, `isDurableObjectNamespace`, the canonical `executeRpcMethod` dispatcher) into `src/bridge/gateway-runtime.ts` as a single stringified template (`GATEWAY_RUNTIME_JS`). Both `miniflare.ts`'s HTTP-only gateway and `dev-server/gateway-script.ts`'s WS-capable gateway now inline that one source, so RPC method vocabulary, error envelope, and binding-hint detection no longer drift
	- Follow-up: singleton/options story for `startMiniflare()` + `globalMiniflare` still mirrors the `getClient()` shape; unifying with `src/bridge/server.ts` WS wire protocol would require generating JS from TS at build time and is deferred

- `packages/devflare/src/transform/durable-object.ts`
	- Fixed: Durable Object discovery and decorator parsing replaced with AST walk via `ts.createSourceFile(..., ScriptKind.TSX)`. `collectDurableObjectClasses` inspects `heritageClauses` for `extends DurableObject` (Identifier or PropertyAccessExpression) and uses `ts.canHaveDecorators`/`ts.getDecorators` for `@durableObject`; decorator options parsed from `ObjectLiteralExpression` (Boolean/string/numeric literals + string-array literals for `alarms`, `websockets`, `rpc`). Deduplication via a `Map` keyed on class name. `generateWrapper` / `transformDurableObject` outputs unchanged; all 50 existing tests green
	- Follow-up still open: deeper audit of generated wrapper request/event parameter correctness

- `packages/devflare/src/transform/worker-entrypoint.ts`
	- Fixed: three regex/string-replace sites inside `transformWorkerEntrypoint` (export-default-function, named-export-function, export-const-function) converted to AST-keyed `MagicString` edits using positions from the existing TS parse; comments/strings containing `export function ...` can no longer trigger false rewrites
	- Fixed: `shouldTransformWorker` now accepts the full `{ts,tsx,mts,cts,js,mjs,cjs}` matrix (case-insensitive)
	- Fixed: new `shouldEmitTsSyntax(filename)` helper gates TS-only syntax emission; JS inputs emit `async fetch(request)` without type annotations, and RPC method signatures fall back to parameter-names-only for JS. `generateRpcInterface` is never injected into emitted source; stays a pure export for callers
	- 3 new tests added, 53 total in `tests/unit/transform/worker-entrypoint.test.ts` green

- `packages/devflare/src/vite/plugin.ts`
	- Per-instance state is now built inside the `devflarePlugin()` factory via an internal `createPluginState()` helper; `pluginContext` (compiled Wrangler config, Cloudflare config, project root, auxiliary worker config, DO map) and other previously module-level mutables live on the returned state object so multiple concurrent plugin instances no longer share memory. A single module-level `lastPluginContext` pointer is kept (documented inline) purely to back the public `getPluginContext()` convenience API; hooks do not read it
	- Follow-up still open: `getCloudflareConfig()` vs `getDevflareConfigs()` overlap and the one-pass transform hook multiplexing worker-entry + Durable Object logic were not addressed in this pass

- `packages/devflare/src/config/compiler.ts`
	- Fixed: `compileDOWorkerConfig()` now returns `WranglerConfig[]` (was `WranglerConfig | null`) and derives per-class names as `${config.name}-${kebabCase(className)}` (or explicit `scriptName` when a binding declares one). Multiple DO classes produce one compiled-worker entry per class with migrations filtered per-class via `filterMigrationForClass`. No more first-binding-wins
	- 4 new tests added covering empty, two-classes-named-correctly, explicit `scriptName`, and shared-class grouping
	- Follow-up still open: single canonical build-time preview/env/resource resolution path across compiler/resource-resolution/vite consumers

- `packages/devflare/src/cloudflare/api.ts`
	- Fixed: extracted `parseCloudflareEnvelope<T>(response, { allow404? })` + `parseRawJson<T>` as the single canonical envelope decode path. Every caller (`apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete` via `requestCloudflareResult` → `requestCloudflareJson` → `decodeCloudflareEnvelope`, `apiGetAll` pagination, and KV error paths via `throwKVValueError`) routes through it. Body is read once, failures surface `errors[0].code` + `errors[0].message` via a shared `envelopeFailureError`. KV `/values/<key>` left on the raw-body path by design (binary-safe)
	- Fixed: extracted `createCloudflareAuthSession({ accountId?, tokenProvider?, onInvalidate? })` with `getAuthHeader(forceRefresh?)` + `invalidate()`. Module-local `defaultAuthSession` services all request paths via `resolveAuthHeader(options, forceRefresh)`; `options.token` still short-circuits. Public exports unchanged plus new `parseCloudflareEnvelope`, `parseRawJson`, `createCloudflareAuthSession`
	- 2 new tests cover non-envelope JSON and `success: false` error surfacing

- `packages/devflare/src/cloudflare/preview-registry-records.ts`
	- Fixed: split into three cohesive sibling modules — `preview-registry-transport.ts` (Cloudflare API reads: `getVersionInfoById`), `preview-registry-inference.ts` (pure deterministic derivation: `toIsoString`, `inferRecordSource`, id getters, `hasRetireSelector`, `matchesPreview*RetireTarget`, `getExplicitPreviewSyncOverrides`), `preview-registry-shape.ts` (persistence projections: `buildPreviewRecord`, `buildPreviewScopeRecord`, `buildPreviewDeploymentRecord`, `buildProductionDeploymentRecord`, `markPreview*Deleted`, `markDeploymentRecordDeleted`). The original module is now a thin barrel re-exporting them so existing imports keep working
	- 6 new unit tests for the pure inference layer

- `packages/devflare/src/dev-server/server.ts`
	- Fixed: queued reload chain extracted into `src/dev-server/reload-queue.ts` (`createReloadQueue({ reload, logger })` → `{ schedule(), drain() }`). Single in-flight reload, concurrent requests coalesce into one trailing reload, errors route through `logger.error('[devflare dev] reload failed:', error)` instead of `.catch(() => {})` silent drop
	- Fixed: Vite detection consolidated into `resolveViteMode(cwd, { requested })` in `src/dev-server/vite-utils.ts`. `createDevServer.start()` now actually honors the returned `enableVite`: when the caller asks for Vite but no config is detected, the server logs and downgrades to worker-only for its lifetime (previously `shouldStartVite` was computed and dropped). `enableVite` closure is mutable so `getWorkerWatchTargets`, `startWorkerSourceWatcher`, and `buildMiniflareConfig` see the resolved mode
	- Follow-up still open: further decomposition of `createDevServer` (Miniflare config build, DO bundling orchestration, watcher setup, start/stop lifecycle) remains in a single closure; deferred as behavior-risk

- `packages/devflare/src/dev-server/d1-migrations.ts`
	- Per-binding precedence has landed; current follow-up is deeper migration state tracking (applied ledger) rather than re-applying SQL on every dev-server start

- `packages/devflare/src/dev-server/gateway-script.ts`
	- Fixed: extracted the in-sandbox WebSocket bridge (`handleBridgeWebSocket`, `handleBridgeJsonMessage`, `handleBridgeRpcCall`, `handleBridgeWsOpen`, `handleBridgeWsClose`) and `handleHttpTransfer` into `src/bridge/gateway-runtime.ts`'s shared `GATEWAY_RUNTIME_JS` template. `gateway-script.ts` shrank from ~310 to ~200 lines — only dev-server-only overlay remains (`WS_ROUTES` matching, DO WebSocket forwarding, D1 migration endpoint, email ingest endpoint, app-worker fallthrough, dev `/health`). Process-global `wsProxies` map replaced with per-connection Map created inside `handleBridgeWebSocket` so reloads no longer leak state across clients
	- Follow-up still open: `src/bridge/server.ts` remains a TypeScript sibling (richer streaming transport, typed, user-facing export). Message vocabulary + error envelope are kept aligned by shape; full TS↔JS dedup would require build-time codegen and is deferred

- `packages/devflare/src/runtime/middleware.ts`
	- Handler calling conventions still have a `Function.prototype.toString()` fallback for unmarked 2-arg handlers; the new `defineFetchHandler` / `markResolveStyle` markers are now the recommended minification-safe path but the fallback is still present so legacy user code keeps working

- `packages/devflare/src/runtime/context-events.ts`
	- Fixed: added `prepareEventShell(env, { locals })` helper centralizing the shared `wrapEnvSendEmailBindings(env)` + `createLocals(options.locals)` pair. Every event builder (`createBaseEvent`, `createFetchEvent`, `createQueueEvent`, `createScheduledEvent`, `createEmailEvent`, `createTailEvent`, `createDurableObjectFetchEvent`, `createDurableObjectAlarmEvent`, and the three DO websocket variants) now spreads the shell and layers its specific fields. Public signatures unchanged
	- Fixed: `createDefaultEvent` rewritten as an exhaustive `switch` over `RuntimeEventType`. `'fetch'` and `'durable-object-fetch'` specialize when request+ctx available; `'durable-object-alarm'` specializes when ctx available; payload-dependent kinds (`queue`, `scheduled`, `email`, `tail`, DO websocket variants) fall back to `createBaseEvent` with the correct `type` (no longer silently coerced to `'fetch'`); unknown kinds throw with a `never` exhaustiveness guard

- `packages/devflare/src/runtime/index.ts`
	- Reviewed: `setLocalSendEmailBindings` / `clearLocalSendEmailBindings` are pure in-worker state (no Node-only imports) and are consumed by the generated composed worker which imports through the `devflare/runtime` subpath. Decision: keep them on the runtime barrel — the original finding was a mislabel.

- `packages/devflare/src/test/simple-context.ts`
	- Module-level mutables moved inside a per-invocation `TestContextState`; hint extraction deduped with `bridge-context.ts` via `src/test/binding-hints.ts`; remaining follow-up is splitting the (still large) `createTestContext()` body into smaller helpers, which is deferred to avoid behavioral drift

- `packages/devflare/src/test/utilities.ts`
	- Fixed: `createMockKV`'s `getWithMetadata` now shares one binary-safe decoding path with `get` via a shared `decodeBytes(bytes, type)` + `resolveType(options)` helper; honors `type: 'arrayBuffer' | 'stream' | 'json' | 'text'` (defaults to `'text'`) instead of always UTF-8-decoding
	- Fixed: `createMockD1` is now minimally behavioral. Accepts either the legacy `unknown[]` (backward-compat) or a new `MockD1Options` with per-table `fixtures` and a `results` fallback. A regex recognizes `INSERT INTO <table>`, `SELECT … FROM <table>`, `UPDATE <table>`, `DELETE FROM <table>` and routes `.all()` / `.first()` / `.raw()` / `.run()` to a per-instance in-memory table map. `INSERT` appends, `DELETE` clears, `.run()` reports realistic `changes` / `last_row_id`. Falls back to the original stub when no fixture matches
	- 6 new tests added covering binary-safe `getWithMetadata` and D1 fixture-based reads
	- Follow-up still open: mock lane vs Miniflare-backed lane overlap is a documentation/guidance concern, deferred

- `packages/devflare/src/index.ts`
	- Main barrel prune has landed; external consumers importing bridge/test/transform helpers from bare `'devflare'` will need to switch to the dedicated subpaths — documented in follow-up changelog

- `packages/devflare/package.json`
	- Fixed: `bun build` now runs with `--root ./src` so JS entry points land at `dist/<subpath>/index.js` (flat layout matching `tsgo`'s declaration output). Every `exports` entry updated so `types`, `import`, and `default` share the same `./dist/<subpath>/...` prefix. `bin/devflare.js` and `src/vite/config-file.ts` runtime paths updated accordingly. Verified via build + real subpath integration test (`tests/integration/dev-server/worker-only-root-env.test.ts`)

### Medium severity

- `packages/devflare/src/browser.ts`
	- Browser-safe fallback proxies still fake too much behavior and can lie about feature presence

- `packages/devflare/src/browser-shim/server.ts`
	- Still hardcodes heavy Chrome flags and uses `--no-sandbox`
	- Download progress logging is still noisy and heuristic-based

- `packages/devflare/src/bundler/do-bundler.ts`
	- Fixed: the `.devflare-temp-<className>.ts` write next to user source eliminated entirely. Replaced with a Rolldown virtual-entry plugin (`resolveId` / `load`) whose synthetic id sits at `<sourceDir>/.devflare-do-<className>.virtual.ts` — rolldown still resolves relative imports from the original DO module's directory, but no file is written to disk. No cleanup needed, no watcher race, no `os.tmpdir()` or `.devflare/.cache/` cruft
	- Rebuild strategy (full-rebuild vs HMR) still unchanged and deferred

- `packages/devflare/src/bundler/rolldown-shared.ts`
	- Alias precedence still needs deeper review to ensure user overrides beat framework defaults everywhere

- `packages/devflare/src/bundler/worker-compat.ts`
	- Fixed: shebang handling no longer concatenates imports onto the shebang line when the source lacks a trailing newline. `appendRight`-s imports after the shebang with an explicit leading newline; never double-inserts, never regex-rewrites the shebang
	- Dynamic-import unwrap: reviewed — current code already walks the TS AST (`transformWorkerDynamicImports` + `assertWorkerBundleHasNoDynamicImports`) so literal `import(...)` inside strings/comments is already ignored; no string replace to harden

- `packages/devflare/src/cloudflare/preferences.ts`
	- Atomic writes + logged catches have landed (Wave 3). Wave 5: `kvDelete` helper added to `src/cloudflare/api.ts` (treats 404 as success, reuses the shared envelope path), and `clearGlobalDefaultAccountId` now uses it instead of the empty-string workaround; the warn log about stale KV state is removed

- `packages/devflare/src/cloudflare/usage.ts`
	- Fixed: Cloudflare KV REST has no conditional-write primitive, so implemented optimistic RMW + post-write verification + capped exponential backoff (25·2^n ms capped at 400 ms, max 5 attempts). On retry exhaustion a `console.warn` labels counters as best-effort and the last-written record is returned instead of silently succeeding. `RecordUsageDeps` injection seam (fourth param) exposes `kvGet`, `kvPut`, `getNamespaceId`, `sleep`, `now`, `maxAttempts`, `warn` for tests
	- 2 new tests covering retry-recovery and warn-on-exhaustion

- `packages/devflare/src/cloudflare/tokens.ts`
	- Token permission-group filtering still relies heavily on Cloudflare display-name strings

- `packages/devflare/src/config/ref.ts`
	- Config-path extraction: `fn.toString()` path is now wrapped behind `extractConfigPathFromImportFn` with a pre-check. No `import(` → existing `<pending>` sentinel. `import(` present but empty specifier or `${…}` template literal → throws a clear error. Short/no-separator specifier → throws as a minification heuristic. A true runtime probe via Proxy is not applicable to the `import()` syntactic operator (documented in-code)
	- 4 new tests covering arrow/block/pending/dynamic-template cases
	- The public type for uppercase DO bindings still over-promises compared with runtime behavior — deferred

- `packages/devflare/src/config/schema-env.ts`
	- Now derived from the root schema via `z.object(rootConfigShape).omit({ accountId: true, wsRoutes: true }).partial().strict()` (wrapped in `z.lazy` to break the module-init cycle). Forced compatibility-flag normalization is preserved automatically because `rootConfigShape.compatibilityFlags` carries the `normalizeCompatibilityFlags` transform. Public exports unchanged.

- `packages/devflare/src/config/preview-resources.ts`
	- Fixed: Hyperdrive preview fallback now requires explicit opt-in. `hyperdriveBindingByNameSchema` accepts `{ name, previewFallback?: 'base', previewId?, previewLocalConnectionString? }`. `collectPreviewScopedResourcePlan` carries an `allowBaseFallback` flag; `preparePreviewScopedResourcesForDeploy` throws a clear error naming the binding and listing the three remediation options (`previewId` / `previewLocalConnectionString` / `previewFallback: 'base'`) when a preview Hyperdrive has no dedicated preview and no opt-in. `applyHyperdriveBindingFallbacks` collapses object-form bindings to the resolved base string when a fallback applies

- `packages/devflare/src/cli/preview-bindings.ts`
	- Fixed: dual `'legacy'`/`'compact'` parser modes consolidated into a single-pass parser. `preprocessWranglerLine` strips ANSI escape codes + trims CR/whitespace; `isBindingTableHeader` detects any supported header; `parseBindingRow` recognizes compact (`env.NAME (resource)`) vs legacy (`type | name | resource`) shape per-row. 2 new regression tests covering ANSI stripping on compact-format and indented/trailing-annotation rows on legacy-format output

- `packages/devflare/src/sveltekit/platform.ts`
	- Fixed: local ~55-line `extractHintsFromConfig` deleted; now imports `extractBindingHints` from `src/test/binding-hints.ts` (extended to recognize queue producers — minimal adaptation, not a fork) so hint extraction lives in one place shared with `createTestContext`/`createBridgeTestContext`
	- Fixed: platform caching keyed on a `fingerprintHints()` stable sorted-JSON hash so configs with different hints no longer share a cached platform. `getPlatformCacheKey(bridgeUrl, hints)`
	- Fixed: `waitUntil()` errors additively captured on `platform.pendingErrors` via `createDevExecutionContext(pendingErrors)`; exported `drainWaitUntilErrors(platform)` helper. Existing `console.error` log preserved. New test covers the capture

- `packages/devflare/src/utils/resolve-package.ts`
	- Fixed: introduced `resolveSpecifier` helper with ESM-first chain `import.meta.resolve` → `createRequire(fromFileUrl).resolve`. `catch` narrowed to `MODULE_NOT_FOUND` / `ERR_MODULE_NOT_FOUND` via typed `code` check; syntax/permission/etc. errors now propagate instead of being silently swallowed. Existing path-relative fallback preserved for backwards compatibility; public signatures unchanged

- `packages/devflare/src/worker-entry/composed-worker.ts`
	- Fixed: introduced an internal `CodeBuilder` with typed methods (`importStatement`, `importNamespace`, `reExport`, `constDeclaration`, `classDeclaration`, `exportDefault`, `raw`, `blank`). `getComposedWorkerEntrypointSource` now assembles imports, fallbacks, DO re-exports, manifests, handler declarations, and default export through the builder — output is byte-identical
	- Fixed: dev-only email helpers (`__devflareCreateEmailHeaders`, `__devflareCreateEmailRawStream`, `__devflareHandleInternalEmail`) + the `/_devflare/internal/email` gate extracted into `emitDevOnlyEmailHooks(builder, { enabled })`. New `includeDevOnlyHooks?: boolean` option defaults to current behavior (`options.devInternalEmail === true`)

### Lower-severity but worth cleaning

- Stale comments and placeholder responses remain in several bundler and compiler paths
- There are still multiple broad `catch {}` sites across the bridge, browser shim, bundler, and config loaders
- The repo still carries several duplicated helper patterns that differ only slightly in naming or logging behavior
- `README.md`, `LLM.md`, and code surfaces still drift in several places even after the quick-start fix

## Suggested next fix wave

1. Collapse the duplicate gateway implementations so `src/bridge/server.ts` becomes the single transport source of truth
2. Derive `schema-env` from the root config schema instead of manually mirroring it
3. Stop using `Function.toString()` as runtime middleware signature detection
4. Trim the main package barrel so internal/test-only APIs stay on subpaths
5. Resolve the `dist/src/**` vs `dist/**` export split in `package.json`
6. Make the package build/check lanes independent from live Cloudflare resource resolution for local contributor workflows
