---
'devflare': patch
---

A config written `defineConfig(async () => …)` is now typed and referenced as what it is: a
Promise.

**`defineConfig` picks the right overload for a factory.** Any function satisfied the config
object's type on its own, because a function's `name` is a string and every other field is
optional. So the object overload took every factory: an async factory typed as `TypedConfig` and
reading `config.bindings` type-checked while it was `undefined` at runtime. It now types as
`Promise<TypedConfig<…>>`, explicit `defineConfig<Entrypoints>(async () => …)` included.

The same mistake meant that no factory's body was checked against the config schema. A factory
returning `bindings: { kv: 42 }` compiled without an error, and its returned object got no editor
completions. Both kinds of factory are now checked and completed like a plain config object, and a
sync factory's `vars` are inferred as an object's are. **A factory config may report type errors
it had all along.** A plain object config types exactly as before.

**`ref()` evaluates the referenced config the way `loadConfig` does.** It now awaits the module's
default and calls it when it is a factory, before reading `name`. Before this change, a ref to an
async config threw `Referenced config must have a "name" property`. A ref to a module exporting a
named factory (`export default function makeConfig() {…}`) resolved to a worker called
`makeConfig`. `ref()`'s types accept such modules and type `ref().config` as the evaluated config.

**`ref().worker(…)` keeps the entrypoints a config declares.** For any config written
`defineConfig<Entrypoints>(…)`, object or factory, the accessor widened to `string`, so an
unknown entrypoint name type-checked. It is now limited to `Entrypoints`.
