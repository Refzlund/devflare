---
'devflare': patch
---

Correct what `.absentInDev()` promises. It said the key is "omitted entirely in dev"; what it
actually does — and always did — is omit the key when NOTHING supplies a value. A value that is
genuinely present still wins, in dev as everywhere else.

That is the intended escape hatch: a developer who deliberately exports a sender to point their
machine at a real one gets it. But the absolute phrasing invited the pairing that defeats the
descriptor entirely — writing the value into `.env.public`, which is committed, so it reaches
every checkout and hands the exact placeholder to every laptop the descriptor exists to withhold.
The documentation now says both halves, and a test pins the behaviour so the warning cannot
quietly become false.

No behaviour change.
