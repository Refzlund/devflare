---
"devflare": minor
---

Bring the `sendEmail` binding to full pure-offline test parity. `createOfflineEnv()`
and `createMockEnv({ sendEmail })` now auto-wire a deterministic
`createMockSendEmail()` — a recording SendEmail mock that captures every
dispatched message into `.sentEmails` while enforcing the configured
sender/destination allow-lists — so `env.MY_EMAIL.send(...)` is assertable in
pure unit tests without Miniflare. `describeOfflineSupport('sendEmail')` is now
classified `offline-native` (previously it fell through to a false
`remote-boundary`). `createMockSendEmail` and the underlying
`createLocalSendEmailBinding` are exported from `devflare/test`. This was the last
mockable binding without offline auto-wiring; every binding family is now both
auto-wired offline and classified in the support matrix.
