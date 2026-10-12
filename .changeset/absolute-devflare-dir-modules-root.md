---
'devflare': patch
---

An absolute `DEVFLARE_DIR` outside the app now serves. Each worker's modules root was the app
directory (or its `baseDir`), while the bundles devflare runs live in the generated-state
directory. With `DEVFLARE_DIR` pointing elsewhere, the bundle fell outside that root, and dev
(`devflare dev` and `workspace dev` alike) refused to start:

```
Module …/worker-entrypoints/main.js lies outside the worker's modules root …/apps/api; workerd cannot load it.
```

An app whose `baseDir` names a subfolder (`baseDir: './src'`) hit the same refusal at the default
`.devflare`, because the bundle never lives under `src`.

The configured root is still used whenever it holds every module, so module names do not change for
any worker that already loaded. When it does not, the root becomes the deepest directory the
worker's modules share. Two edge cases changed with it:

- A configured root on another drive is no longer read as holding the modules. Before, it produced
  an absolute module name instead of an error.
- A child directory whose name starts with `..` counts as inside the root.

Modules that share no directory at all (different drives) are refused, naming every module.
