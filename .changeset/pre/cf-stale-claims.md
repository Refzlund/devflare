---
"devflare": patch
---

Correct stale offline-support classifications. Durable Objects and Service
bindings are no longer mislabelled "no offline support" — they run fully locally
under `createTestContext()` (Miniflare executes the DO class / resolves the
service binding), classified honestly as offline-native with the caveat that
there is no pure in-memory `createMockEnv()` mock for them. (Vectorize was
reclassified to an offline fixture in the previous release.)
