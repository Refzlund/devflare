---
"devflare": patch
---

Stop the `[UNRESOLVED_IMPORT] Could not resolve 'fs/promises'` warning that rolldown
printed on every `devflare dev` start-up for a dependency that imports a Node builtin
**subpath**.

The bundler's external list was hand-maintained and named only ~20 bare builtins, so
every subpath — `fs/promises`, `stream/web`, `stream/promises`, `timers/promises`,
`dns/promises`, `util/types`, `assert/strict`, `path/posix`, … — fell through it, as did
whole builtins the list never gained (`timers`, `process`, `worker_threads`,
`perf_hooks`, `diagnostics_channel`, `http2`, …). A dependency only has to
`await import('fs/promises')` in a Node-only branch, as `@cloudflare/puppeteer` does, for
the worker-compat transform to hoist it into a static import and turn it into a warning
on every build.

The list is now derived from the runtime's own `builtinModules`, so it cannot drift from
Node's builtin set again. Rolldown already externalized these specifiers after warning
about them, so the bundle it writes is byte-identical — only the warning goes away.

One behaviour change worth knowing: a bare builtin name now resolves to the builtin even
when an npm package of the same name is installed. That was already true for `fs`,
`path`, `stream`, `crypto`, `events`, `util`, `url`, `assert` and the rest of the old
list; it now also holds for the builtins it missed, `punycode` among them. Packages that
only a non-Node host reports as builtins — Bun lists `ws` and `undici` — are excluded, so
they keep being bundled from `node_modules`.
