---
'devflare': minor
---

Two additions to config-time env vars: a `.env.public` tier meant to be committed, and an
`.absentInDev()` descriptor for values a deployment must have and a developer must not.

**`.env.public` — the tier you can commit.** Devflare now reads `.env.public`, `.env.dev` and `.env`
from the config directory upward, in that order within each directory. Every other env file is
conventionally git-ignored, which leaves values that are genuinely not secrets — a sender address, a
support forwarding target, a public API origin — with nowhere to live but a deploy dashboard, invisible
to the next person setting the project up. `.env.public` is deliberately the WEAKEST tier, so a
committed default can never override the machine it is running on. Nothing validates the promise in the
name: Devflare cannot tell a sender address from an SMTP URL with a password in it, so the filename is
documentation of intent, not a guarantee.

**`.absentInDev()` — required to build, absent to develop.** `env.NAME.absentInDev()` fails a build when
the variable is missing, and in dev omits the key entirely rather than supplying anything. This is the
third answer to "what if it is missing", and it exists because the other two are both wrong for a class
of variable: `.optional()` lets a production build ship without it, and `.dev(value)` hands the local
runtime a placeholder. The motivating case is a sender address — with none set, code that shape-checks
its environment takes its cannot-send path, which is how local development returns a sign-in code in the
response instead of mailing one nobody will read. Give it a placeholder and every laptop believes it can
send. The inferred type is optional, because in dev the key genuinely is.

Chaining is resolved rather than rejected: an explicit `.dev(value)` wins over `.absentInDev()` in dev
(the one that names the mode wins), and `.default(value)` loses to it.

Both are additive. Existing configs read the same files in the same order and resolve identically.
