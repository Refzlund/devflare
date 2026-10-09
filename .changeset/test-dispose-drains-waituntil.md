---
'devflare': patch
---

`env.dispose()` waits for the `waitUntil()` work `cf.worker.fetch()` started, and a failure in that
work names the request.

- **Background work no longer loses its bindings.** `cf.worker.fetch()` (and `get`, `post`, `put`,
  `delete`, `patch`) still returns when the handler resolves. Before, `env.dispose()` then shut
  Miniflare down underneath any `waitUntil()` work still running, so a binding call it made
  failed with `ECONNRESET` and Bun reported an anonymous "Unhandled error between tests" that
  failed a file whose tests had all passed. `env.dispose()` now waits for that work first, for up
  to 2 seconds (inside Bun's 5-second default for an `afterAll` hook), then tears down.
- **A failure is reported once, naming the request.** It is a `WaitUntilError` such as
  `waitUntil work started by cf.worker.fetch(GET http://localhost/api/trash) rejected: …`, with the
  original error as its `cause`. If the work rejects while `env.dispose()` is waiting,
  `env.dispose()` throws it after teardown. If it rejects earlier, it is raised as an unhandled
  rejection, so Bun fails the test running at that moment, as before but no longer anonymously.
- **Work that never settles cannot hang `env.dispose()`.** After 2 seconds it tears down anyway
  and throws a `WaitUntilError` naming each request whose work was still pending.
