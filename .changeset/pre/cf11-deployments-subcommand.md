---
"devflare": minor
---

Add a read-only `devflare productions deployments` subcommand that lists a
Worker's full chronological deployment history (deployed-at, deployment id,
strategy, per-version traffic split, source, triggered-by, and message) via the
already-wired account API — the same read path `productions list` / `versions`
use, with no new write surface. Previously only the latest deployment summary
(`list`) and per-version timestamps (`versions`) were exposed.

Also documents the deploy-only `observability`, `placement`, and `limits`
top-level config keys in the Cloudflare support matrix (they were already
modeled and compiled; only their support tier was undocumented).
