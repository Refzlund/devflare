# Testing app

This directory is the repo's real-world Devflare testing project.

It still covers the full binding matrix, but it now does so with actual Worker
source files instead of a single eager smoke handler that touches every binding
on every public request.

## What lives here

- `devflare.config.ts`
	- the main worker with the full binding matrix
	- guarded smoke routes so accidental public traffic stays cheap and safe
	- local Durable Objects for session, collaboration, and lock coordination
- `src/fetch.ts`
	- safe status routes (`/`, `/status`, `/health`)
	- guarded `POST /smoke` endpoint for intentional verification
- `src/queue.ts`
	- queue consumer that records the last processed queue batch in KV
- `src/scheduled.ts`
	- cron handler that records the last scheduled invocation in KV
- `src/do.*.ts`
	- real Durable Object implementations for local coordination state
- `workers/auth-service`
	- sidecar RPC service for auth-style operations
- `workers/search-service`
	- sidecar RPC service that the main worker binds to via `environment: 'staging'`

## Safe-by-default behavior

Public requests to `/` or `/status` only report binding availability and the
latest smoke/queue/scheduled state stored in KV.

The expensive or side-effecting operations live behind `POST /smoke`, which is
disabled unless a `SMOKE_KEY` secret is configured and supplied via the
`X-Devflare-Smoke-Key` header.

That keeps the project deployable as a real app without turning ordinary
requests into surprise browser sessions, vector writes, or outbound email.

## Deploy order

This app depends on sidecar Workers. Deploy them before deploying the main app:

1. `workers/auth-service` (`devflare-testing-auth-service`)
2. `workers/search-service` with its `staging` environment (`devflare-testing-search-service`)
3. the main worker in `apps/testing` (`devflare-testing-binding-matrix`)

## Branch-scoped CI previews

The PR preview workflow does **not** use `devflare deploy --preview` for the
main worker.

Cloudflare does not currently generate same-Worker preview URLs for Workers
that implement Durable Objects, and this app uses Durable Objects.

Instead, the workflow sets `DEVFLARE_PREVIEW_BRANCH`, which gives the auth,
search, and main workers branch-scoped names during CI preview deploys. The
main worker then deploys with `--env preview`, so each PR gets a real,
reachable `workers.dev` URL while the normal local/default names stay unchanged.

That workflow now also publishes a GitHub deployment on every run and updates a
stable PR comment whenever the branch belongs to an open pull request, while
still keeping the later `/status` assertion as the binding-verification step.

The branch preview lifecycle now also includes
`.github/workflows/testing-preview-branch-cleanup.yml`, which retires the
tracked preview metadata, deletes the branch-scoped Workers, and marks the
matching GitHub deployment inactive plus the stable PR preview comment inactive
when the branch is deleted while an open PR still points at it.

If you want a copyable branch-delete cleanup template for same-Worker preview
flows elsewhere in the repo, see
`.github/workflow-examples/branch-preview-cleanup.example.yml`.

## External prerequisites for the full matrix

The project structure is real, but some bindings still depend on Cloudflare
account capabilities that cannot be created purely from source code:

- `r2`
	- the target account must have R2 enabled in the Cloudflare dashboard
- `hyperdrive`
	- `POSTGRES` must point at a real Hyperdrive config backed by a real
		database
	- prefer the stable configured name (`devflare-testing`) over a raw id so
		Devflare can resolve it for build/deploy flows
- `sendEmail`
	- use real sender/destination addresses that match your Email Sending setup

Everything else in this app is designed so those prerequisites are explicit,
obvious, and isolated behind intentional smoke checks.