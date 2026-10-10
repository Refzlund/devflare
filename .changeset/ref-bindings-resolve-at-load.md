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
both its `class_name` and its `script_name`. Measured on a gateway shaped like the example above,
under Bun and under Node, the build's `wrangler.jsonc` and the config `devflare deploy` writes now
differ from before in that one field: `<pending>` becomes the referenced worker's name. Every other
byte is unchanged.

`loadConfig` resolves one level only: the config's own `services` and `durableObjects`, and those
of every one of its `env` overrides. A referenced config's own refs are still resolved where that
config is used, so nothing here can cycle. Resolving again later is free, because a ref caches its
result.

**Behaviour changes in `loadConfig`:**

- It imports each referenced config. A ref whose import fails, or whose config has no `name`,
  makes `loadConfig` throw, naming the binding and the config that declares it, with the original
  error as the `cause`. Before, it emitted `<pending>` silently.
- That includes a ref that appears only inside an `env` override. A ref inside `env.production`
  whose import resolves only in production CI, for instance a generated config file, now makes
  `devflare dev` and `devflare types` fail, and `devflare doctor` report the config invalid, on a
  machine where that import does not resolve, whichever environment they run for.
- A `ref(...).DO_NAME` binding that names a Durable Object the referenced config does not declare
  now fails, naming the binding. Before, it compiled `class_name: "<pending>"` silently.

**The Vite plugin builds the worker a real `ref()` names, under Bun.** `ref().worker` was a Proxy
whose `get` answered `service` and `__ref` while its `in`, `Object.keys` and spread answered
nothing. Every config transformer that copies a binding with `{ ...binding }` therefore dropped
`__ref`, and the resource resolver in front of both Vite paths is one of them. So `vite dev`
through `devflarePlugin()`, and `getDevflareConfigs()`, never built the referenced worker at all.
`service` and `__ref` are now real properties of the `.worker` function, so a copy keeps them and
`Object.freeze` works on it. A `ref(...).worker('Entrypoint')` binding already carried `__ref` as
an own key and was built before.

A ref now serialises as `{ name, configPath }`, not as the config it imports. That config can hold
refs of its own, and an unresolved ref throws when its `name` is read, so a `devflare config print`
of a gateway whose printed bindings carry `__ref` would otherwise fail.

**Bundling a referenced worker needs Bun.** Under Node, which is where `devflare dev` runs its Vite
child and where a plain `vite dev` usually runs, no referenced worker is built, a warning names the
binding, and no env file is read for it. Two things were wrong under Node before:

- c12 loads a config through jiti there, and jiti rewrites a ref's `import(...)`, so `ref()` cannot
  read the config path and records `<pending>`.
- `<pending>` was then resolved as a path, which pointed at the gateway's own directory. The
  gateway's `.env` and `.dev.vars` were read as the referenced worker's: they could fail on the
  worker's required variable, or lay the gateway's secrets over its vars.

A ref whose config path is unknown is now treated as having none, on every path.

**A referenced worker is never built into this app's output.** It is deployed from its own
config, so:

- A `devflarePlugin()` build binds it by name and, as before, does not build it. The build never
  sees the worker's vars.
- Every auxiliary worker devflare produces for a `ref()` binding now carries `devOnly: true`, as
  does each helper worker it brings. `AuxiliaryWorkerConfig` gains the optional `devOnly` field for
  this. In `@cloudflare/vite-plugin` 1.63.1, the version devflare tests with, an auxiliary worker
  marked `devOnly` runs in `vite dev`, while `vite build` builds no environment for it, writes no
  `wrangler.json` for it, and leaves it out of the deploy config.
- `getDevflareConfigs()` cannot tell `vite dev` from `vite build`, so it never lays a referenced
  worker's `.dev.vars` over its vars, at any depth: a worker the referenced worker binds is
  resolved the same way. The worker's `env.NAME` vars resolve in the same mode as the main
  config's: dev for the default `'offline-local'` strategy, build for `'remote'`. One declaration
  therefore resolves the same way in the gateway and in the worker it binds.
- `vite dev` through `devflarePlugin()` still gives the referenced worker its `.dev.vars`, as
  `devflare dev` does. That path resolves service bindings in serve mode only.

A version of `@cloudflare/vite-plugin` that lacks the `auxiliaryWorkers[].devOnly` option ignores
it and builds every auxiliary worker into `dist`. Devflare's peer range admits older 1.x releases.
With one of those, a referenced worker's committed `.dev()` fallback values reach `dist`, exactly as
the main config's already do under `'offline-local'`. Its `.dev.vars` secrets reach `dist` with no
version.

**Behaviour change for `getDevflareConfigs()` with a binding that was already built:** under Bun, a
`ref(...).worker('Entrypoint')` binding was built into `dist` on `vite build`, carrying its local
env, `.dev.vars` included. It is now `devOnly`, and its vars carry no `.dev.vars`.
`getCloudflareConfig()` no longer bundles referenced workers it never returned.
