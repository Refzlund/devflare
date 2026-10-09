---
'devflare': patch
---

Fix `devflare workspace dev` crashing at startup for any app that owns a Durable Object.

The workspace coordinator namespaces every co-hosted worker as
`${appName}/${workerName}` to keep two apps' `gateway`/main/DO workers distinct in
the one shared instance. workerd tolerates `/` in plain service/worker names, but
a Durable Object whose host-worker (script) name contains `/` makes the runtime
abort at `miniflare.ready` with an uncatchable `*** std::terminate() called with
no exception` — so a workspace containing any DO app (very common: a SvelteKit +
Worker monorepo whose Worker owns a DO) never booted.

The namespace separator is now `-` (the canonical Cloudflare worker-name
character, safe in every workerd context — service names, DO script names, DO
uniqueKeys, and the persist paths derived from them). Because worker/app names are
charset-unrestricted, a new guard in the merge turns the (now theoretically
possible) rare name collision into a loud, actionable error instead of a silently
half-wired instance. Added unit coverage (no `/` in any namespaced name; the
collision guard) and an integration test that boots a DO-owning app in a workspace
and calls the DO through its direct socket.
