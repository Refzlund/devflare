---
'devflare': minor
---

Allow two devflare instances to run against the same app directory, via `DEVFLARE_DIR`.

The generated-state root (`.devflare`) was a constant repeated across six modules and resolved
from the process cwd, so every instance started in the same app wrote the same files — the dev
Wrangler config, the composed worker entrypoint, the synthesized `vite.config.mjs`, the local
data. Vite watches the config it loaded, so starting a second instance hot-restarted the first
onto the SECOND's configuration; when that instance shut down and took its runtime port with it,
the first was left dialling a port that no longer existed, socket still bound and every request
hanging forever. Giving each instance its own ports did not help, because the collision was on a
file path rather than a socket.

The root now resolves through one function that honours `DEVFLARE_DIR`, so a Playwright suite can
run beside a dev server in a single working tree:

```bash
DEVFLARE_DIR=.devflare-e2e bunx --bun devflare dev --port 5990 --runtime-port 8788
```

Unset, everything resolves exactly as before. The override applies uniformly — including build and
deploy artifacts — so keep it set for the whole life of an instance.
