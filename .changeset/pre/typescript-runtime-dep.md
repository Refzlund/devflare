---
"devflare": patch
---

Declare `typescript` as a runtime dependency. The `devflare/test` and
`devflare/vite` entrypoints (and the CLI's worker transforms) import the
TypeScript compiler at runtime, but it was only listed under `devDependencies`,
so a real consumer install resolved it only by accident inside this monorepo and
failed (`Cannot find package 'typescript'`) elsewhere. The dist verifier now
also asserts every package the bundle imports is a declared dependency, so this
class of gap is caught before publish.
