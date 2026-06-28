---
"devflare": patch
---

Packaging & release hygiene:

- Ship a real MIT `LICENSE` file (the manifest declared `"license": "MIT"` but no
  license text was distributed) and populate the previously-empty `author` field.
- Add a `SECURITY.md` vulnerability-reporting policy.
- Fix the published CLI to run on Node: the `bin` shebang was `#!/usr/bin/env bun`
  while `engines` declared Node ≥20 support — a Node-only global install couldn't
  start. The built `dist` uses no Bun-only runtime APIs (verified running under
  Node), so the shebang is now `#!/usr/bin/env node` and both runtimes are honored.
- Add the `"./package.json"` subpath export so resolver/metadata tooling can read
  it (the `exports` map otherwise blocks `require('devflare/package.json')`).
- Declare `"sideEffects": false` to let consumer bundlers tree-shake devflare
  (the public modules carry no load-bearing import side effects).
