---
"devflare": patch
---

Fix unimportable published bundles. The JS build is now produced by rolldown
instead of `bun build`, whose bundler miscompiled the package's re-export
barrels (it emitted `export { x }` with no binding, so importing `devflare`,
`devflare/runtime`, `devflare/test`, and other entrypoints threw
`Export 'x' is not defined in module` under node). Declaration files now also
carry explicit relative-import extensions so the types resolve under
`node16`/`nodenext`, not only `bundler`. A new post-build step loads every
published entrypoint under node before publishing, so an unimportable bundle can
never ship again.
