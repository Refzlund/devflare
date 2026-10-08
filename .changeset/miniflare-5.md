---
'devflare': patch
---

Move to Miniflare 5 (`^5.20261006.0-alpha`) and Wrangler `4.148.0`, the release paired with it.

The reason is cloudflare/workers-sdk#15552. Miniflare's `SynchronousFetcher`, the synchronous
channel behind devflare's bridge calls, signalled "a reply is ready" with a bare flag, so a late
wake-up for one request could be taken as the reply to the next. Miniflare 5 publishes each
request's generation and waits for its own. A unit test now fails if the Miniflare devflare
resolves lacks that handshake.

Miniflare 5 changed its options API, and devflare translates its options into the new shape in
one place. These behaviours change:

- **Node 22.12 or newer is now required** (`engines.node` was `>=20`). Miniflare 5 and Wrangler
  4.148 need Node 22; Puppeteer 25, Rolldown 1.2 and Vite 8 need 22.12 on that line.
- A `createTestContext()` with cross-worker service or Durable Object bindings now gives the main
  worker everything its config declares. Its `compatibilityFlags`, queue producers, Hyperdrive,
  streaming tail consumers and AI Search bindings used to be left where Miniflare ignores them,
  so that worker ran without them.
- When persistence is on, Miniflare 5 keeps every resource under the one persistence root, so
  more state survives a restart. The dev server now also keeps rate-limit, Secrets Store and
  Flagship state. The bridge (`persist`) now also keeps Cache API, rate-limit and Secrets Store
  state, which it used to reset.
- A line workerd writes that is not JSON now reaches the dev logger as an ordinary log line, even
  when it came on stderr: Miniflare 5 no longer says which stream a line came from. Workerd's
  fatal-crash reports still arrive as errors.
- A file-backed worker whose module rules meet a dynamic `import()` with a non-literal specifier
  is refused at startup, as Miniflare 4 refused it.
- The `ctx` that `cf.worker`, `cf.queue`, `cf.scheduled`, `cf.tail` and `cf.email` pass to a
  handler now has an untraced `ctx.tracing`, so handlers that open spans run unchanged.

These keep their behaviour through a new mechanism:

- `server.httpsKeyPath` / `server.httpsCertPath` are read by devflare and handed to Miniflare as
  contents, with Miniflare 4's rules: both files are needed, and relative paths resolve against
  the directory devflare runs in.
- `server.liveReload` is served by devflare's dev gateway, because Miniflare 5 removed its own
  live reload. The client still dials `/cdn-cgi/mf/reload`.
- Local Secrets Store values reach the worker through a service binding. Miniflare 5 removed
  wrapped bindings.

Notable dependency majors: puppeteer-core 25, @puppeteer/browsers 3, execa 10, chokidar 5,
es-module-lexer 3, magic-string 1 and Rolldown 1.2, plus TypeScript 6 as the runtime
`typescript` dependency.
