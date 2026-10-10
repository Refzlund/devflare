---
"devflare": minor
---

Add first-class support for three more Cloudflare bindings: **Stream**
(`bindings.stream`), **VPC** (`bindings.vpcServices` / `bindings.vpcNetworks`),
and **Flagship** (`bindings.flagship`). Each is schema-validated, compiled to the
matching wrangler keys (`stream`, `vpc_services`, `vpc_networks`, `flagship`),
typed on the generated `env`, and documented in the support matrix. Stream runs
locally through Miniflare with a deterministic pure mock (`createMockStreamBinding`)
for hosted operations; Flagship has a configured-value pure mock
(`createMockFlagshipBinding`) — its local Miniflare plugin returns call defaults,
not evaluated flags; VPC services/networks are a remote boundary (Miniflare only
proxies them) testable via a custom fake injected through `createMockEnv`.
