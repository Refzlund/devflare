---
"devflare": minor
---

Model the Durable Objects binding `environment` sub-field. A cross-worker DO
binding (`scriptName` set) may now carry `environment` — the service-environment
of the target script — which compiles to wrangler's
`durable_objects.bindings[].environment`. Previously the field was unmodeled and,
because the DO binding predicate is not strict, a user-supplied `environment` was
silently dropped before deploy (validate-locally ≠ deploy-valid). It is now
threaded through normalization and emitted for cross-worker DOs only (a local DO
without `scriptName` drops it). This brings per-binding `environment` support in
line with wrangler across every binding type that accepts it (service bindings,
dispatch-namespace outbound, and now Durable Objects).
