# Documentation app

This app is the repo's real-world Devflare-backed SvelteKit example.

It intentionally demonstrates that:

- `devflare.config.ts` is the authored source of truth
- Wrangler config is generated under `.devflare/` and `.wrangler/deploy/`
- SvelteKit can compose `devflare/sveltekit` with existing hooks
- `devflare dev`, `devflare build`, `devflare deploy`, and `devflare deploy --preview` are the primary flows
- `.github/workflows/documentation-preview-branch.yml` publishes branch-scoped preview aliases on push for non-default branches
- `.github/workflows/documentation-preview-branch-cleanup.yml` retires tracked branch preview metadata and marks matching GitHub deployments inactive when a branch is deleted
- `.github/workflows/documentation-preview-pr.yml` is the PR preview workflow that updates one stable PR comment and retires preview metadata on PR close
- `.github/workflows/documentation-production.yml` is the production-on-default-branch workflow that publishes a GitHub deployment status with the production URL

## Scripts

```sh
bun run types
bun run dev
bun run build
bun run deploy
bun run deploy:preview
bun run check
```

## Monorepo + Turborepo workflow

This app lives inside the repository's Bun + Turborepo workspace, so there are two layers to keep straight:

- the repo root uses Turbo to orchestrate validation, caching, and impacted-package work
- this package still owns the actual `devflare` config and deployment commands through `apps/documentation/devflare.config.ts`

That means Turbo is the right tool for workspace-wide validation such as:

- `bun run devflare:build`
- `bun run devflare:check`
- `bun run devflare:ci`
- `bun run turbo build --filter=documentation`
- `bun run turbo check --filter=documentation`

But the actual deploy should still run from the package that owns the app:

```sh
# from the repo root
bun run turbo build --filter=documentation
bun run turbo check --filter=documentation

# from apps/documentation
bun run deploy -- --preview --branch-name feature-search
bun run deploy -- --prod
```

In GitHub Actions, keep the same split:

- use Turbo or path-aware workflow conditions to decide whether the docs app needs work
- run the deploy step with `working-directory: apps/documentation` (or equivalent) so `devflare` resolves this package's local config on purpose

## Notes

- Do not add a hand-maintained `wrangler.jsonc` next to `devflare.config.ts`
- Devflare generates Wrangler config for this app under `.devflare/` and writes Wrangler's deploy redirect under `.wrangler/deploy/config.json`
- `preview_urls: true` and `workers_dev: true` are enabled so preview uploads can surface usable preview links for this app
- The app keeps Paraglide middleware and composes the Devflare SvelteKit handle ahead of it
- If you want branch-only or combined branch + PR GitHub feedback, use `.github/actions/devflare-github-feedback` with `mode: deployment` or `mode: both` in a branch-scoped workflow rather than trying to invent a branch-comment surface that GitHub does not actually have
