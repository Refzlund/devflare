---
'devflare': minor
---

`env.dispose()` waits for the `waitUntil()` work `cf.worker.fetch()` left running before it shuts
the runtime down, and reports what went wrong with that work by request.

- **What changed.** `cf.worker.fetch()` (and `get`, `post`, `put`, `delete`, `patch`) still
  returns when the handler resolves. Before, `env.dispose()` then shut Miniflare down underneath
  any `waitUntil()` work still running, so a binding call that work made afterwards failed with
  `ECONNRESET`, and Bun reported an anonymous "Unhandled error between tests" that failed a file
  whose tests had all passed. `env.dispose()` now waits for that work first, for up to 2 seconds,
  then tears down.
- **Work that settles before `env.dispose()` is unchanged.** Nothing is attached to a
  `waitUntil()` promise when it is registered, so Bun still decides what an unhandled rejection
  is: it fails the running test as it did, unattributed, and a rejection the handler awaited and
  recovered from is still not reported.
- **Work still running when `env.dispose()` starts is reported by `env.dispose()`.** If it
  rejects while dispose waits, `env.dispose()` throws a `WaitUntilError` after teardown, such as
  `waitUntil work started by cf.worker.fetch(GET http://localhost/api/trash) rejected while
  env.dispose() was waiting for it: …`, with the original error as its `cause`. If it is still
  running after the budget, `env.dispose()` tears down anyway and throws a `WaitUntilError`
  naming the request; a rejection from that work after the teardown is logged with
  `console.error` and fails no test.
- **New: `env.dispose({ waitUntilTimeoutMs })`** sets how long to wait (default 2000, finite,
  0 or more). Raise the hook timeout to match, because Bun gives an `afterAll` 5 seconds by
  default: `afterAll(() => env.dispose({ waitUntilTimeoutMs: 10_000 }), 15_000)`.
  `env.dispose()` with no argument works as before.
- **New exports from `devflare/test`:** `WaitUntilError` (for `instanceof`), with its
  `WaitUntilOrigin`, and the `EnvDisposeOptions` type.
- **Each test context drains only its own work.** Work from an earlier context that was never
  disposed is not waited for or blamed on the next one; creating the next context logs which
  requests started it.
