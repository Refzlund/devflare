---
"devflare": patch
---

Stop the `WARN inlineDynamicImports option is ignored because codeSplitting: false is set.`
that rolldown printed on every `devflare dev` start-up.

`resolveWorkerCompatibleRolldownConfig` always pins `codeSplitting: false` — a worker bundle
is one file by definition — and the Durable Object bundler additionally asked for
`inlineDynamicImports: true`. Rolldown treats the pair as contradictory, ignores the second
option and warns once per bundled DO. The option was never load-bearing: with
`codeSplitting: false` the dynamic imports are already folded into the single chunk, and the
bundle rolldown writes is byte-identical either way (verified against rolldown 1.1.3, the
version consumers resolve — this repo's own lockfile pins 1.0.0-rc.15, which predates the
warning, so the noise only ever showed up downstream).

The internal `inlineDynamicImports` parameter is gone. A user-supplied
`rolldownOptions.output.inlineDynamicImports` is still stripped, as before, so it cannot
reintroduce the warning.
