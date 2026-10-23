---
'devflare': minor
---

Add `devflare workspace dev` — run several apps in ONE Miniflare with live-shared bindings.

Two apps that bind the same D1/KV/R2/Durable Object id share one managed resource
in production, but under per-app `devflare dev` each app gets its own Miniflare
(its own `workerd` process), so a write by one is invisible to the other — and a
shared persist dir cannot fix it (each process keeps its own storage snapshot and
they contend for the SQLite file). Sharing **live** state requires co-hosting the
workers in a single instance.

`devflare workspace dev` does exactly that. It reads a new opt-in
`devflare.workspace.ts` manifest, prepares each app with the same pipeline
`devflare dev` uses, and merges their `buildMiniflareDevConfig` worker sets into
**one** Miniflare instance. Workers that bind the same id then resolve to one live
store (Miniflare dedupes storage services by binding id). Each app keeps its own
browser origin via a per-app Miniflare direct socket (`unsafeDirectSockets`), so
the cross-origin split (e.g. `ui.localhost` ↔ `api.ui.localhost`) is preserved;
Vite apps are spawned as children pointed at the shared instance's bridge.

```ts
// devflare.workspace.ts
import { defineWorkspace } from 'devflare'

export default defineWorkspace({
	apps: [
		{ config: './apps/api/devflare.config.ts', port: 8789, env: { DOC_API_DEV_SEED: '1' } },
		{ config: './apps/web/devflare.config.ts', vite: true, vitePort: 5173, bridgePort: 8788 }
	],
	shared: { d1: ['PLATFORM_DB'], r2: ['MEDIA'] }
})
```

```bash
devflare workspace dev            # one Miniflare, all apps, shared bindings
devflare workspace dev --no-persist
```

New public API: `defineWorkspace()` (plus `WorkspaceManifest`/`WorkspaceManifestInput`/`WorkspaceApp`
types). D1 migrations run once per app against the shared store (the migration
ledger dedupes shared files); an optional `shared` block asserts the intended
binding ids match across apps and errors loudly if they don't.

This is strictly additive: the per-app `devflare dev` path is byte-for-byte
unchanged, and `DEVFLARE_PERSIST_DIR` remains file-colocation only. Worker/DO hot
reload inside the shared instance is not wired yet (restart to pick up worker
source changes); Vite children keep their own HMR.
