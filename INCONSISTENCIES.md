# INCONSISTENCIES

Last updated: 2026-04-17

This file tracks places where the codebase tells two stories at once, keeps overlapping implementations alive, or documents behavior that the code no longer actually has.

## Bridge and transport inconsistencies

- `packages/devflare/src/bridge/protocol.ts`
	- `HTTP_TRANSFER_THRESHOLD` comments still drift from the values and behavior used elsewhere
	- Canonicalize on one threshold definition and import it everywhere

- `packages/devflare/src/bridge/server.ts` vs `packages/devflare/src/bridge/miniflare.ts` vs `packages/devflare/src/dev-server/gateway-script.ts`
	- The repo still has multiple gateway implementations with overlapping but different RPC behavior
	- Canonicalize on one gateway implementation and make the other entrypoints load it instead of re-encoding it

- `packages/devflare/src/bridge/serialization.ts` vs `.docs/BRIDGE_ARCHITECTURE.md`
	- Docs promise stream references and pull-based body transport
	- Code still buffers request/response bodies eagerly and only partially implements streaming
	- Canonicalize either the implementation or the documentation, but stop claiming both

- `packages/devflare/src/bridge/server.ts`
	- RPC operation names still mix bare verbs (`get`, `put`, `head`) with namespaced forms (`r2.get`, `stmt.raw`, `email.send`)
	- Canonicalize operation naming by binding kind

- `packages/devflare/src/bridge/server.ts` and `packages/devflare/src/bridge/proxy.ts`
	- Durable Object `get` semantics still overlap conceptually with KV `get`, even though the client mostly avoids the server-side DO `get` path now
	- Canonicalize the DO wire operation as `do.get` or remove the dead server branch entirely

- `packages/devflare/src/bridge/client.ts`, `packages/devflare/src/bridge/server.ts`, and other bridge files
	- Silent `catch {}` remains the default failure mode in too many protocol paths
	- Canonicalize on one policy: either structured logging or structured protocol error frames

- `packages/devflare/src/bridge/proxy.ts`
	- `bridgeEnv`, the published `env` proxy, and test-context env fallbacks still create three overlapping ways to talk about the environment
	- Canonicalize the user-facing story around one documented entrypoint and treat the others as internal

## Browser shim inconsistencies

- `packages/devflare/src/browser-shim/binding-worker.ts` vs `packages/devflare/src/browser-shim/worker.ts`
	- Two worker implementations exist for the same feature, but only one reflects the active chunking protocol
	- Canonicalize on `binding-worker.ts` and remove or quarantine `worker.ts`

- `packages/devflare/src/browser-shim/server.ts`
	- The server presents itself as a localhost development helper, but until this pass it behaved like an unauthenticated localhost API with permissive CORS
	- The security posture and the docs must now both explicitly say it only accepts loopback-origin browser traffic and origin-less tool traffic

- `packages/devflare/src/browser-shim/handler.ts`
	- Before this pass it forwarded only two headers, which contradicted the idea of a transparent shim
	- The canonical behavior should now be full header forwarding minus hop-by-hop headers

## Config-system inconsistencies

- `packages/devflare/src/config/schema.ts` vs `packages/devflare/src/config/schema-env.ts`
	- The env schema is still a hand-maintained clone of the root schema instead of a derived subset
	- Canonicalize by deriving env config from the root schema

- `packages/devflare/src/config/resolve.ts` vs user expectations implied elsewhere
	- Environment overlays now replace arrays and deep-merge objects, which is much closer to the intended override story
	- Canonicalize that behavior in docs so users know arrays like `routes`, `migrations`, and `triggers.crons` replace rather than append

- `packages/devflare/src/config/compiler.ts` vs `packages/devflare/src/config/resource-resolution.ts` vs `packages/devflare/src/vite/plugin.ts`
	- Environment resolution, preview materialization, and resource resolution still happen through multiple slightly different paths
	- Canonicalize on one `resolve-for-environment-and-preview` flow shared across compile, Vite, and resource resolution

- `packages/devflare/src/config/ref.ts`
	- `scriptName` on Durable Object refs still means either file-local hosting or cross-worker hosting depending on where it came from
	- Canonicalize the normalized DO binding model with an explicit discriminant instead of overloaded field meaning

- `packages/devflare/src/config/ref.ts`
	- Types say uppercase access yields a DO ref, while runtime behavior still depends on naming heuristics and unresolved config state
	- Canonicalize either the type story or the runtime behavior, ideally by resolving against actual binding keys instead of regex

- `packages/devflare/src/config/schema-bindings.ts` vs `packages/devflare/src/config/schema-normalization.ts`
	- Some rules are enforced once in Zod and again later in normalization/materialization
	- Canonicalize validation in one layer and make later helpers assume validated input

## Vite, bundler, and worker-entry inconsistencies

- `packages/devflare/src/vite/plugin.ts` vs `packages/devflare/src/worker-entry/composed-worker.ts` vs `packages/devflare/src/bundler/do-bundler.ts`
	- Durable Object discovery is still implemented in multiple places with slightly different error handling and path rules
	- Canonicalize on one discovery helper

- `packages/devflare/src/vite/plugin.ts`
	- `getCloudflareConfig()` and `getDevflareConfigs()` still overlap, with one path looking like a legacy convenience wrapper
	- Canonicalize on one config-builder surface

- `packages/devflare/src/worker-entry/surface-paths.ts` vs `packages/devflare/src/transform/worker-entrypoint.ts` vs `packages/devflare/src/worker-entry/routes.ts`
	- Supported source extensions still differ by subsystem
	- Canonicalize on one shared source-extension list

- `packages/devflare/src/worker-entry/composed-worker.ts`
	- Returns a relative generated entry path while most other surface resolution helpers use absolute paths
	- Canonicalize path shape at the API boundary

- `packages/devflare/src/bundler/worker-bundler.ts` vs `packages/devflare/src/bundler/do-bundler.ts`
	- Bundle platform and tsconfig defaults still differ for two bundles targeting the same workerd runtime family
	- Canonicalize those bundler defaults

## Runtime inconsistencies

- `packages/devflare/src/runtime/middleware.ts`
	- Explicit symbol markers and parameter-name sniffing both try to identify handler shape
	- Canonicalize on explicit metadata or one documented signature style

- `packages/devflare/src/runtime/context.ts` vs `packages/devflare/src/runtime/validation.ts`
	- Two different context-access errors still represent almost the same problem
	- Canonicalize on one error type

- `packages/devflare/src/runtime/exports.ts` vs `packages/devflare/src/runtime/validation.ts`
	- Two proxy factories still implement nearly the same behavior with slightly different mutability rules
	- Canonicalize on one proxy builder

- `packages/devflare/src/runtime/index.ts`
	- The barrel still claims to be worker-safe while exporting Node-side helpers from `utils/send-email`
	- Canonicalize the barrel to truly worker-safe exports only

- `packages/devflare/src/router/types.ts` vs `packages/devflare/src/runtime/router.ts`
	- Runtime code lives under `runtime/`, router types live under `router/`
	- Canonicalize the folder layout so code and types live together

## Dev-server and testing inconsistencies

- `packages/devflare/src/dev-server/server.ts`
	- Still has two configuration shapes for Miniflare (`workers: [...]` vs single-worker fields), even though comments already acknowledge the footgun
	- Canonicalize on one shape

- `packages/devflare/src/dev-server/gateway-script.ts`
	- Still resets global WebSocket/stream maps when any bridge connection closes, which conflicts with the per-connection model used elsewhere
	- Canonicalize state ownership per connection

- `packages/devflare/src/dev-server/d1-migrations.ts`
	- Migration discovery is global, but D1 bindings are per database
	- Canonicalize the migration contract so migrations map to one DB or one explicit folder per DB

- `packages/devflare/src/test/simple-context.ts` vs `packages/devflare/src/test/bridge-context.ts`
	- The repo still exposes two overlapping context-creation APIs with different lifecycle and reset semantics
	- Canonicalize on one public test-context API

- `packages/devflare/src/test/utilities.ts` vs `packages/devflare/src/test/simple-context.ts`
	- The package supports both mock-only helpers and Miniflare-backed helpers, but the docs and runtime fidelity story strongly favor one side
	- Canonicalize whether mocks are first-class or legacy convenience helpers

## Package surface and documentation inconsistencies

- `packages/devflare/src/index.ts` vs `packages/devflare/README.md`
	- The main package barrel still exports bridge internals and test helpers that the README does not present as part of the main surface
	- Canonicalize the public API surface to match the docs

- `packages/devflare/src/env.ts` vs `packages/devflare/src/test/simple-context.ts`
	- `DevflareEnv` is declared in multiple places in the package
	- Canonicalize the global interface declaration to one file

- `packages/devflare/package.json`
	- JS output lives under `dist/src/**` while type output lives under `dist/**`
	- Canonicalize the build layout instead of asking consumers and tools to infer two parallel structures

- `packages/devflare/package.json` vs runtime imports
	- `miniflare` is still dynamically imported by runtime code but lives in `devDependencies`
	- Canonicalize dependency classification based on actual runtime use

- `packages/devflare/README.md`, `packages/devflare/LLM.md`, and `.docs/*`
	- The package still has multiple overlapping source-of-truth documents that drift independently
	- Canonicalize which doc is normative for API surface, which is generated, and which is internal-only

- `packages/devflare/src/cli/preview-bindings.ts`
	- The parser still distinguishes `'legacy'` and `'compact'` Wrangler table modes, which is effectively embedded compatibility handling for old/new text layouts
	- Canonicalize on one normalized parser input or switch to machine-readable output if Wrangler supports it

- `packages/devflare/src/cloudflare/kv-namespace.ts`
	- Pagination behavior is now canonicalized, so other Cloudflare resource lookups should match that same 'search all pages before create' rule instead of reintroducing first-page-only assumptions elsewhere

- `packages/devflare/src/cloudflare/preview-registry-records.ts`
	- Preview URL formatting is now canonicalized in a neutral helper, which is the pattern the rest of the Cloudflare/CLI overlap should follow

- `packages/devflare/src/cloudflare/api.ts`
	- Auth retry state is now request-local, so other Cloudflare helpers should avoid module-global transient request bookkeeping as well
	- Canonicalize per-request state inside request functions, not at module scope

## Practical next canonicalization targets

1. Make one bridge gateway implementation the source of truth
2. Replace duplicated config/env merge logic with one explicit resolution pipeline
3. Collapse duplicate test-context and env-hint extractors into one helper
4. Trim the main package barrel to match the documented API
5. Remove stale internal docs and legacy-looking browser-shim worker paths
