# Versioning & Release Policy

`devflare` is versioned with [semantic versioning](https://semver.org/) and
released through [changesets](https://github.com/changesets/changesets).

This page documents the version scheme, the current prerelease lane, how a
changeset drives each release, and the deliberate steps to promote the package
to a stable `1.0.0`. For the scope of the semver guarantee, see
[API_STABILITY.md](./API_STABILITY.md). For the contributor-facing workflow of
authoring a changeset, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Semver

Once `1.0.0` ships:

- **major** — a breaking change to a frozen public entrypoint (see
  [API_STABILITY.md](./API_STABILITY.md)).
- **minor** — backward-compatible additions (new exports, new optional config,
  widened inputs). Deprecations are introduced here.
- **patch** — backward-compatible bug fixes.

## The prerelease lane (`next`)

The package is currently published on a prerelease lane:

- Versions are `1.0.0-next.X` (e.g. `1.0.0-next.28`).
- They are published to npm under the **`next`** dist-tag, so
  `npm install devflare` keeps installing the stable `latest` once it exists,
  while `npm install devflare@next` opts into the prerelease.
- Changesets runs in **pre mode** with tag `next` — see `.changeset/pre.json`
  (`mode: "pre"`, `tag: "next"`). The base branch is `next` (`.changeset/config.json`
  `baseBranch: "next"`).

There is **no release PR**. Every push to the `next` branch that carries a
pending (unconsumed) changeset publishes a new prerelease immediately.

## How a changeset drives each release

1. A change is accompanied by a changeset file in `.changeset/*.md` whose front
   matter declares the bump level, e.g.:

   ```md
   ---
   "devflare": minor
   ---

   Human-readable summary of the change.
   ```

2. The change is pushed to the `next` branch.

3. [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) runs on
   that push (or on manual `workflow_dispatch`). It:
   - **Detects pending changesets.** In pre mode, consumed changeset `.md`
     files persist on disk and are listed in `.changeset/pre.json` under
     `changesets`. The workflow counts only the `.md` files that are *not* in
     that list — those are the unconsumed, pending ones.
   - If there is at least one pending changeset, runs `changeset version`, which
     bumps `package.json`, appends to
     [`packages/devflare/CHANGELOG.md`](../packages/devflare/CHANGELOG.md), and
     records the now-consumed changeset(s) in `pre.json`.
   - Commits the bump back to `next` as `chore(release): version packages [skip ci]`.
   - Builds `devflare` and runs `changeset publish` to npm via **OIDC trusted
     publishing** (no NPM token; npm ≥ 11.5.1; `id-token: write`).
   - Pushes the git tags.

In pre mode `changeset publish` always uses the pre tag (`next`) as the npm
dist-tag and rejects an explicit `--tag`, so the workflow does not pass one.
The publish step is idempotent (it only publishes versions not already on npm),
so a manual re-run recovers a bump that committed but failed to publish.

## CHANGELOG

[`packages/devflare/CHANGELOG.md`](../packages/devflare/CHANGELOG.md) is present
and is maintained automatically: `changeset version` appends each release's
entry from the consumed changeset summaries. Do not hand-edit it.

## Promoting to `1.0.0`

Exiting the prerelease lane is a deliberate, manual maintainer step:

1. `bunx changeset pre exit` — leaves pre mode (updates `.changeset/pre.json`).
2. `bunx changeset version` — consumes any remaining changesets and computes the
   stable version, producing `1.0.0`.
3. Commit, then publish. With pre mode exited, `changeset publish` publishes to
   the **`latest`** dist-tag (the no-`--tag` behavior in `publish.yml` now
   targets `latest` instead of `next`), so this must be done intentionally.

After `1.0.0` ships, the [API stability guarantee](./API_STABILITY.md) is in
force: removing a `@deprecated` public symbol then requires a major bump.

## Deprecation & removal

- Pre-1.0 (the `next` lane): a `@deprecated` alias may be removed in a
  minor/prerelease bump. Flag the removal in its changeset as a breaking
  removal.
- Post-1.0: a deprecated public symbol is only removed in a major bump.

The removal of the `@deprecated ContextUnavailableError` alias (folded into the
canonical `ContextAccessError`) is the worked pre-1.0 example: it is a breaking
removal for any code that imported the deprecated name, and is flagged as such
in its changeset.
