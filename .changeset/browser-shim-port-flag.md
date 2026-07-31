---
'devflare': patch
---

Let the local Browser Rendering shim be moved off 8788, via `--browser-shim-port` / `DEVFLARE_BROWSER_SHIM_PORT`.

The shim is a listener of its own beside the Miniflare runtime, and its port was only reachable
from `createDevServer()` — never from the CLI. So two `devflare dev` servers that both declared a
`browser` binding collided on 8788 no matter how their runtime ports were arranged, which is
exactly the multi-instance setup `--runtime-port 8788` and `DEVFLARE_DIR` otherwise make possible.
8788 is also a popular port to have already taken, being one off the 8787 runtime default.

Both dev commands now take the port:

```bash
bunx --bun devflare dev --runtime-port 8790 --browser-shim-port 8791
DEVFLARE_BROWSER_SHIM_PORT=8791 bunx --bun devflare dev
```

`workspace dev` reads the same flag as the FIRST port of its per-app block (each app that binds
browser rendering listens on that plus its index), which otherwise starts at 9700. The flag beats
the environment variable, and either one is rejected with a clear error rather than quietly
falling back when it is not a usable port. Unset, both commands bind exactly as before.
