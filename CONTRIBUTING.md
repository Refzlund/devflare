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
- [Cloudflare Support Matrix](./docs/CLOUDFLARE_SUPPORT_MATRIX.md) — which
  Cloudflare resources and Worker surfaces are supported, and at what level.
- [Deploy, Preview & Secrets](./docs/DEPLOY_AND_SECRETS.md) — the deploy/preview
  lifecycle and how secrets are handled.

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

### Before the stable `1.0.0` cut

Run the package-distribution linters against a fresh build and resolve (or
deliberately document) anything they flag, then consider gating them in CI:

```bash
bun run --cwd packages/devflare build
cd packages/devflare && bunx publint && bunx @arethetypeswrong/cli --pack
```

`publint` validates the `exports`/`types`/`files` manifest, and
`@arethetypeswrong/cli` checks every entrypoint resolves its `.d.ts` correctly
under each module-resolution mode (including the `browser` condition, which has
no separate `types` condition). These need a correct build, so run them in an
environment whose Bun version matches CI (the `--splitting` output is
Bun-patch-version-sensitive).

## Local checks

Before pushing, run the package checks:

```bash
bun run devflare:typecheck
bun run devflare:test
```

`devflare:ci` lints the published package first (`lint:devflare` = `biome check
packages/devflare`, fail-fast) before building, typechecking, and testing. Run
the linter on its own with `bun run lint:devflare`; auto-fix safe issues with
`bun run lint:fix`. (Whole-repo lint of `cases/**` and `apps/**` is available via
`bun run lint:root` but is not gated in CI — those are unshipped.)

The docs/README/`LLM.md` are guarded together — if you change the docs model,
regenerate the package handbook and run the integrity suite:

```bash
bun run --cwd packages/devflare llm:generate
bun run devflare:docs-integrity
```

## Testing

The package test lanes (`packages/devflare/package.json`):

- `bun run --cwd packages/devflare test:unit` — fast unit tests (`tests/unit`),
  fully parallel. This is the lane the publish workflow gates on.
- `bun run --cwd packages/devflare test:coverage` — the unit lane with coverage
  measurement (`bun test tests/unit --coverage`). This is **unit-only** measurement
  with no threshold gate: it excludes the integration lanes, so source exercised
  only by integration tests (e.g. `dev-server/server.ts`, `src/vite/*`) reports as
  near-uncovered. Read the number as unit coverage, not total coverage.
- `bun run --cwd packages/devflare test` — the full suite (unit + every
  integration lane).

**Why the integration suites run serially.** The integration lanes
(`test:integration:bridge`, `:test-context`, `:dev-server`) run with
`--parallel=1 --max-concurrency=1` because they bind real OS ports and start
Miniflare/workerd processes; running them concurrently races on port allocation
and shared workerd runtime state. The bridge lane goes further and runs each file
as its own `bun test … --parallel=1` invocation (a separate process per file) to
fully isolate the gateway/bridge transport state. Unit tests have no such
constraint and run fully parallel.
