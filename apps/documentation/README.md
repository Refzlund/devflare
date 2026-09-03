# Documentation app

This app is the repo's real-world Devflare-backed SvelteKit example.

It intentionally demonstrates that:

- `devflare.config.ts` is the authored source of truth
- Wrangler config is generated under `.devflare/` and `.wrangler/deploy/`
- SvelteKit can compose `devflare/sveltekit` with existing hooks
- `devflare dev`, `devflare build`, `devflare deploy`, and `devflare deploy --preview` are the primary flows
- `.github/workflows/preview.yml` handles documentation and testing preview deploys, branch/PR feedback, and cleanup flows from one shared workflow
- branch pushes can prepare the workspace once and then refresh both the branch preview target and the matching PR preview target when the branch already belongs to an open pull request
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

## Documentation contribution contract

- Author long-form docs in `apps/documentation/src/lib/docs/content*.ts`; do not patch generated `LLM.md` by hand.
- Start feature pages with a copyable recipe: file path, command, expected result, and the next page to read.
- Prefer many small examples over broad prose. Multi-file examples should name every file in the snippet metadata.
- When public exports, config schema keys, CLI commands, binding support, or test helpers change, update the matching docs and run `bun run devflare:docs-integrity` from the repo root.
- Regenerate the handbook with `bun run --cwd packages/devflare llm:generate` when the docs model changes.

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
bun run deploy -- --preview feature-search
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
