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
- `bun run lint:devflare` — Biome lint/format check of the published `packages/devflare` (gates `devflare:ci`)
- `bun run devflare:ci` — run the full validated `devflare` contributor lane (lints the package first, fail-fast)

Common aliases and broader monorepo lanes:

- `bun run dev` — alias for `devflare:dev`
- `bun run test` / `bun run test:watch` — alias for the `devflare:test*` lanes
- `bun run typecheck` / `bun run types` / `bun run check` — workspace-wide typecheck through Turbo
- `bun run typecheck:root` — typecheck only the repo-root TypeScript surface (no workspace recursion)
- `bun run build` — workspace-wide build through Turbo
- `bun run lint` / `bun run lint:fix` / `bun run lint:root` / `bun run lint:devflare` — Biome-based linting (whole workspace, root, or just the published package)
- `bun run ci` — alias for `devflare:ci`
- `bun run ci:strict` — root lint + root typecheck + `devflare:ci` (strict gate used in CI)

## Notes

- The shared `check` lane stays focused on `apps/documentation`; `cases/case18` still expects Cloudflare-backed resource resolution that is outside the default local/CI lane.
- Package-level usage and API docs live in `packages/devflare/README.md`.