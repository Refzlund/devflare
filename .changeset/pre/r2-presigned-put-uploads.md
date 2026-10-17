---
'devflare': minor
---

R2 presigned PUT/GET URLs with full dev/prod symmetry: `presignR2Put(env, binding, key, options)` and `presignR2Get(env, binding, key, options)` (exported from `devflare/runtime`, worker-safe).

- **Production**: mints a real S3 SigV4 presigned URL against `https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>` (via `aws4fetch`), reading R2 S3 credentials from `env` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — set them as Worker secrets) or from `options.credentials`. The bucket name behind a binding resolves automatically from the new `DEVFLARE_R2_BUCKETS` var that `compileConfig` injects at deploy time from `bindings.r2` (explicit user var of the same name wins; `options.bucketName`/`options.jurisdiction` override per call).
- **Local dev + test harness**: mints a URL against a new signed gateway endpoint (`/_devflare/r2/presigned/<binding>/<key>`) served by every devflare gateway (dev server, `startMiniflare`, `createTestContext`). A per-boot HMAC secret is wired automatically (`DEVFLARE_R2_PRESIGN_SECRET`/`DEVFLARE_R2_PRESIGN_ORIGIN` env vars — injected into the Vite process, all Miniflare workers, and the test env). The endpoint enforces the same guarantees a real presign gives — signature, expiry, method, content type, exact `contentLength`, and `maxSizeBytes` — plus permissive CORS, so browser uploads and quota logic behave identically in dev, test, and prod.
- `MiniflareInstance` (from `startMiniflare`) gains `r2Presign: { origin, secret } | null` for programmatic/test presigning.
- Enforcement notes: `contentType` and `contentLength` are cryptographically enforced in both environments; `maxSizeBytes` is enforced locally but real R2 presigned PUTs cannot enforce an upper bound — pass `contentLength` when the size is known and confirm with a server-side `head()` before committing quota.
