---
'devflare': patch
---

Cache the Durable Object bundle on disk, so a suite with Durable Objects can put more than one test file in one process.

`createTestContext()` bundles the Durable Object class graph with `Bun.build` before the runtime
boots, and it did so on every context. That is what kept a consuming suite to one test file per bun
process: once the test runner has loaded a module on that graph, `Bun.build` will not re-read it
and fails against an ordinary file with a misleading errno —
`EISDIR reading file: .../store/d1.ts`, naming whichever graph module the tests also import.
Reported against `1.0.0-next.74` on a monorepo whose Durable Objects import shared workspace
packages; it does not reproduce on every project or bun build, so treat it as a hazard this
removes rather than a law. Neither `bun test --isolate` nor `--parallel=N` avoided it: both reuse a
worker across files, so every file after the first in a worker still failed. One process per file
does avoid it, and multiplies the whole per-file setup cost by the file count.

The bundle now lives under `.devflare/test-bundles/`. A process that starts with a warm cache never
calls `Bun.build` at all, so the failure cannot arise; where it does build, the second context in
that process reuses the result rather than repeating it.

An entry is used only when nothing it depended on has moved. That covers the content of every file
on the transitive graph — a Durable Object importing a shared module is the ordinary case, so
tracking only the Durable Object sources would have served a stale bundle after a normal edit — and
also what the bundler resolved THROUGH, which content alone cannot see: the `package.json` /
`tsconfig.json` files above those inputs, and a listing of each directory they came from, so a
newly added `mod.ts` beside an already-bundled `mod.js` counts as a change. The bundler version,
devflare's version and the build options are part of the key too. What can still go stale is a
resolver input that did not exist at build time and sits outside those directories — a
`tsconfig.json` added further up, a newly installed package that shadows one; deleting
`.devflare/test-bundles/` forces a rebuild.

The cache sits beside the config rather than under `DEVFLARE_DIR`, so concurrent test slots with
their own generated directories share one build instead of each paying for it. `.devflare/` is
already the generated-state directory a project ignores, so nothing new needs ignoring.

`devflare/test` also exports `__resetDurableObjectBundleCache()` and
`__resetTestContextConfigCache()`, for a suite that rewrites the tree it is testing mid-process.
