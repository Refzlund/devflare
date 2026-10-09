---
'devflare': patch
---

Three fixes found during the toolchain upgrade.

- **A missing config is reported as missing.** A project with no `devflare.config.*` now gets
  `ConfigNotFoundError` ("Config file not found in … Run 'devflare init' …"). Before, c12 handed
  back an empty config for a file that does not exist, and the error was "Worker name is
  required". This works whether the project's own c12 is 2.x or 3.x.
- **`createMockArtifacts().get()` rejects a repo that does not exist.** It throws an
  `ArtifactsError` with code `NOT_FOUND`, as the Artifacts binding does, instead of resolving to
  `null`. A test that checked for `null` should now expect the rejection.
- **`devflare types` writes a file Biome leaves alone.** Long imports, Durable Object members
  typed through `import()`, a long config path and a long `Entrypoints` union are broken across
  lines, and an empty `DevflareEnv` is written `{}`. The output matches devflare's own style:
  tabs, 100 columns, single quotes, no semicolons. A project that formats with other settings
  will still reformat the file.
