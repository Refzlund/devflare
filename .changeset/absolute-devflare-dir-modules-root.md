---
'devflare': patch
---

An absolute `DEVFLARE_DIR` outside the app now works, in `devflare dev` and `workspace dev`. Three
things stood in the way.

**The modules root.** Each worker's modules root was the app directory (or its `baseDir`), while the
bundles devflare runs live in the generated-state directory. A `DEVFLARE_DIR` outside the app put
the bundle outside that root, and dev refused to start:

```
Module …/worker-entrypoints/main.js lies outside the worker's modules root …/apps/api; workerd cannot load it.
```

An app whose `baseDir` names a subfolder (`baseDir: './src'`) hit the same refusal at the default
`.devflare`, because the bundle never lives under `src`. The configured root is still used whenever
it holds every module. When it does not, the root becomes the deepest directory the worker's modules
share. A configured root on another drive is no longer read as holding the modules (it used to
yield an absolute module name), and modules that share no directory at all are refused, naming each.

**One directory for every app.** In `workspace dev`, an override that lands outside the apps (any
absolute path, or a relative one climbing out such as `../gen`) is the same directory for all of
them. Every app wrote its bundle to one path, and since Miniflare reads the bundles only after the
last app is prepared, every app served the last one's code. Each such app now keeps its state in the
subdirectory named by its path below the manifest — `<DEVFLARE_DIR>/apps/api` for `apps/api` — and a
Vite app's child process is handed that subdirectory as its `DEVFLARE_DIR`. The workspace's own
state stays where it was, at `<DEVFLARE_DIR>/workspace-data`. An app outside the manifest directory
has no such subdirectory, so it is refused, naming both directories. An override that stays inside
each app, such as `.devflare-e2e`, changes nothing.

**The generated Vite config.** It began `import { defineConfig } from 'vite'`, which Node resolves
from the config file's own directory. Outside every `node_modules`, Vite refused it with
`Cannot find package 'vite'`. It now exports the config function directly, which is what
`defineConfig` returned.
