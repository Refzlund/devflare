---
"devflare": patch
---

Resolve a dependency's `package.json` without going through its `exports` map.
The CLI's type generation (and other package-specifier resolution, e.g. for
cross-package Durable Objects) read `<package>/package.json` via export-enforcing
resolution, which throws `ERR_PACKAGE_PATH_NOT_EXPORTED` for any package that
doesn't list `./package.json` in its `exports`. It now finds the package's own
`package.json` via a `node_modules` directory walk first, so such packages
resolve correctly.
