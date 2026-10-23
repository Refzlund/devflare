---
"devflare": patch
---

Fix service bindings emitting an unsupported `environment` field. Wrangler's
`services` config item is `additionalProperties: false` and addresses a target
environment via the service **name** (`<worker_name>-<environment_name>`), not a
separate `environment` field — so a config that set `environment` on a service
binding compiled to a wrangler config that fails deploy validation. The
ergonomic `environment` input is kept, but it is now **folded into the emitted
`service` name** (`<service>-<environment>`) instead of emitted as a separate
field, so local validation once again matches a deploy-valid config. (Local
Miniflare wiring already used the base service name — environments are a deploy
concept.)
