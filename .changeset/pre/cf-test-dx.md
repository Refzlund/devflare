---
"devflare": minor
---

Close the test/offline DX gaps. New `createMockVectorize()` (in-memory vector
store with cosine `query`, metadata filters, insert/upsert/delete/getByIds) and
`createMockAnalyticsEngine()` (write-only recording stub) let you unit-test those
bindings offline; Vectorize is reclassified to an offline fixture. New
`cf.alarm.trigger()` fires a Durable Object `alarm()` handler in tests, the same
way the runtime does. And `createOfflineBindings()` now auto-wires the KV/D1/R2/
queues mocks when those bindings are declared without an explicit fixture, so
`env.MY_KV` is bound offline instead of undefined (an explicit fixture still
overrides).
