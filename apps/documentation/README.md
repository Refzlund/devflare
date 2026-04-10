# Documentation app

This app is the repo's real-world Devflare-backed SvelteKit example.

It intentionally demonstrates that:

- `devflare.config.ts` is the authored source of truth
- Wrangler config is generated under `.devflare/` and `.wrangler/deploy/`
- SvelteKit can compose `devflare/sveltekit` with existing hooks
- `devflare dev`, `devflare build`, `devflare deploy`, and `devflare deploy --preview` are the primary flows
- `.github/workflows/documentation-preview.yml` is the PR preview workflow that updates one stable PR comment and retires preview metadata on PR close
- `.github/workflows/documentation-production.yml` is the production-on-`next` workflow that publishes a GitHub deployment status with the production URL

## Scripts

```sh
bun run types
bun run dev
bun run build
bun run deploy
bun run deploy:preview
bun run check
```

## Notes

- Do not add a hand-maintained `wrangler.jsonc` next to `devflare.config.ts`
- Devflare generates Wrangler config for this app under `.devflare/` and writes Wrangler's deploy redirect under `.wrangler/deploy/config.json`
- `preview_urls: true` and `workers_dev: true` are enabled so preview uploads can surface usable preview links for this app
- The app keeps Paraglide middleware and composes the Devflare SvelteKit handle ahead of it
- If you want branch-only or combined branch + PR GitHub feedback, use `.github/actions/devflare-github-feedback` with `mode: deployment` or `mode: both` in a branch-scoped workflow rather than trying to invent a branch-comment surface that GitHub does not actually have
