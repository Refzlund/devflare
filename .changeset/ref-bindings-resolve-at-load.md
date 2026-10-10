---
'devflare': minor
---

A `ref()` binding now names its real worker everywhere, not only in the dev server and the test
contexts. Before this, a build or a deploy could emit a service binding to a worker called
`<pending>`.

```ts
bindings: {
	services: { API: ref(() => import('../api/devflare.config')).worker }
}
```

**`loadConfig` resolves the refs a config declares.** A `ref()` binding reads its worker's name
lazily: `service`, `scriptName` and `className` returned `<pending>` until something called the
ref's `resolve()`, and only the service-binding resolver behind the dev server and the test
contexts ever did. So `vite build` through `devflarePlugin()`, `getCloudflareConfig()`,
`getDevflareConfigs()`, `compileBuildConfig` and `devflare deploy` all compiled
`"service": "<pending>"`, and a cross-worker Durable Object (`ref(...).COUNTER`) got `<pending>` as
both its `class_name` and its `script_name`. Measured
on a gateway shaped like the example above, the build's `wrangler.jsonc` and the config
`devflare deploy` writes now differ from before in that one field: `<pending>` becomes the
referenced worker's name. Every other byte is unchanged.

`loadConfig` resolves one level only: the config's own `services` and `durableObjects`, and those
of its `env` overrides. A referenced config's own refs are still resolved where that config is
used, so nothing here can cycle. Resolving again later is free, because a ref caches its result.
**Behaviour change:** `loadConfig` now imports each referenced config. A ref whose import fails, or
whose config has no `name`, makes `loadConfig` throw, naming the binding and the config that
declares it, with the original error as the `cause`. Before, it emitted `<pending>` silently.

**The Vite plugin builds the worker a real `ref()` names.** `ref().worker` is a Proxy, and its
`in`, `Object.keys` and spread answered nothing, though its `get` answered `service` and `__ref`.
Every config transformer that copies a binding with `{ ...binding }` therefore dropped `__ref`. The
resource resolver in front of both Vite paths is one of them, so `vite dev` through
`devflarePlugin()` and `getDevflareConfigs()` never built the referenced worker at all. The
accessor now reflects the keys it answers. A hand-written `{ service, __ref }`, or
`ref().worker('Entrypoint')`, already carried `__ref` as an own key and was unaffected.

**A referenced worker is never built into this app's output.** It is deployed from its own
config, so:

- A `devflarePlugin()` build binds it by name and, as before, does not build it. The build never
  sees the worker's vars.
- Every auxiliary worker devflare produces for a `ref()` binding now carries
  `@cloudflare/vite-plugin`'s `devOnly: true`, as does each helper worker it brings. `AuxiliaryWorkerConfig` gains the optional
  `devOnly` field for this. The worker runs in `vite dev`. `vite build` builds no environment for it
  and writes no `wrangler.json` for it, and its deploy config does not list it.
- `getDevflareConfigs()` cannot tell `vite dev` from `vite build`, so it never lays a referenced
  worker's `.dev.vars` over its vars. The worker's `env.NAME` vars resolve in the same mode as the
  main config's: dev for the default `'offline-local'` strategy, build for `'remote'`. One
  declaration therefore resolves the same way in the gateway and in the worker it binds.
- `vite dev` through `devflarePlugin()` still gives the referenced worker its `.dev.vars`, as
  `devflare dev` does. That path resolves service bindings in serve mode only.

**Use `@cloudflare/vite-plugin` 1.39.0 or later.** `devOnly` on an auxiliary worker first appears
there. Devflare's peer range still admits older 1.x releases, which ignore it and build every
auxiliary worker into `dist`. On those, a referenced worker's committed `.dev()` fallback values
reach `dist`, exactly as the main config's already do under `'offline-local'`. Its `.dev.vars`
secrets reach `dist` on no version.

**Behaviour change for `getDevflareConfigs()` with a worker that already worked:** that means
`ref('name', …).worker('Entrypoint')` with a name override. Such a worker used to be built into
`dist` on `vite build`, carrying its `.dev.vars` secrets. It is now `devOnly`, and its vars no
longer include `.dev.vars`. `getCloudflareConfig()` no longer bundles referenced workers it never
returned.

**Build-manifest drift:** the source hash covers a `ref().worker('Entrypoint')` binding's
`service`, which used to hash as `<pending>`. A build made with an earlier devflare and deployed
with this one therefore reports binding drift once. That report is a warning, never a failure. A
plain `ref().worker` binding hashes as before.
