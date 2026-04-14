# Devflare Monorepo

This repository contains the core `devflare` package, the documentation app, and the example cases that exercise the framework from a few different angles.

## Workspace layout

- `packages/devflare` — the main package and CLI
- `apps/documentation` — the docs app and the primary SvelteKit/Vite consumer in CI
- `cases/*` — focused examples and regression cases for specific features

## Turborepo workflow

The clean contributor workflow for the core `devflare` package now lives behind explicit Turbo-backed scripts at the repo root:

- `bun run devflare:dev` — run the package in watch mode
- `bun run devflare:test:watch` — watch the package test suite
- `bun run devflare:build` — build `devflare` and the documentation app
- `bun run devflare:typecheck` — typecheck the `devflare` package itself
- `bun run devflare:test` — run the stable downstream test lane for `devflare` dependents
- `bun run devflare:types` — regenerate dependent package types through Turbo
- `bun run devflare:check` — run the documentation app check lane
- `bun run devflare:ci` — run the full validated `devflare` contributor lane

`bun run ci` is now an alias for `bun run devflare:ci`.

## Notes

- The shared Turbo lane intentionally excludes `@devflare/case5-multi-worker` from the default test pass because that case is not currently stable in the shared contributor workflow.
- The shared `check` lane stays focused on `apps/documentation`; `cases/case18` still expects Cloudflare-backed resource resolution that is outside the default local/CI lane.
- Package-level usage and API docs live in `packages/devflare/README.md`.