---
'devflare': minor
---

Export the dotenv layer's pure readers from `devflare`: `getDevflareDotenvPaths`,
`parseDevflareEnvFile` and `loadDevflareDotenv` (with its `LoadDevflareDotenvResult` type).

Every command that loads a config runs this layer first, `deploy --prod` included, so a script
that must know what a deploy will see — a predeploy guard refusing a committed dev value — had to
mirror the parser and the file walk, and a mirror drifts silently. The internal barrel's types
already declared two of these, but no entrypoint backed them. They are now public, and they are
the same functions `loadConfig` calls rather than copies. The mutating
`loadDevflareDotenvIntoProcess` stays internal.

The docs now also say plainly that `.env.dev` reaches production deploys: the files a command loads
do not depend on its mode.

One fix in the walk itself: on Windows it climbed past a drive root to `/`, which resolves against
the drive the PROCESS is on. A project on `D:` run from `C:` read `C:\.env*`, and a project on the
process's own drive listed that drive root's files twice. The walk now ends at the drive root. The
browser stubs for the three readers say to call them from Node, since `devflare/test` and
`devflare/runtime` do not carry them.
