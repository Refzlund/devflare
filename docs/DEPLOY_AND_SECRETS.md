# Deploy, Preview & Secrets

This page is the production reference for what `devflare deploy` does to your
Cloudflare account: **which resources it auto-provisions**, what happens when a
deploy fails part-way through, how `--dry-run` describes a deploy without
touching anything, how preview/branch deploys are scoped and cleaned up, and
where the **secrets boundary** sits (Devflare manages local-dev secret values
and remote binding wiring; it never transmits secret values to Cloudflare).

For the per-binding local/remote support split see
[CLOUDFLARE_SUPPORT_MATRIX.md](./CLOUDFLARE_SUPPORT_MATRIX.md). For the public
API surface see [API_STABILITY.md](./API_STABILITY.md).

## Auto-provisioning matrix

When you run `devflare deploy`, every binding that references a Cloudflare
resource **by name** (rather than by an explicit id) is resolved against your
account. Devflare treats each resource type as one of three classes:

| Resource type | On `devflare deploy` | Notes |
| --- | --- | --- |
| **KV namespace** | **Auto-create** if missing | Created from the binding name. |
| **D1 database** | **Auto-create** if missing | Created from the binding name. |
| **R2 bucket** | **Auto-create** if missing | Created from the binding name. |
| **Queue** | **Auto-create** if missing | Created from the binding name. |
| **Hyperdrive config** | **Resolve-only** | Must already exist, or the deploy fails. |
| **Vectorize index** | **Resolve-only** (normal deploy) | Must already exist for a non-preview deploy. Auto-provisioned **only** in preview, by cloning a base index (see [Preview & branch deploys](#preview--branch-deploys)). |
| **Workers Analytics Engine dataset** | **Reference-only** | Created by Cloudflare on first write; Devflare never provisions or deletes it. |
| **Browser Rendering binding** | **Reference-only** | Owns no account-scoped resource; Devflare never provisions or deletes it. |

The three classes mean:

- **Auto-create** — if a name-binding does not resolve to an existing resource,
  Devflare creates it during the deploy.
- **Resolve-only** — the resource must already exist. If it does not, the deploy
  **fails before any other resource is created**, with a message explaining how
  to create it (or how to bind it by explicit id).
- **Reference-only** — Devflare neither lists, creates, nor deletes the
  resource; the binding is wired into the compiled config and the resource is
  managed entirely by Cloudflare.

**Why Hyperdrive and Vectorize are resolve-only.** Cloudflare does not expose a
create API that Devflare can drive from only a binding name. For Hyperdrive
there is no way to materialize a config (it needs connection credentials Devflare
does not have); create the Hyperdrive config first, or bind it with an explicit
id. For Vectorize, a normal deploy cannot infer an index's dimensions/metric, so
the index must exist first; the one exception is a preview deploy, which clones
an existing **base** index.

### Resolution order is deliberate

The resolve-only types are checked **first**, before any auto-create runs. The
resolution order is:

```
Hyperdrive → Vectorize → KV → D1 → R2 → Queues
```

So a "create the index/config first" failure happens **before** any
side-effecting creation — you never end up with a freshly created KV namespace
left behind because a missing Hyperdrive config aborted the deploy later.

### Things to know before your first deploy

- **KV / D1 / R2 / Queues are created silently, with no confirmation prompt.** A
  typo in a name-binding will create a *real* account resource (and may bill)
  the moment you run `devflare deploy`. Double-check binding names, or bind by
  explicit id where you want strict resolve-only behaviour.
- **Vectorize is asymmetric.** It is resolve-only (a hard error if missing) on a
  normal/production deploy, but auto-provisioned in preview by cloning a base
  index. Create the production index out-of-band.
- **Hyperdrive is never auto-created anywhere.** Previews additionally require an
  explicit opt-in (see [Preview & branch deploys](#preview--branch-deploys)).
- **Match the provisioning account to the deploy account.** Devflare honours
  `CLOUDFLARE_ACCOUNT_ID` for resource lookup/creation so that the account it
  provisions in is the same account the deploy targets. Without it, a CI job
  could auto-create resources in your personal "primary" account while the
  deploy goes to the account named by the env var — leaving cross-account
  orphans. Set `CLOUDFLARE_ACCOUNT_ID` in CI.

## Partial-deploy failures and orphaned resources

**Devflare does not auto-delete resources it created if a later step fails.**
This is by design.

If provisioning creates a KV namespace and then a later step (say a D1 create,
or any other preparation) throws, the KV namespace stays in your account. The
error you see is wrapped with a footer that lists exactly what was left behind:

```
Deploy preparation failed AFTER provisioning the following Cloudflare resources, which were left in your account:
  - KV: <names>
  - D1: <names>
  - Hyperdrive: <names>
  - R2: <names>
  - Queues: <names>
  - Vectorize: <names>
Re-run `devflare deploy` after fixing the error to reuse them, or delete them manually if abandoning the deploy.
```

Only the non-empty categories are listed. The original error is preserved as the
error's `cause`, so nothing is hidden.

**Why no auto-delete:** deletion is irreversible and has cross-binding side
effects — a database may already hold data, a queue may have in-flight messages,
and Cloudflare resource deletion is asynchronous and partial. A deploy is usually
fixed and retried rather than abandoned, so the safe default is to make the
orphans **loud** rather than to delete them.

**Recovering is safe and idempotent.** Re-running `devflare deploy` after fixing
the underlying error finds each already-created resource on the next list call
and counts it as *existing* (reused) rather than creating it again. So:

- To continue: fix the error and re-run `devflare deploy` — the orphans are
  picked back up.
- To abandon: delete the listed resources manually from the Cloudflare dashboard.

(The footer lists categories in a fixed cosmetic order that differs from the
run order; that ordering carries no meaning.)

## Dry-run / describe-only

`devflare deploy --dry-run` describes a deploy **without performing it** and
always exits `0`. In dry-run:

- The Cloudflare create APIs are **stubbed**, so nothing is created. Resolution
  of *existing* resources still happens for real.
- Resources that *would* be created are given placeholder ids of the form
  `` <would-create:NAME> `` in the resolved view.
- The output includes the deployment-strategy summary, the built wrangler
  config, a "Resolved view (would-create placeholders for missing resources)"
  compiled config, and a `Would create:` list.

The resolved view is **best-effort**: if there are no Cloudflare credentials or
the account is unreachable, Devflare falls back to the build-config view and
prints `(resolved view unavailable: <message>)`. The dry run still exits `0`.

> **Gotcha:** the `Would create:` list enumerates only KV, D1, R2 and Queue —
> the auto-create types. Vectorize and Hyperdrive are resolve-only and can never
> appear in that list, so a dry-run "Would create" is **not** a complete picture
> of every resource that must exist. Confirm any Hyperdrive config and any
> production Vectorize index exist separately.

## Gradual / percentage deployments

`devflare deploy --prod --percentage <n>` performs a Cloudflare **gradual
deployment** (a canary rollout) instead of shipping the new code to 100% of
traffic at once. It is production-only and is rejected if combined with
`--preview`.

It is expressed faithfully on Wrangler's version-based rollout model — Devflare
does not invent any traffic-splitting of its own:

1. **`wrangler versions upload`** uploads the new code as an **inactive** Worker
   version. No production traffic is shifted yet. (A normal `wrangler deploy` has
   no percentage flag and would immediately serve the new version to everyone.)
2. Devflare resolves the new version id, then runs
   **`wrangler versions deploy <new-version-id>@<n> --name <worker> --yes`** to
   route **n%** of production traffic to the new version. `--yes` accepts
   Wrangler's non-interactive defaults so the rollout works in CI.

```
devflare deploy --prod --percentage 10
```

routes 10% of traffic to the freshly uploaded version and leaves the rest on the
currently-live version. Pass `--version <current-version-id>` to pin which live
version keeps the remaining `100 − n%` (Devflare then emits the fully-specified
split `<new>@<n> <current>@<rest>`); otherwise Wrangler distributes the
remainder itself.

- A deploy message (`--message`) is forwarded to `wrangler versions deploy`.
- `--dry-run` describes the rollout (the percentage and which version keeps the
  rest) without uploading or shifting any traffic.
- If the upload succeeds but Devflare cannot resolve the new version id, or
  `wrangler versions deploy` fails, the command **fails loudly** and tells you
  the version was uploaded so you can retry or finish the split manually — it
  never reports a rollout that did not happen.

**What this covers vs. raw Wrangler.** `--percentage` covers *initiating* a
rollout at a chosen percentage in one command (including a two-version split).
**Advancing** an existing rollout (e.g. `10% → 50% → 100%`) without uploading new
code is a pure `wrangler versions deploy <version-id>@<percentage>` call — run
that directly, because re-running `devflare deploy --percentage` uploads a fresh
version each time.

## Streaming live logs (`devflare tail`)

`devflare tail [worker]` streams live request logs and exceptions from a Worker
that is **already deployed** to Cloudflare, via Cloudflare's Workers Trace (tail)
API. It is inherently a remote, operate-deployed-Worker command — there is no
local emulation of deployed traffic (use `devflare dev` and the
`cf.tail.trigger()` test helper for local/offline tail-*handler* testing).

```
devflare tail                  # tail the Worker named in the current config
devflare tail my-worker        # tail an explicitly named Worker
devflare tail --format json    # raw JSON trace events for piping
```

It requires Cloudflare authentication (`devflare login` or
`CLOUDFLARE_API_TOKEN`) and a resolvable account id (`--account`, config
`accountId`, or `CLOUDFLARE_ACCOUNT_ID`). It mints a short-lived tail session,
connects over a WebSocket, prints each event (timestamp, trigger, outcome, logs,
exceptions) in `--format pretty` (default) or `--format json`, and deletes the
tail session + closes the socket on Ctrl-C.

## Preview & branch deploys

When the deploy environment is `preview`, Devflare runs a **two-stage** pipeline:
preview-scoped resources are prepared first, then their resolved config feeds the
normal deploy-resource preparation above.

### What gets preview-scoped, and how it is named

A binding value is preview-scoped only if it was authored with `preview.scope(...)`.
The preview name is derived from the base name and a preview **identifier**:

```
previewIdentifier ? `${baseName}${separator}${identifier}` : baseName
```

The default separator is `-`. The identifier is resolved in priority order:

1. an explicit `identifier` option,
2. `DEVFLARE_PREVIEW_IDENTIFIER`,
3. `DEVFLARE_PREVIEW_PR` (becomes `pr-<n>`),
4. `DEVFLARE_PREVIEW_BRANCH`,
5. otherwise, when the environment is `preview`, the literal `preview`.

The identifier is normalized: lowercased, any character outside `[a-z0-9-]`
becomes `-`, runs are collapsed and trimmed; an empty result becomes `preview`,
and an identifier that does not start with a letter is prefixed `b-`.

So a KV base `my-kv` on branch `feature/x` becomes `my-kv-feature-x`; on PR 42 it
becomes `my-kv-pr-42`.

### Preview provisioning by type

| Type | Preview deploy behaviour |
| --- | --- |
| KV | Auto-create the preview-named namespace if missing. |
| D1 | Auto-create the preview-named database if missing. |
| R2 | Auto-create the preview-named bucket if missing. |
| Queues | Auto-create the preview-named queue if missing. |
| **Vectorize** | Auto-create the preview index by **cloning the base index** (copies dimensions, metric, description). **Throws** if the base index is not found. This is the only place Vectorize is auto-provisioned. |
| **Hyperdrive** | **Not auto-provisioned.** A pre-existing preview-named config is reused; otherwise the binding must opt into `previewFallback: 'base'` (or set an explicit `previewId`), or the deploy **hard-errors**. When the base fallback is used, a warning is emitted and the binding collapses to the base config. |
| Analytics Engine | Reference-only; a warning is emitted. |
| Browser Rendering | Reference-only; a warning is emitted. |

> **Hyperdrive preview rule:** because Cloudflare does not expose stored
> Hyperdrive credentials, Devflare cannot clone a base config into a preview one.
> A preview Hyperdrive binding with no dedicated preview config therefore
> **hard-errors** unless it opts into `previewFallback: 'base'` or sets an
> explicit `previewId`.

### Deploy-time logging

A deploy logs what it provisioned versus reused, for both stages:

- `Provisioned preview-scoped resources: <summary>` / `Reused preview-scoped resources: <summary>`
- `Provisioned deploy resources: <summary>` / `Reused deploy resources: <summary>`

Warnings from both stages are surfaced through the logger.

### Cleaning up previews

`devflare previews cleanup` removes preview-scoped resources.

- **Dry-run by default.** It deletes nothing unless you pass `--apply`. The
  default run reports the candidate count.
- **Scope selection:** `--scope <name>` targets a single preview scope, `--all`
  targets every discovered preview scope; the two are mutually exclusive.
- **With `--apply`**, Workers are deleted first in dependency order, then the
  scoped KV / D1 / R2 / Queue / Vectorize / Hyperdrive resources.
- It only deletes preview-named resources that **actually exist** — it lists,
  matches by preview name, and deletes the matches. **Base (production)
  resources are never touched** — by construction, only preview-suffixed names
  matched against the plan are eligible.
- R2 and Vectorize are deleted by name; KV, D1, Queue and Hyperdrive by id. If Cloudflare
  returns no queue id, that queue deletion is skipped with a warning. A
  Hyperdrive cleanup warning is always emitted when the plan contains a
  Hyperdrive binding (cleanup only deletes existing preview configs; it never
  provisions).

## Secrets

### The boundary: `devflare secrets` is local-only

**`devflare secrets` manages local-dev secret values only. There is no remote
secret-push path anywhere in Devflare.**

- Every `devflare secrets` operation (write, `--list`, `--delete`) requires the
  `--local` flag. Without it the command prints `Local Secrets Store commands
  require --local.` and exits `1`; there is no non-`--local` branch.
- The values are stored in `.devflare/secrets.local.json` (written with mode
  `0o600`). Command output prints `storeId`/`name` references only — it never
  echoes secret values.
- The local values are injected into Miniflare for `devflare dev`, so the same
  binding names resolve offline.

Devflare deliberately does **not** transmit secret values to Cloudflare. The
compiler emits Secrets Store **binding references** into the wrangler config —
these carry `store_id` and `secret_name` only, never a value.

### Remote secrets workflow

Because Devflare does not manage remote secret material, populate the Cloudflare
Secrets Store out-of-band:

1. Create the store and its secret values using the Cloudflare dashboard or the
   official Wrangler Secrets-Store / secret commands.
2. Reference them from `bindings.secretsStore` by `storeId` + `secretName` (or
   by the shorthand string form plus a top-level `secretsStoreId`).
3. Use `devflare secrets --local` to mirror the same values into
   `.devflare/secrets.local.json` so `devflare dev` resolves the same binding
   names offline.

The `secrets:` config field is a **manifest of expected secret names**
(`{ required: boolean }`), not a store of values — it is a declaration /
validation aid, compiled into a `{ required: [...] }` list.

The boundary in one line: **Devflare owns local-dev secret values and remote
binding wiring; it never sends secret values to Cloudflare.**

After a successful **production** deploy, `devflare deploy` prints a one-line
reminder of this boundary — that production runtime secret *values* are set with
`wrangler secret put` or the Cloudflare dashboard, while Devflare emits Secrets
Store references only. The same pointer is shown in `devflare secrets --help`.

### Per-environment secret scoping

Environment overrides are a **deep merge** over the root config, so secret-store
scoping behaves the way Wrangler users expect:

- `secretsStoreId` is a root-level string. An environment that sets its own
  `secretsStoreId` overrides the root; an environment that omits it inherits the
  root value. (This is the intended inheritance, not a "all environments share
  one store" bug.)
- `bindings.secretsStore` is deep-merged per binding key, so an environment can
  add or replace individual secret-store bindings while inheriting the rest.
- Shorthand validation is env-aware: a shorthand secrets-store binding in an
  environment that has neither an env-level nor a root-level `secretsStoreId` is
  flagged at parse time.

> **Sharp edge to know:** a shorthand secret-store binding resolves against the
> **merged** `secretsStoreId`. If environment A and environment B both use
> shorthand and neither overrides `secretsStoreId`, both resolve to the **same**
> root store — by design, but the resolved store id is implicit. To point an
> environment at a *different* store, set `env.<name>.secretsStoreId`, or use the
> explicit `{ storeId, secretName }` object form per binding.

## Permission groups (token minting)

`devflare tokens --new` mints a reusable Devflare Cloudflare API token. To do
that it must select the right Cloudflare **permission groups**.

### How groups are selected at mint time

Token minting selects permission groups by **scope plus a name-prefix
allowlist** (for example, groups whose display name starts with `Workers `,
`D1 `, or `R2 `), filtered to reusable account/zone scopes. This is the live
selection path and it does not depend on the symbolic-id table below.

### The symbolic-id table and its fallback

Separately, Devflare keeps a small symbolic-name → permission-group-id table in
`src/cloudflare/known-permission-group-ids.generated.ts`, with a helper
(`matchesKnownPermissionGroup`) that matches a group by its **verified id** when
one is configured and falls back to an **exact display-name** match otherwise.

This generated table is **currently empty** — every entry is unverified
(`null`) — so the helper takes its display-name fallback path. The fallback is
graceful: it matches on the canonical display name (exact match only, so drift
is caught rather than silently mis-matched) and emits a `console.warn` each time
it falls back, pointing maintainers at the refresh step below.

In practice this table is a **maintainer convenience / future-proofing surface**
(and the safety net behind `matchesKnownPermissionGroup`). It is consumed by the
maintainer refresh script and the unit tests — **not** by the `devflare tokens
--new` mint path — so the empty table does not affect token minting, which uses
scope + name-prefix selection.

### Maintainer: refreshing the verified ids

A maintainer with a Cloudflare token can resolve and pin the verified ids:

```
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… bun run --cwd packages/devflare refresh-permission-groups
```

Both environment variables are required. The script supports `--dry-run`,
`--keep-existing`, and `--output <path>`, plus a `DEVFLARE_PERMISSION_GROUP_DRY_RUN=1`
env for CI drift checks. It never discards a verified id — a group it cannot
resolve stays `null` (or keeps its previous value with `--keep-existing`) and is
reported under a `Still unverified` warning.
