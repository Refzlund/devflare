# Contributing

This repo is a Bun workspace monorepo. The published package is
[`packages/devflare`](./packages/devflare). The docs site lives in
[`apps/documentation`](./apps/documentation) and is the authored long-form
source of truth; the package `LLM.md` is generated from it.

## Policy docs

- [API Stability Policy](./docs/API_STABILITY.md) — the frozen public entrypoint
  surface and the semver guarantee on it.
- [Versioning & Release Policy](./docs/VERSIONING_AND_RELEASE.md) — semver, the
  prerelease lane, and the `next → 1.0` exit.

## Releasing with changesets

Releases are driven by [changesets](https://github.com/changesets/changesets) in
**pre mode** on the `next` branch. The full mechanics are in
[docs/VERSIONING_AND_RELEASE.md](./docs/VERSIONING_AND_RELEASE.md); the
day-to-day workflow is:

1. **Add a changeset** for any user-visible change to `devflare`:

   ```bash
   bunx changeset
   ```

   Pick the bump level (semver) and write a short, user-facing summary. This
   writes a `.changeset/<name>.md` file — commit it with your change.

   The bump level: **patch** for backward-compatible fixes, **minor** for
   backward-compatible additions, **major** for breaking changes. While on the
   `next` prerelease lane every change is published as a new `1.0.0-next.X`
   regardless, but the declared level still determines the eventual stable
   version, so set it correctly.

2. **Push to `next`.** A push carrying a pending (unconsumed) changeset triggers
   [`.github/workflows/publish.yml`](./.github/workflows/publish.yml), which
   versions, commits the bump back to `next`, and publishes the prerelease to
   npm under the `next` dist-tag via OIDC trusted publishing. There is no
   release PR.

   In pre mode, consumed changeset `.md` files stay on disk and are tracked in
   `.changeset/pre.json`; only unconsumed `.md` files trigger a release. Do not
   delete consumed changeset files.

3. **Pull** the bot's `chore(release): version packages` commit before
   continuing work on `next`.

## Local checks

Before pushing, run the package checks:

```bash
bun run devflare:typecheck
bun run devflare:test
```

The docs/README/`LLM.md` are guarded together — if you change the docs model,
regenerate the package handbook and run the integrity suite:

```bash
bun run --cwd packages/devflare llm:generate
bun run devflare:docs-integrity
```
