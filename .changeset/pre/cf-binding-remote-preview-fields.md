---
"devflare": minor
---

Model the `remote` flag and preview/jurisdiction/migration fields on the core
resource bindings. KV, D1, R2, queue producers, and service bindings now accept
`remote?: boolean` (use the real remote resource during local dev), and KV
(`previewId`), D1 (`previewDatabaseId`, `migrationsTable`, `migrationsDir`), and
R2 (`previewBucketName`, `jurisdiction`) accept their preview/jurisdiction/
migration fields — all compiled to the matching wrangler keys. R2 buckets and
queue producers now accept an object form (`{ bucketName | queue, remote, … }`)
in addition to the existing string shorthand, which keeps working unchanged.
