# devflare

## 1.0.0-next.84

### Patch Changes

- a74e46f: Say so when Cloudflare owns a declared DNS record, instead of failing with its error code.

  Enabling Email Routing or onboarding a sending domain makes Cloudflare write AND LOCK records of its
  own, and one of them lands on a name a config legitimately wants: the DMARC policy at
  `_dmarc.<domain>` sits at the zone apex, not under the `cf-bounce` subdomain the rest of the managed
  set uses. So a perfectly reasonable `dns: [{ type: 'TXT', name: '_dmarc', … }]` beside
  `emailSending.enable` collides with Cloudflare for the record — and a write to a locked record
  answers HTTP 400 code 1046, which reached the operator as a bare Cloudflare error naming neither the
  record nor the remedy.

  A deploy now reads the record's `meta` and, when Cloudflare owns it, reports what is actually live
  versus what the config declared and stops there. It does not throw, and the asymmetry with the
  ambiguous-record-set error beside it is deliberate: that one throws because guessing could DESTROY
  an unrelated record, while this one destroys nothing — it only means a value the config claims to
  control is not in effect, which must not block shipping the worker the deploy is about.

  For DMARC the warning says the part that is easy to miss: without your own `rua=`, aggregate reports
  go nowhere, so there is never any evidence on which to tighten the policy — and that is invisible by
  construction, because a domain with a working `p=none` looks exactly like one that is collecting.

  A locked record whose content already MATCHES the declaration stays an ordinary converged result
  rather than a warning; `meta` is opaque in Cloudflare's published schema and these keys are observed
  rather than documented, so a record that says nothing about itself is treated as ordinary.

## 1.0.0-next.83

### Patch Changes

- 9f93d43: Stop the outbound-email loopback listener from holding `devflare dev` open at shutdown.

  Its `close()` called only `server.close()`, which refuses NEW connections and then waits out every
  socket still open. The composed worker posts its deliveries to that listener over a keep-alive
  connection, and `disposeDevServerState()` awaits this close — so one connection still open at
  teardown stalled the dev server's exit for as long as that socket happened to live.

  The open connections are now dropped first, the same fix the runtime-status listener took: a send
  cut off at shutdown beats a dev server that will not exit.

  Two things about bun the fix has to know, both measured here. `closeAllConnections()` has to come
  BEFORE `close()` — Node honours either order, bun's `node:http` only the first, and called after it
  still waits the full socket lifetime (1ms against 2973ms). And bun's version takes the listener down
  with the connections, so the `close()` that follows reports `ERR_SERVER_NOT_RUNNING`; that code is
  the outcome this asked for rather than a failure, and is read as success.

  Covered by a test that MEASURES the close against a request holding the socket, because the defect
  never failed a close — it finished, seconds late.

## 1.0.0-next.82

### Minor Changes

- 1a8bd5c: Tell a reloading runtime apart from a dev server that is not running, so a mid-reload request stops
  500ing with someone else's error.

  The bridge an app connects to is served from INSIDE the workerd runtime, so every reload of that
  runtime is a bridge outage — an HMR worker change, a config change, the watchdog rebuilding a
  runtime that died. The connect already retried through those, but on a flat 3s budget, and that
  budget was never able to be right. It had to cover a rebuild the dev server itself needs longer than
  6s just to DECLARE (three probes at 2s, and only then the rebuild and the re-migration), while also
  failing fast when `devflare dev` is simply not running — because a long budget there hangs every
  request for its whole length. The app could not see the difference: both are a refused socket.

  **So ask something that survives the outage.** `devflare dev` now publishes a runtime-status channel
  on a loopback listener of its own, on an ephemeral port, and hands the URL to the app process it
  spawns. It is owned by the coordinator process rather than the runtime, which is the entire point —
  no workerd restart can take it away. The connect consults it on each failed attempt: while it says
  `reloading`/`starting`, the wait runs to a generous 30s and collapses back the moment it stops
  saying so; when it says `failed` (the watchdog spent its rebuild budget), `stopping`, or does not
  answer at all, the request fails immediately instead of sitting out an outage nobody is going to
  end. An app started outside `devflare dev` gets no URL, and behaves exactly as before.

  The state is settled per request against a live probe, not read from cached belief. A workerd that
  dies on its own leaves the reload queue idle and the watchdog needing three probes to notice, so
  every cached answer in that window would have said `ready` — which is the window this exists to
  cover.

  **And the failure no longer arrives wearing the wrong name.** A dev platform that could not be built
  used to be dropped, leaving `event.platform` unset; the request was still served, which is right,
  but anything that then read a binding hit the app's own "`<BINDING>` (D1) binding is missing. Run
  the app via `devflare dev`" — naming a cause that is not the cause, and prescribing a fix the
  developer has already applied. The platform is now always attached, and it is its `env` that
  refuses, with devflare's own error naming what actually happened ("the devflare dev coordinator is
  not answering, so nothing is going to bring the local runtime back — is `devflare dev` still
  running?") and the transport error kept as its `cause`.

  Serving continues either way, deliberately: an asset or a page that touches no binding has no
  business failing over a reload. The tradeoff is that an app treating a missing binding as a soft
  signal (`if (!platform.env.DB)`) now throws where it used to branch — in dev, with a coordinator
  that has just said the runtime is gone, a loud cause beats a silent fallback down a path nobody
  knew they were on. Protocol reads (`then`, `toJSON`, any symbol) still answer `undefined`, so
  logging or serialising the platform does not move the failure somewhere it cannot be read.

  Also fixed, found while in there: an auto-reconnect scheduled by a dropped bridge socket outlived
  the client that scheduled it. `disconnect()` set `autoReconnect = false`, but that flag is read when
  the reconnect is SCHEDULED, not when it fires — so a timer already pending went on to open a fresh
  socket for a client nobody held any more, a second into whatever came next. The timer is now
  tracked and cancelled.

### Patch Changes

- dd5d525: Create Email Routing DESTINATION ADDRESSES before the rules that forward to them — which is what
  sends the verification email somebody has to click.

  Creating a forwarding rule does not create the address it points at. Cloudflare accepts the rule
  against an address it has never heard of and then silently drops every message: no error, no bounce,
  no log. And because adding the ADDRESS is what triggers the verification mail, a deploy that created
  only the rule left the operator waiting for a link that could not arrive — which is exactly what
  happened.

  A deploy now ensures every address named by `emailRouting.rules[].forward` or
  `emailRouting.catchAll.forward` exists as a destination on the account, before creating any rule.
  Adding one is reported and warned about, because the rule is live and dropping mail until the click
  happens. An address that already exists but is UNVERIFIED warns too, rather than failing: the click
  belongs to whoever owns that mailbox and may be days away, and failing there would make a correct
  configuration unshippable until somebody read their email.

  Stubbed under `--dry-run` like every other zone mutation.

## 1.0.0-next.81

### Minor Changes

- 166a389: `eventSubscriptions` — declare which platform events Cloudflare publishes onto which Queue, and
  reconcile them at deploy.

  ```ts
  eventSubscriptions: [
    {
      queue: "email-events",
      source: {
        type: "email.sending",
        zone_id: "ZONE_ID",
        domain: "example.com",
      },
      events: ["message.delivered", "message.bounced"],
    },
  ];
  ```

  The queue is named rather than identified and Devflare resolves the id; declare it in
  `bindings.queues` and the same deploy provisions it first, because a subscription cannot create its
  own and Cloudflare offers no create-if-missing.

  **Matched on (source, queue), never on name.** A name is cosmetic, and one created by hand in the
  dashboard will not carry the name Devflare would have written — matching on it would add a second
  subscription beside the working one, and both would deliver, doubling every event onto the queue.
  Source objects are compared with their keys sorted, because Cloudflare is under no obligation to
  echo fields in the order they were sent and a raw JSON comparison would create a duplicate on every
  deploy. Nothing is deleted or updated: a subscription is a live delivery path, and changing which
  events it carries is a decision rather than a reconciliation.

  **`source` is a passthrough, deliberately.** Cloudflare publishes eight source types in its API
  schema and ships ten in wrangler, and Email Sending — generally available and documented since July
  2026 — appears in neither. A modelled union would reject sources that work, so the object is
  forwarded verbatim.

  That leaves the question of what to put in it for an undocumented source, and the honest answer is
  that guessing is not safe: the sample event payloads use camelCase while every verified request
  shape uses snake_case, so `zoneId` and `zone_id` are a coin flip that fails at deploy time inside a
  tool whose whole promise is that the config is correct. So Devflare does not guess and does not ask
  you to either — when a declared subscription matches nothing, it prints the `source` of every
  subscription the account already has, exactly as Cloudflare stores it. Create one in the dashboard,
  deploy once, and copy the field names out of the output.

  Two things that are easy to get wrong and are called out in the docs: `events` takes the SHORT form
  (`message.delivered`), not the `cf.email.sending.message.delivered` that arrives ON the queue — the
  prefixed form subscribes to nothing, silently. And preview deploys provision no subscriptions, for
  the same reason they provision no zone resources: a subscription is account-wide and would outlive
  the branch that made it.

## 1.0.0-next.80

### Minor Changes

- a20aa35: `zones['<domain>'].emailSending` — check, and optionally perform, Email Sending onboarding at deploy.

  Email Sending is a different Cloudflare product from Email Routing that happens to share a zone.
  Routing is INBOUND: what happens to mail arriving for the domain. Sending is OUTBOUND: whether a
  Worker's `send_email` binding may send from an address there. A domain that does both is onboarded
  to both, separately — and a subdomain gets its own DKIM key rather than inheriting the apex one.

  ```ts
  zones: {
  	'example.com': { emailSending: { enable: true } }
  }
  ```

  Declaring it makes every deploy CHECK: the domain must be onboarded and enabled, or the deploy fails
  and names both ways to fix it (`enable: true`, or `wrangler email sending enable <domain>`). That
  turns the failure mode from a silent one into a loud one — a binding that is fine in config and
  rejected at send time, on a domain nobody remembered to onboard.

  `enable: true` performs the onboarding. It is opt-in for the same reason `emailRouting.enable` is:
  Cloudflare writes AND LOCKS a set of DNS records in the zone — the `MX` and SPF `TXT` on
  `cf-bounce.<domain>`, a DKIM key at `cf-bounce._domainkey.<domain>`, and a DMARC policy at
  `_dmarc.<domain>`. Two consequences worth knowing: a record you declare under `dns` that collides
  with one of those is fighting Cloudflare for it, and a DMARC record may already exist and not be
  yours.

  DNS readiness is REPORTED, never waited on. Cloudflare writes the records at onboarding but they
  take minutes to propagate, so a fresh domain is legitimately unready for a while and failing there
  would fail a deploy that did everything right. A status of `ready` or `unlocked` passes — `unlocked`
  means the records are correct and only a managed lock was cleared — while `unconfigured` and
  `misconfigured` become a warning carrying Cloudflare's own error codes (`dkim.missing`,
  `spf.multiple`, and so on), because a sender whose DKIM never landed otherwise looks provisioned
  while every message fails authentication.

  Onboarding is stubbed under `--dry-run` like every other zone mutation. One caveat, stated plainly:
  Cloudflare's API schema declares key-based auth for these endpoints and omits API tokens, unlike the
  sibling send endpoints. If a token-authenticated onboarding is refused, the error says so and points
  at the `wrangler` command, which needs running only once.

## 1.0.0-next.79

### Minor Changes

- 587f86c: New top-level `zones` config: Email Routing rules and DNS records, declared per domain and
  reconciled at deploy. These are the first ZONE-scoped resources Devflare provisions — everything
  until now lived under `/accounts/{id}`, while a zone is a different identifier reached by a
  different lookup and gated by a different token scope.

  ```ts
  zones: {
  	'example.com': {
  		emailRouting: {
  			enable: true,
  			rules: [{ to: 'support@example.com', worker: 'example-api' }],
  			catchAll: { drop: true }
  		},
  		dns: [{ type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none' }]
  	}
  }
  ```

  **Keyed by domain, not by zone id**, because a domain is what an author knows. Devflare walks the
  labels up to the apex, so `mail.example.com` is configured under its own name and its records land
  in the `example.com` zone. A relative record name resolves against the DOMAIN it was declared under
  rather than the zone apex — for a subdomain those differ, and the apex is the wrong place.

  **Reconciled, not replayed.** Rules match on the address they claim and records on type and name, so
  deploying twice is a no-op rather than a pile of duplicates. Nothing is ever deleted: a zone almost
  always carries rules and records the config never mentioned. A rule that exists but points somewhere
  else is REPORTED rather than rewritten — a live mail route edited by hand is more likely deliberate
  than stale. A declared DNS record is the opposite: it is rewritten to match, because that is what
  makes a staged DMARC rollout a config edit instead of a dashboard visit. Do not declare a record
  another system writes.

  **Enabling Email Routing is never inferred.** It rewrites the zone MX records, changing where all
  mail for the domain is delivered — too large a side effect to follow from someone adding a
  forwarding rule. `enable: true` is the authorization; without it, a zone with routing off fails the
  deploy and says what to do.

  `--dry-run` substitutes every zone mutation, enabling included, while the reads still happen — so
  the plan reflects the real mix of what exists and what does not, without a single write. Two other
  gaps closed alongside it: the dry-run plan was omitting Vectorize and Hyperdrive from its
  `Would create:` list, and `schema-types-email.ts` was never added to the type-documentation gate, so
  the most recent authoring mirror shipped unenforced.

  No permission work is needed: the token patterns Devflare already mints against cover zone-scoped
  DNS and Email Routing.

### Patch Changes

- 587f86c: Correct what `.absentInDev()` promises. It said the key is "omitted entirely in dev"; what it
  actually does — and always did — is omit the key when NOTHING supplies a value. A value that is
  genuinely present still wins, in dev as everywhere else.

  That is the intended escape hatch: a developer who deliberately exports a sender to point their
  machine at a real one gets it. But the absolute phrasing invited the pairing that defeats the
  descriptor entirely — writing the value into `.env.public`, which is committed, so it reaches
  every checkout and hands the exact placeholder to every laptop the descriptor exists to withhold.
  The documentation now says both halves, and a test pins the behaviour so the warning cannot
  quietly become false.

  No behaviour change.

## 1.0.0-next.78

### Minor Changes

- 45938ee: Two additions to config-time env vars: a `.env.public` tier meant to be committed, and an
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

## 1.0.0-next.77

### Minor Changes

- 67feb43: Close the local email loop: an outbox to assert against, a real SMTP relay, a
  recipient pin, and an IMAP poller that feeds `src/email.ts`.

  **Outbox.** Every message a worker dispatches through a `sendEmail` binding is
  recorded and readable from `devflare/test`: `cf.email.outbox` (in dispatch
  order), `cf.email.sent()` (a mutable copy), `cf.email.clearOutbox()`, and
  `cf.email.onOutbound(cb)`. Each entry carries **both** representations — a
  structured `message` (`from`/`to`/`cc`/`bcc`/`replyTo`/`subject`/`text`/`html`/
  `headers`/attachment metadata) and the full `raw` MIME with its `size`, because
  assertions about generated headers or Cloudflare's 5 MiB cap can only be made
  against the document that actually travels.

  **Message builder parity.** `send()` now handles the whole Workers builder
  shape. An address may be a bare string, a `{ email, name }` object, or a list
  mixing both, in `from`, `to`, `cc`, `bcc`, and `replyTo`; `attachments` become
  `multipart/mixed` parts; the MIME is built exactly once so the recorded bytes
  are the delivered bytes. A named address previously reached the wire as
  `[object Object]`, and `attachments` were dropped entirely.

  **`send()` returns `{ messageId }`.** The local binding previously resolved
  `undefined`, contradicting its own `Promise<EmailSendResult>` type. The id it
  returns is the `Message-ID` stamped on the MIME. A test asserting
  `.resolves.toBeUndefined()` on a local send needs updating.

  **New top-level `email` config (local only, never compiled into Wrangler
  output).** `email.mode` selects what happens to a locally sent message:

  - `capture` (**default**) — recorded, nothing leaves the machine.
  - `relay` — recorded, then pinned and delivered over SMTP from the host process.
  - `live` — Devflare stands aside; the runtime binding performs the send.

  **The mode is never inferred from credentials.** A populated `email.relay.url`
  or `DEVFLARE_EMAIL_RELAY_URL` is inert until something explicitly selects
  `relay`, so a suite that happens to run on a machine with real mail settings
  cannot start sending real mail.

  **Relay + recipient pin.** `email.relay` takes an implicit-TLS SMTP URL
  (`smtps://user:pass@host:465`) and a required `relay.to`. Every address in
  `to`, `cc`, and `bcc` is rewritten to that one address at the binding boundary,
  on the assembled MIME — so worker code that hand-rolls its own document is
  pinned exactly like one that used the builder, and a developer laptop holding a
  production token still cannot reach a real user. The originals are preserved as
  `X-Devflare-Original-To`/`-Cc`/`-Bcc`, and every relayed message is stamped
  `X-Devflare-Dev-Relay: 1` (renameable via `relay.header`). The SMTP client runs
  in the host process; under `devflare dev` the composed worker posts each message
  to a loopback listener on 127.0.0.1, because workerd has no raw sockets.

  **Inbound poller.** `email.inbound` (opt-in, off by default) watches a real
  mailbox over IMAP (`imaps://user:pass@host:993`) and posts each new message at
  the same local endpoint `cf.email.send()` uses, so `src/email.ts` receives it
  exactly as Email Routing would. It **skips any message carrying the relay
  marker**, which is what stops a shared pin-and-poll mailbox from feeding every
  locally sent message back into the worker and looping forever.

  Every `email` field has an environment override:
  `DEVFLARE_EMAIL_MODE`, `DEVFLARE_EMAIL_RELAY_URL`, `DEVFLARE_EMAIL_RELAY_TO`,
  `DEVFLARE_EMAIL_RELAY_FROM`, `DEVFLARE_EMAIL_RELAY_HEADER`,
  `DEVFLARE_EMAIL_RELAY_REJECT_UNAUTHORIZED`, `DEVFLARE_EMAIL_INBOUND`,
  `DEVFLARE_EMAIL_INBOUND_URL`, `DEVFLARE_EMAIL_INBOUND_MAILBOX`,
  `DEVFLARE_EMAIL_INBOUND_INTERVAL_MS`, `DEVFLARE_EMAIL_INBOUND_TO`,
  `DEVFLARE_EMAIL_INBOUND_MARK_SEEN`. Only `DEVFLARE_EMAIL_MODE` changes what
  happens; the rest supply settings the selected mode needs.

  **Injection is closed at the shared writers.** Devflare composes headers and
  SMTP commands by concatenation, so caller text that reaches a header — subject,
  display name, custom header value, attachment filename, and every value the
  relay writes — is stripped of CR/LF, and an envelope address carrying CR, LF,
  `<` or `>` is refused before a socket is opened. Without that, a newline in a
  subject forges a `Bcc:`, a newline in `cc` pushes the relay marker out of the
  header block (breaking the inbound loop guard), and a newline in `from` smuggles
  a second `RCPT TO` past the recipient pin.

  `devflare/runtime` additionally exports `setEmailDeliverySink`,
  `clearEmailDeliverySink`, `createHttpEmailDeliverySink`, `buildEmailMessage`,
  and `EMAIL_MAX_MESSAGE_BYTES`. No existing export was removed or renamed, and an
  existing `bindings.sendEmail` config keeps working untouched.

## 1.0.0-next.76

### Patch Changes

- 1cfb463: Load a devflare config once per process in `createTestContext()`, instead of once per context.

  Resolving the config — evaluating the config module, then the env placeholders and `.dev.vars`
  overlay — cost 15–130ms depending on the project, and a suite creating a context per test file
  paid it every time. The config module was never actually re-read: the loader evaluates it once
  per process and returns that same instance afterwards, rewritten file or not. So the repeat work
  could only ever reproduce what the first call already had.

  The resolution is memoised per config path, which is now normalised first — autodiscovery answers
  in posix separators and an explicit path in the platform's, so one config file reached both ways
  used to load twice and produce two config objects.

  What the memo additionally holds still is the env / `.dev.vars` overlay, which no longer follows a
  change made between two contexts in one process.

- 5fcd74a: Cache the Durable Object bundle on disk, so a suite with Durable Objects can put more than one test file in one process.

  `createTestContext()` bundles the Durable Object class graph with `Bun.build` before the runtime
  boots, and it did so on every context. That is what kept a consuming suite to one test file per bun
  process: once the test runner has loaded a module on that graph, `Bun.build` will not re-read it
  and fails against an ordinary file with a misleading errno —
  `EISDIR reading file: .../store/d1.ts`, naming whichever graph module the tests also import.
  Reported against `1.0.0-next.74` on a monorepo whose Durable Objects import shared workspace
  packages; it does not reproduce on every project or bun build, so treat it as a hazard this
  removes rather than a law. Neither `bun test --isolate` nor `--parallel=N` avoided it: both reuse a
  worker across files, so every file after the first in a worker still failed. One process per file
  does avoid it, and multiplies the whole per-file setup cost by the file count.

  The bundle now lives under `.devflare/test-bundles/`. A process that starts with a warm cache never
  calls `Bun.build` at all, so the failure cannot arise; where it does build, the second context in
  that process reuses the result rather than repeating it.

  An entry is used only when nothing it depended on has moved. That covers the content of every file
  on the transitive graph — a Durable Object importing a shared module is the ordinary case, so
  tracking only the Durable Object sources would have served a stale bundle after a normal edit — and
  also what the bundler resolved THROUGH, which content alone cannot see: the `package.json` /
  `tsconfig.json` files above those inputs, and a listing of each directory they came from, so a
  newly added `mod.ts` beside an already-bundled `mod.js` counts as a change. The bundler version,
  devflare's version and the build options are part of the key too. What can still go stale is a
  resolver input that did not exist at build time and sits outside those directories — a
  `tsconfig.json` added further up, a newly installed package that shadows one; deleting
  `.devflare/test-bundles/` forces a rebuild.

  The cache sits beside the config rather than under `DEVFLARE_DIR`, so concurrent test slots with
  their own generated directories share one build instead of each paying for it. `.devflare/` is
  already the generated-state directory a project ignores, so nothing new needs ignoring.

  `devflare/test` also exports `__resetDurableObjectBundleCache()` and
  `__resetTestContextConfigCache()`, for a suite that rewrites the tree it is testing mid-process.

## 1.0.0-next.75

### Patch Changes

- 8c1284c: Stop the `[UNRESOLVED_IMPORT] Could not resolve 'fs/promises'` warning that rolldown
  printed on every `devflare dev` start-up for a dependency that imports a Node builtin
  **subpath**.

  The bundler's external list was hand-maintained and named only ~20 bare builtins, so
  every subpath — `fs/promises`, `stream/web`, `stream/promises`, `timers/promises`,
  `dns/promises`, `util/types`, `assert/strict`, `path/posix`, … — fell through it, as did
  whole builtins the list never gained (`timers`, `process`, `worker_threads`,
  `perf_hooks`, `diagnostics_channel`, `http2`, …). A dependency only has to
  `await import('fs/promises')` in a Node-only branch, as `@cloudflare/puppeteer` does, for
  the worker-compat transform to hoist it into a static import and turn it into a warning
  on every build.

  The list is now derived from the runtime's own `builtinModules`, so it cannot drift from
  Node's builtin set again. Rolldown already externalized these specifiers after warning
  about them, so the bundle it writes is byte-identical — only the warning goes away.

  One behaviour change worth knowing: a bare builtin name now resolves to the builtin even
  when an npm package of the same name is installed. That was already true for `fs`,
  `path`, `stream`, `crypto`, `events`, `util`, `url`, `assert` and the rest of the old
  list; it now also holds for the builtins it missed, `punycode` among them. Packages that
  only a non-Node host reports as builtins — Bun lists `ws` and `undici` — are excluded, so
  they keep being bundled from `node_modules`.

## 1.0.0-next.74

### Patch Changes

- 4c34bfb: Serve the endpoints `@cloudflare/puppeteer` 1.1.0 and later actually call, so `puppeteer.launch(env.BROWSER)` works again.

  The local Browser Rendering shim was built against `@cloudflare/puppeteer` 1.0.x and still
  served only its URLs. 1.1.0 moved every one of them without a major bump, so a current client
  never reached the shim at all — `launch()` failed at the first call with
  `Unable to create new browser: code: 404: message: Not found`, which is the shim's own 404
  travelling back through the binding.

  | client  | acquire                       | devtools websocket                          |
  | ------- | ----------------------------- | ------------------------------------------- |
  | ≤ 1.0.7 | `GET /v1/acquire?…`           | `GET /v1/connectDevtools?browser_session=…` |
  | ≥ 1.1.0 | `POST /v1/devtools/browser?…` | `GET /v1/devtools/browser/<sessionId>`      |

  Both generations are now served, on one route table, so which client version an app pins stays
  the app's decision rather than devflare's.

  The same release also dropped the transport's chunk framing — up to 1.0.7 every CDP message
  travelled as binary frames behind a 4-byte length header, with a keep-alive ping each second,
  and from 1.1.0 it is plain unframed JSON. Fixing only the paths would therefore have moved the
  failure rather than removed it: the session would open and then the first `Browser.getVersion`
  would arrive wrapped in a header the client no longer unwraps. The binding worker now picks its
  framing from the path the client connected on, which is exactly as reliable a signal, the two
  having changed in the same release.

  `/v1/sessions`, `/v1/history` and `/v1/limits` never moved and are untouched.

- 9a9431f: Return the browser shim's session and history lists in the envelope `@cloudflare/puppeteer` reads them from.

  `puppeteer.sessions(env.BROWSER)` and `.history(env.BROWSER)` both resolved to `undefined`
  against the local shim. The client does `JSON.parse(text).sessions` and `JSON.parse(text).history`
  — it has in every version it has shipped, and its own types say so (`SessionsResponse`,
  `HistoryResponse`) — while the shim answered with a bare array, so the field it looked for was
  never there.

  Unlike the endpoint move alongside this, that was never a version skew: it was equally wrong for
  every client. `/v1/limits` was already correct and is untouched.

  Anything reading `/v1/sessions` or `/v1/history` off the shim directly rather than through
  puppeteer now finds the array one field in.

## 1.0.0-next.73

### Patch Changes

- 48bab1b: Let the local Browser Rendering shim be moved off 8788, via `--browser-shim-port` / `DEVFLARE_BROWSER_SHIM_PORT`.

  The shim is a listener of its own beside the Miniflare runtime, and its port was only reachable
  from `createDevServer()` — never from the CLI. So two `devflare dev` servers that both declared a
  `browser` binding collided on 8788 no matter how their runtime ports were arranged, which is
  exactly the multi-instance setup `--runtime-port 8788` and `DEVFLARE_DIR` otherwise make possible.
  8788 is also a popular port to have already taken, being one off the 8787 runtime default.

  Both dev commands now take the port:

  ```bash
  bunx --bun devflare dev --runtime-port 8790 --browser-shim-port 8791
  DEVFLARE_BROWSER_SHIM_PORT=8791 bunx --bun devflare dev
  ```

  `workspace dev` reads the same flag as the FIRST port of its per-app block (each app that binds
  browser rendering listens on that plus its index), which otherwise starts at 9700. The flag beats
  the environment variable, and either one is rejected with a clear error rather than quietly
  falling back when it is not a usable port. Unset, both commands bind exactly as before.

## 1.0.0-next.72

### Patch Changes

- 4ac411f: Finish the `DEVFLARE_DIR` override — it was ignored on the path that actually runs.

  `1.0.0-next.71` routed the generated root through one resolver, but seven sites still built
  `.devflare` themselves, and one of them (`vite/plugin-context.ts`) is the dev-time writer — so
  setting `DEVFLARE_DIR` changed nothing observable: `wrangler.jsonc` and `vite.config.mjs` still
  landed in `.devflare`. Also fixed: the Vite plugin's log lines (which named `.devflare` while
  writing elsewhere), the workflow entrypoints, the DO bundles, the Miniflare persist directory, the
  workspace persist directory, and the adapter's `vite-build-output` staging directory.

  A test now enumerates every source file that builds a path from a hardcoded `.devflare` and fails
  on any that is not a documented exception (home caches, and `secrets.local.json`, which is authored
  input rather than generated output and must stay findable). That test is what caught the seven —
  an eyeball inventory had not.

## 1.0.0-next.71

### Minor Changes

- 8384f9e: Allow two devflare instances to run against the same app directory, via `DEVFLARE_DIR`.

  The generated-state root (`.devflare`) was a constant repeated across six modules and resolved
  from the process cwd, so every instance started in the same app wrote the same files — the dev
  Wrangler config, the composed worker entrypoint, the synthesized `vite.config.mjs`, the local
  data. Vite watches the config it loaded, so starting a second instance hot-restarted the first
  onto the SECOND's configuration; when that instance shut down and took its runtime port with it,
  the first was left dialling a port that no longer existed, socket still bound and every request
  hanging forever. Giving each instance its own ports did not help, because the collision was on a
  file path rather than a socket.

  The root now resolves through one function that honours `DEVFLARE_DIR`, so a Playwright suite can
  run beside a dev server in a single working tree:

  ```bash
  DEVFLARE_DIR=.devflare-e2e bunx --bun devflare dev --port 5990 --runtime-port 8788
  ```

  Unset, everything resolves exactly as before. The override applies uniformly — including build and
  deploy artifacts — so keep it set for the whole life of an instance.

### Patch Changes

- 0d3055f: Stop the `WARN inlineDynamicImports option is ignored because codeSplitting: false is set.`
  that rolldown printed on every `devflare dev` start-up.

  `resolveWorkerCompatibleRolldownConfig` always pins `codeSplitting: false` — a worker bundle
  is one file by definition — and the Durable Object bundler additionally asked for
  `inlineDynamicImports: true`. Rolldown treats the pair as contradictory, ignores the second
  option and warns once per bundled DO. The option was never load-bearing: with
  `codeSplitting: false` the dynamic imports are already folded into the single chunk, and the
  bundle rolldown writes is byte-identical either way (verified against rolldown 1.1.3, the
  version consumers resolve — this repo's own lockfile pins 1.0.0-rc.15, which predates the
  warning, so the noise only ever showed up downstream).

  The internal `inlineDynamicImports` parameter is gone. A user-supplied
  `rolldownOptions.output.inlineDynamicImports` is still stripped, as before, so it cannot
  reintroduce the warning.

## 1.0.0-next.70

### Patch Changes

- a53ad70: Rebuild the local runtime when it dies, instead of serving every request against a runtime that is gone.

  Miniflare runs the worker in a workerd child process, and that child can die on its own — devflare
  never initiates it, and nothing was watching for it. When it happened the dev server carried on as if
  nothing had: the coordinator stayed up, Vite kept serving, and every request failed to reach the
  bridge. SvelteKit apps surfaced this as `[devflare] Failed to create platform: WebSocket connection
failed` followed by a spurious "`<BINDING>` (D1/KV/R2) binding is missing" — each request first
  burning the bridge-connect retry budget, so the app got slower as well as broken. Nothing in the log
  said the runtime had gone, and the only way back was to restart `devflare dev`.

  `devflare dev` now probes the runtime for liveness (a plain TCP connect, every 2s; the measured
  downtime of a legitimate `setOptions` reload is ~150ms, well inside the ~4s it takes three consecutive
  failures to accumulate). A death is rebuilt through the same queue that serves config- and
  worker-driven reloads, so a rebuild can never race one, and the schema is re-applied afterwards
  because a rebuilt runtime starts empty unless storage is persisted. A runtime that will not come back
  is retried a bounded number of times and then reported plainly, so the underlying error stays visible
  instead of being buried under restart noise.

  Reloading is also no longer able to talk to a corpse: `setOptions` is only used when the runtime
  answers, and a runtime that does not is discarded and rebuilt.

  `devflare workspace dev` builds its shared Miniflare on a separate path and is NOT covered by this —
  it has the same exposure, and wiring the same watchdog in is a follow-up.

## 1.0.0-next.69

### Patch Changes

- 2b42355: Stop a retried bridge connect from tearing down the connection it just established,
  and stop the SvelteKit handle from blaming a request's own error on the platform.

  **`BridgeClient` — a superseded socket could dismantle the live connection.** A refused
  socket rejects on `error` but stays alive until its `close` arrives, so a caller that
  retries in between replaces `this.ws` while the old socket is still wired to its
  handlers. Those handlers were unconditional: the abandoned socket's `close` ran
  `handleDisconnect()` — clearing `isConnected`, dropping the codec and rejecting every
  in-flight call on the connection that had just replaced it — while a late `open`
  installed a second codec over the live one, and either could clear another attempt's
  in-flight marker. The connect timeout, too, closed whichever socket was current rather
  than the one that attempt opened. Every handler now acts only while its own socket is
  still the client's, and settles its own attempt. Overlapping attempts were rare when a
  request connected once; `connectBridgeWithRetry` (added in the previous release) retries
  ~20 times inside a single request, which makes them routine — so a bridge that blinked
  during an HMR reload could leave the client wedged rather than reconnected.

  **`devflare/sveltekit` — the platform fallback caught the whole request.** The `try` in
  `handle`/`createHandle` spanned both `createDevflarePlatform()` and `resolve(event)`, so
  an error thrown anywhere downstream was logged as `[devflare] Failed to create platform`
  — hiding the real cause behind a wrong diagnosis — and the request was then re-run via
  the fallback. That re-run repeated every side effect the first pass had already
  performed, and ran outside the request context devflare had established for it, so
  `getContext()`/`env()` throw during the retry. The fallback is now scoped to building the
  platform: a request that fails on its own merits propagates, once. A genuine platform
  failure still falls through to an unbridged `resolve()` exactly as before.

## 1.0.0-next.68

### Patch Changes

- 0b7ebc9: Ride out a transient bridge outage when creating the SvelteKit dev platform, so a
  worker reload no longer 500s in-flight requests with a missing binding.

  `createDevflarePlatform` connected to the bridge with a single attempt: the moment
  the bridge socket was refused — which happens for a fraction of a second on every
  HMR worker reload, config change, or brief coordinator restart — `connect()`
  rejected, the SvelteKit handle caught it and fell through **without** setting
  `event.platform`, and the request 500s with "`<BINDING>` (D1/KV/R2) binding is
  missing". Because the platform isn't cached when an app uses local binding shims
  (e.g. an R2 binding), this hit essentially every request that landed in a reload
  window, making the errors feel constant during development.

  The connect now retries for a short bounded window (`connectBridgeWithRetry`,
  default ~3s at 150ms intervals) so the reconnect lands and the request proceeds
  with its bindings intact. A bridge that is genuinely down still surfaces the error
  promptly once the budget is spent, so a real misconfiguration fails fast rather
  than hanging every request.

## 1.0.0-next.67

### Patch Changes

- cd794ad: Fix `devflare workspace dev` crashing at startup for any app that owns a Durable Object.

  The workspace coordinator namespaces every co-hosted worker as
  `${appName}/${workerName}` to keep two apps' `gateway`/main/DO workers distinct in
  the one shared instance. workerd tolerates `/` in plain service/worker names, but
  a Durable Object whose host-worker (script) name contains `/` makes the runtime
  abort at `miniflare.ready` with an uncatchable `*** std::terminate() called with
no exception` — so a workspace containing any DO app (very common: a SvelteKit +
  Worker monorepo whose Worker owns a DO) never booted.

  The namespace separator is now `-` (the canonical Cloudflare worker-name
  character, safe in every workerd context — service names, DO script names, DO
  uniqueKeys, and the persist paths derived from them). Because worker/app names are
  charset-unrestricted, a new guard in the merge turns the (now theoretically
  possible) rare name collision into a loud, actionable error instead of a silently
  half-wired instance. Added unit coverage (no `/` in any namespaced name; the
  collision guard) and an integration test that boots a DO-owning app in a workspace
  and calls the DO through its direct socket.

## 1.0.0-next.66

### Minor Changes

- 69a9d38: Add `devflare workspace dev` — run several apps in ONE Miniflare with live-shared bindings.

  Two apps that bind the same D1/KV/R2/Durable Object id share one managed resource
  in production, but under per-app `devflare dev` each app gets its own Miniflare
  (its own `workerd` process), so a write by one is invisible to the other — and a
  shared persist dir cannot fix it (each process keeps its own storage snapshot and
  they contend for the SQLite file). Sharing **live** state requires co-hosting the
  workers in a single instance.

  `devflare workspace dev` does exactly that. It reads a new opt-in
  `devflare.workspace.ts` manifest, prepares each app with the same pipeline
  `devflare dev` uses, and merges their `buildMiniflareDevConfig` worker sets into
  **one** Miniflare instance. Workers that bind the same id then resolve to one live
  store (Miniflare dedupes storage services by binding id). Each app keeps its own
  browser origin via a per-app Miniflare direct socket (`unsafeDirectSockets`), so
  the cross-origin split (e.g. `ui.localhost` ↔ `api.ui.localhost`) is preserved;
  Vite apps are spawned as children pointed at the shared instance's bridge.

  ```ts
  // devflare.workspace.ts
  import { defineWorkspace } from "devflare";

  export default defineWorkspace({
    apps: [
      {
        config: "./apps/api/devflare.config.ts",
        port: 8789,
        env: { DOC_API_DEV_SEED: "1" },
      },
      {
        config: "./apps/web/devflare.config.ts",
        vite: true,
        vitePort: 5173,
        bridgePort: 8788,
      },
    ],
    shared: { d1: ["PLATFORM_DB"], r2: ["MEDIA"] },
  });
  ```

  ```bash
  devflare workspace dev            # one Miniflare, all apps, shared bindings
  devflare workspace dev --no-persist
  ```

  New public API: `defineWorkspace()` (plus `WorkspaceManifest`/`WorkspaceManifestInput`/`WorkspaceApp`
  types). D1 migrations run once per app against the shared store (the migration
  ledger dedupes shared files); an optional `shared` block asserts the intended
  binding ids match across apps and errors loudly if they don't.

  This is strictly additive: the per-app `devflare dev` path is byte-for-byte
  unchanged, and `DEVFLARE_PERSIST_DIR` remains file-colocation only. Worker/DO hot
  reload inside the shared instance is not wired yet (restart to pick up worker
  source changes); Vite children keep their own HMR.

## 1.0.0-next.65

### Patch Changes

- 844e4e1: feat: DEVFLARE_PERSIST_DIR env override for the dev-server persist directory (share one persist dir across multiple workers in local multi-worker dev)

## 1.0.0-next.64

### Patch Changes

- 03d550c: Fix multi-`Set-Cookie` corruption when a response is relayed through the dev
  bridge.

  When a Durable Object or service-binding `fetch()` response set **more than one**
  cookie (e.g. a session cookie plus a CSRF cookie), the bridge flattened the
  response headers with `Headers.entries()`/`forEach()`. Per the Fetch spec's
  sort-and-combine, those APIs fold multiple `Set-Cookie` headers into a single
  comma-joined value, so the browser received one corrupted
  `Set-Cookie: a=1; Path=/; SameSite=Lax, b=2; Path=/; HttpOnly` — the second
  cookie was lost and the first mangled. This bit any response relayed via a
  service-binding or DO `fetch` through the local bridge whenever the gateway ran
  under a compatibility date before `2023-08-01` (where workerd still combines
  `Set-Cookie` and has no `getSetCookie()`).

  The bridge now enumerates `Set-Cookie` separately and carries each value as its
  own entry through serialize → deserialize (reconstructed with `append`, never a
  join), so every cookie survives byte-faithfully with all attributes intact. It
  reads cookies via the standard `Headers.getSetCookie()` and falls back to
  workerd's legacy `getAll('set-cookie')`; when a runtime exposes neither, the
  combined value is preserved verbatim rather than dropped. Both the workerd
  gateway (`GATEWAY_RUNTIME_JS`) and the host-side (`server.ts`) serialization
  paths are fixed, for `Request` and `Response` alike. Single-cookie and
  non-cookie headers are unchanged.

## 1.0.0-next.63

### Patch Changes

- e8cd40f: Fix `devflare dev`: forward app-route WebSocket upgrades to the app worker.

  In worker mode the dev gateway runs as the entry worker (`routes: ['*']`) with
  the app (e.g. SvelteKit) worker as a service binding. A browser opening
  `new WebSocket('/api/doc/:id/subscribe')` — whose handler does
  `return stub.fetch(clientUpgradeRequest)` and returns the Durable Object's `101`
  — never reached that handler: the gateway hijacked **every** unmatched WebSocket
  upgrade into its in-worker bridge RPC socket. The socket appeared to upgrade
  (`101`), but the app route never ran, so a DO's hibernation broadcast never
  crossed tabs and a second concurrent connection could not share the DO instance.

  This is distinct from the programmatic `stub.connect()` path fixed in the prior
  release; it is the path a Worker/SvelteKit route takes when it forwards a client
  WebSocket upgrade to a DO.

  The gateway now forwards an unmatched WebSocket upgrade to the app worker and
  passes its response through when the app answers with a genuine upgrade
  (`101` + a `webSocket`), so `stub.fetch(clientUpgradeRequest)` reaches the DO and
  its client socket streams back to the browser — two tabs then share one DO
  instance and `ctx.getWebSockets()` broadcasts (and `webSocketClose` leave frames)
  work. It falls back to the bridge RPC socket only when the app does not answer
  with an upgrade (the bridge client path, which exists only when there is no app
  worker). The `/_devflare/do-ws` connect() path, configured `wsRoutes`, and the
  native DO RPC path are unchanged.

## 1.0.0-next.62

### Patch Changes

- 4477cc9: Fix `devflare dev`: relay a Durable Object's WebSocket-hibernation cross-socket
  broadcast.

  Two WebSocket clients connecting to the SAME DO instance
  (`env.DOC_ROOM.getByName(id)` twice) could not see each other's messages when the
  DO used the hibernation API (`ctx.acceptWebSocket()` with the runtime-dispatched
  `webSocketMessage`/`webSocketClose` handlers and a `ctx.getWebSockets()`
  broadcast). The upgrade succeeded (`101`) and both sockets landed on one instance
  (`ctx.getWebSockets().length` reached 2), but `webSocketMessage` never fired, so
  a frame sent by one client was never delivered to the other.

  Root cause: the bridge gateway pumped the DO's WebSocket **in-process** (it called
  `stub.fetch(upgrade)` and drove the returned client socket with
  `accept()`/`send()`). An in-process-pumped partner socket does not trigger
  workerd's hibernation dispatch — only a genuine inbound connection does. The
  `devflare/test` gateway had no DO WebSocket handler at all, so `stub.connect()`
  hung there.

  Durable Object `connect()` now opens a real pass-through WebSocket to a new
  `/_devflare/do-ws` gateway endpoint, which forwards the upgrade to the DO and
  returns its `101` response verbatim (the same pattern the browser WebSocket routes
  already use). miniflare then wires the inbound connection to the DO's client
  socket, so the runtime dispatches the hibernation handlers and delivers
  `ctx.getWebSockets()` broadcasts across every connected client — exactly as on
  real Cloudflare. Both the `devflare dev` and `devflare/test` gateways are covered.
  The single-socket WebSocket path, the legacy in-process relay (`createWsProxy`),
  and the native DO RPC path are unchanged.

## 1.0.0-next.61

### Patch Changes

- 50c14ab: Fix `devflare dev`: bridge Durable Object RPC **method** calls (e.g.
  `stub.push(arg)`, `stub.pull(since)`) when the DO also defines a custom `fetch()`
  handler.

  The local dev gateway routed every DO method call through the DO's `fetch()`
  using an internal `_rpc` convention. A DO that `extends DurableObject` and
  overrides `fetch()` — for example a websocket-only handler that returns `426`
  for non-upgrade requests — received that probe on its own `fetch()`, returned a
  non-JSON body, and the call failed with a bogus `... is not valid JSON` error.

  The gateway now dispatches method calls natively (`stub[method](...args)`) —
  exactly as on real Cloudflare, and matching what `devflare/test` already did —
  and only falls back to the `_rpc` fetch convention for Durable Objects that are
  not RPC-enabled. The `.fetch()`/WebSocket bridge paths are unchanged and still
  reach the user handler.

## 1.0.0-next.60

### Minor Changes

- 3e27fa5: R2 presigned PUT/GET URLs with full dev/prod symmetry: `presignR2Put(env, binding, key, options)` and `presignR2Get(env, binding, key, options)` (exported from `devflare/runtime`, worker-safe).

  - **Production**: mints a real S3 SigV4 presigned URL against `https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>` (via `aws4fetch`), reading R2 S3 credentials from `env` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — set them as Worker secrets) or from `options.credentials`. The bucket name behind a binding resolves automatically from the new `DEVFLARE_R2_BUCKETS` var that `compileConfig` injects at deploy time from `bindings.r2` (explicit user var of the same name wins; `options.bucketName`/`options.jurisdiction` override per call).
  - **Local dev + test harness**: mints a URL against a new signed gateway endpoint (`/_devflare/r2/presigned/<binding>/<key>`) served by every devflare gateway (dev server, `startMiniflare`, `createTestContext`). A per-boot HMAC secret is wired automatically (`DEVFLARE_R2_PRESIGN_SECRET`/`DEVFLARE_R2_PRESIGN_ORIGIN` env vars — injected into the Vite process, all Miniflare workers, and the test env). The endpoint enforces the same guarantees a real presign gives — signature, expiry, method, content type, exact `contentLength`, and `maxSizeBytes` — plus permissive CORS, so browser uploads and quota logic behave identically in dev, test, and prod.
  - `MiniflareInstance` (from `startMiniflare`) gains `r2Presign: { origin, secret } | null` for programmatic/test presigning.
  - Enforcement notes: `contentType` and `contentLength` are cryptographically enforced in both environments; `maxSizeBytes` is enforced locally but real R2 presigned PUTs cannot enforce an upper bound — pass `contentLength` when the size is known and confirm with a server-side `head()` before committing quota.

## 1.0.0-next.59

### Patch Changes

- cd9efe6: Add the `server.publicUrl` local-dev knob.

  `publicUrl` is the public-facing URL the local dev runtime advertises for itself
  (served on Miniflare's `/core/public-url` loopback; otherwise the runtime entry
  URL) — set it when the dev runtime sits behind a reverse proxy, tunnel, or custom
  domain so the Worker reports the externally-visible origin. It maps to Miniflare's
  `publicUrl` and is the final user-facing `CoreSharedOptions` knob, a sibling of the
  already-wired `upstream`/`cf`/`liveReload`. Local-dev only — no deploy effect (no
  wrangler analogue).

## 1.0.0-next.58

### Minor Changes

- 0ad0536: Fix route flags being emitted on the wrong route type, and add the remaining
  local-dev `server` knobs.

  - **Route `enabled` / `previews_enabled`** are valid only on a **custom-domain**
    route — wrangler's `zone_id` / `zone_name` route shapes are
    `additionalProperties: false` and reject them. Devflare now rejects them at
    config-parse time on non-custom-domain routes (with a clear error) and emits
    them only for custom-domain routes, so a config that validates locally is
    deploy-valid (previously `{ pattern, zone_id, enabled: true }` parsed but
    failed at deploy).
  - **`server.inspectorHost`**, **`server.verbose`**, and **`server.logRequests`**
    are now accepted on the dev `server` config and threaded into Miniflare's
    shared options — the remaining user-facing local-dev knobs alongside
    `https`/`inspectorPort`/`upstream`/`liveReload`/`cf`. Local-dev only, no deploy
    effect.

## 1.0.0-next.57

### Patch Changes

- 95b548f: Fix service bindings emitting an unsupported `environment` field. Wrangler's
  `services` config item is `additionalProperties: false` and addresses a target
  environment via the service **name** (`<worker_name>-<environment_name>`), not a
  separate `environment` field — so a config that set `environment` on a service
  binding compiled to a wrangler config that fails deploy validation. The
  ergonomic `environment` input is kept, but it is now **folded into the emitted
  `service` name** (`<service>-<environment>`) instead of emitted as a separate
  field, so local validation once again matches a deploy-valid config. (Local
  Miniflare wiring already used the base service name — environments are a deploy
  concept.)

## 1.0.0-next.56

### Minor Changes

- 50a2474: Model the Durable Objects binding `environment` sub-field. A cross-worker DO
  binding (`scriptName` set) may now carry `environment` — the service-environment
  of the target script — which compiles to wrangler's
  `durable_objects.bindings[].environment`. Previously the field was unmodeled and,
  because the DO binding predicate is not strict, a user-supplied `environment` was
  silently dropped before deploy (validate-locally ≠ deploy-valid). It is now
  threaded through normalization and emitted for cross-worker DOs only (a local DO
  without `scriptName` drops it). This brings per-binding `environment` support in
  line with wrangler across every binding type that accepts it (service bindings,
  dispatch-namespace outbound, and now Durable Objects).

## 1.0.0-next.55

### Patch Changes

- 0ba2da4: Fix `streamingTailConsumers` rejecting `environment` at config-parse time.
  Wrangler's `StreamingTailConsumer` accepts only `service` (`additionalProperties:
false`) — unlike `tailConsumers`, it has no `environment` field. The object form
  previously modeled an optional `environment` (mirrored from `tailConsumers`),
  which devflare accepted and compiled into the Wrangler config, so a config that
  set it validated locally but failed at deploy. `environment` is now removed from
  the streaming-tail schema, input type, and compiler output, so it is rejected up
  front with a clear error — keeping local validation equivalent to a deploy-valid
  config. (The regular `tailConsumers` `environment` field is unchanged.)

## 1.0.0-next.54

### Minor Changes

- 23650d8: Add two more local-dev `server` options, threaded into Miniflare's
  `CoreSharedOptions` alongside the existing `https`/`inspectorPort`/`upstream`:

  - `server.liveReload` — inject Miniflare's in-browser live-reload script so the
    page auto-refreshes when the dev runtime reloads (complements Devflare's own
    source watcher).
  - `server.cf` — override the local `request.cf` (`IncomingRequestCfProperties`):
    `false` omits it, a string is a path to a JSON file, and an object injects
    custom cf metadata (colo, country, TLS, bot management, …) for testing cf-aware
    code under `devflare dev` without Cloudflare.

  Both are local-dev only with no deploy effect.

## 1.0.0-next.53

### Minor Changes

- fb5dff4: Bring the `sendEmail` binding to full pure-offline test parity. `createOfflineEnv()`
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

## 1.0.0-next.52

### Minor Changes

- 848e41f: Add a read-only `devflare productions deployments` subcommand that lists a
  Worker's full chronological deployment history (deployed-at, deployment id,
  strategy, per-version traffic split, source, triggered-by, and message) via the
  already-wired account API — the same read path `productions list` / `versions`
  use, with no new write surface. Previously only the latest deployment summary
  (`list`) and per-version timestamps (`versions`) were exposed.

  Also documents the deploy-only `observability`, `placement`, and `limits`
  top-level config keys in the Cloudflare support matrix (they were already
  modeled and compiled; only their support tier was undocumented).

## 1.0.0-next.51

### Minor Changes

- 804bc79: Close the remaining Cloudflare config-coverage gaps found by a fresh
  dependency-grounded re-investigation (wrangler 4.85.0 / miniflare 4.20260424.0 /
  workers-types 4.20260426.1). Each field mirrors an existing sibling and stays
  backward-compatible.

  Locally wired into dev/test Miniflare:

  - Queue producer `deliveryDelay` (→ `delivery_delay`).
  - Service binding `props` (object exposed to the target Worker via `ctx.props`).
  - `streamingTailConsumers` (→ `streaming_tail_consumers`, wired to Miniflare
    `streamingTails`, a full twin of `tailConsumers`).
  - `server` config now also accepts `https` / `httpsKeyPath` / `httpsCertPath` /
    `inspectorPort` / `upstream` (local HTTPS dev, custom inspector port, upstream).
  - Cache API contents now persist across dev-server restarts (`cachePersist`).
  - New dev/test-only `outboundService` option to route a Worker's outbound
    `fetch()` to a named service for local cross-service testing.

  Compiled for deploy:

  - Queue consumer `visibilityTimeoutMs` (→ `visibility_timeout_ms`).
  - Top-level `complianceRegion` (`'public' | 'fedramp_high'`).
  - Top-level `workersDev` toggle (was hardcoded `true`; still defaults to `true`).
  - Custom-domain route `enabled` / `previewsEnabled`.
  - `sendEmail` binding `remote` flag — emitted for deploy; Miniflare has no local
    `remote` for `send_email`, so it is a deploy-time directive (stripped locally,
    same as mTLS).

  Legacy Worker `site` (static assets) is documented as passthrough-reachable via
  `wrangler.passthrough` (superseded by `assets`).

## 1.0.0-next.50

### Patch Changes

- f1209e4: Fix the typed `env` and `vars` runtime proxies so they are assignable to an
  augmented `DevflareEnv` / `DevflareVars`. The proxy factory inferred its type
  parameter from the internal getter (`Record<string, unknown>`) instead of the
  exported type, so any consumer that declared `vars` (giving `DevflareEnv` /
  `DevflareVars` required keys) hit a type error when importing `env` / `vars`
  from `devflare/runtime`. The proxies now carry their declared types explicitly.

## 1.0.0-next.49

### Minor Changes

- 15fed0f: Add build-time safety checks and cron validation. Cron expressions are now
  validated against Cloudflare's 5-field grammar (`src/config/cron.ts`) at
  config-parse time (a `.superRefine()` on `triggers.crons`) and in
  `cf.scheduled.trigger(cron)`, so a typo like `cf.scheduled.trigger('* * *')`
  fails with an actionable message instead of silently passing. The explicit
  2-arg fetch-handler style requirement is now also checked at dev-start / `build`
  time (`validateFetchHandlerStyle()` in the shared worker-load chokepoint),
  reusing the exact same resolver and style markers as the request-time check —
  zero false positives, with the runtime check kept as the backstop. Finally, a
  successful **production** deploy prints a one-line hint that runtime secrets are
  set via `wrangler secret put` / the dashboard (devflare never sends secret
  values to Cloudflare); the hint never fires on preview or dry-run deploys.

## 1.0.0-next.48

### Minor Changes

- 49aad79: Add deploy-lifecycle parity. `devflare deploy --prod --percentage <n>` performs a
  gradual/canary rollout (uploads a new version with `wrangler versions upload`,
  then shifts `<n>%` of traffic to it via `wrangler versions deploy <id>@<n>`, with
  an optional `--version` to pin the version keeping the remainder) — production
  only, never shifting traffic on preview/dry-run. New `devflare tail` command
  streams a deployed worker's live logs over Cloudflare's tail API (`--format
pretty|json`, clean teardown on exit).

## 1.0.0-next.47

### Patch Changes

- e267951: Correct stale offline-support classifications. Durable Objects and Service
  bindings are no longer mislabelled "no offline support" — they run fully locally
  under `createTestContext()` (Miniflare executes the DO class / resolves the
  service binding), classified honestly as offline-native with the caveat that
  there is no pure in-memory `createMockEnv()` mock for them. (Vectorize was
  reclassified to an offline fixture in the previous release.)

## 1.0.0-next.46

### Minor Changes

- b3f6771: Close the test/offline DX gaps. New `createMockVectorize()` (in-memory vector
  store with cosine `query`, metadata filters, insert/upsert/delete/getByIds) and
  `createMockAnalyticsEngine()` (write-only recording stub) let you unit-test those
  bindings offline; Vectorize is reclassified to an offline fixture. New
  `cf.alarm.trigger()` fires a Durable Object `alarm()` handler in tests, the same
  way the runtime does. And `createOfflineBindings()` now auto-wires the KV/D1/R2/
  queues mocks when those bindings are declared without an explicit fixture, so
  `env.MY_KV` is bound offline instead of undefined (an explicit fixture still
  overrides).

## 1.0.0-next.45

### Minor Changes

- 54f4566: Wire deploy-modeled-only bindings into local development. Analytics Engine now
  binds in local dev (Miniflare's write-only no-op stub, so `writeDataPoint()` no
  longer throws), tail consumers are delivered locally when the consumer Worker is
  present in the same dev instance (the tail handler was already testable via
  `cf.tail.trigger()`), and the mTLS `remote` flag is forwarded to the local
  binding so deploy and local dev agree on the binding shape. Wired consistently
  across the dev server, the cross-process bridge, and the test context.

## 1.0.0-next.44

### Minor Changes

- 81b4c63: Add first-class support for three more Cloudflare bindings: **Stream**
  (`bindings.stream`), **VPC** (`bindings.vpcServices` / `bindings.vpcNetworks`),
  and **Flagship** (`bindings.flagship`). Each is schema-validated, compiled to the
  matching wrangler keys (`stream`, `vpc_services`, `vpc_networks`, `flagship`),
  typed on the generated `env`, and documented in the support matrix. Stream runs
  locally through Miniflare with a deterministic pure mock (`createMockStreamBinding`)
  for hosted operations; Flagship has a configured-value pure mock
  (`createMockFlagshipBinding`) — its local Miniflare plugin returns call defaults,
  not evaluated flags; VPC services/networks are a remote boundary (Miniflare only
  proxies them) testable via a custom fake injected through `createMockEnv`.

## 1.0.0-next.43

### Minor Changes

- feab91d: Model the `remote` flag and preview/jurisdiction/migration fields on the core
  resource bindings. KV, D1, R2, queue producers, and service bindings now accept
  `remote?: boolean` (use the real remote resource during local dev), and KV
  (`previewId`), D1 (`previewDatabaseId`, `migrationsTable`, `migrationsDir`), and
  R2 (`previewBucketName`, `jurisdiction`) accept their preview/jurisdiction/
  migration fields — all compiled to the matching wrangler keys. R2 buckets and
  queue producers now accept an object form (`{ bucketName | queue, remote, … }`)
  in addition to the existing string shorthand, which keeps working unchanged.

## 1.0.0-next.42

### Patch Changes

- 6fab0de: Resolve a dependency's `package.json` without going through its `exports` map.
  The CLI's type generation (and other package-specifier resolution, e.g. for
  cross-package Durable Objects) read `<package>/package.json` via export-enforcing
  resolution, which throws `ERR_PACKAGE_PATH_NOT_EXPORTED` for any package that
  doesn't list `./package.json` in its `exports`. It now finds the package's own
  `package.json` via a `node_modules` directory walk first, so such packages
  resolve correctly.

## 1.0.0-next.41

### Patch Changes

- db98dd9: Declare `typescript` as a runtime dependency. The `devflare/test` and
  `devflare/vite` entrypoints (and the CLI's worker transforms) import the
  TypeScript compiler at runtime, but it was only listed under `devDependencies`,
  so a real consumer install resolved it only by accident inside this monorepo and
  failed (`Cannot find package 'typescript'`) elsewhere. The dist verifier now
  also asserts every package the bundle imports is a declared dependency, so this
  class of gap is caught before publish.

## 1.0.0-next.40

### Patch Changes

- d08f0c4: Fix unimportable published bundles. The JS build is now produced by rolldown
  instead of `bun build`, whose bundler miscompiled the package's re-export
  barrels (it emitted `export { x }` with no binding, so importing `devflare`,
  `devflare/runtime`, `devflare/test`, and other entrypoints threw
  `Export 'x' is not defined in module` under node). Declaration files now also
  carry explicit relative-import extensions so the types resolve under
  `node16`/`nodenext`, not only `bundler`. A new post-build step loads every
  published entrypoint under node before publishing, so an unimportable bundle can
  never ship again.

## 1.0.0-next.39

### Patch Changes

- bef00b5: Test & CI quality hardening:

  - Fix a user-facing `NaN` in four test-helper error messages: a stray unary `+`
    before a template literal made `defineXHandler`-not-found errors print
    `...\nNaN` instead of the expected-signature hint (`src/test/scheduled.ts`,
    `email.ts`, `queue.ts`, `tail.ts`).
  - Promote four structural lint rules from warning to error now that the codebase
    is clean of them (`noBannedTypes`, `noAssignInExpressions`,
    `noShadowRestrictedNames`, `noImplicitAnyLet`) — guarding against regressions
    like an accidental `any` `let` or a global-shadowing name. (`useConst` stays a
    warning: its three remaining hits are deferred-assignment values captured by a
    closure before assignment, where `const` is unsafe.)
  - The container integration test no longer reports a silent green pass when no
    container engine is present — it now properly skips, so green never implies the
    real-engine path ran.
  - Add focused unit tests for the dev-server reload queue (debounce/coalescing,
    error isolation) and the test-context binding-hint extractor.
  - Clearer signals for known limitations: the off-Bun service/DO bundling fallback
    now names the affected worker and the consequence; the mock queue consumer's
    unreachable `failed` path is accurately documented; and the integration
    port-allocation helper no longer hands the same ephemeral port to two
    back-to-back callers in one process.

## 1.0.0-next.38

### Patch Changes

- c813821: Make the Cloudflare support documentation accurate and surface offline-binding gaps:

  - Reconcile the docs-site support labels with the authoritative support matrix:
    Hyperdrive, Browser Rendering, Worker Loaders, Images, Media Transformations,
    and Analytics Engine are now marked **Limited** (each has a code-backed local
    gap — e.g. Hyperdrive `connect()` and Worker Loaders `getDurableObjectClass()`
    throw) instead of overstating them as Full.
  - Correct the matrix's Analytics Engine classification: it is **not** an inherent
    remote-only boundary — it is simply not yet wired into the local Miniflare
    worker (Miniflare's native plugin is a write-shape-only no-op).
  - Document that Static Assets (`assets`) and cross-worker Tail consumers
    (`tailConsumers`) are compiled for deploy but not served/delivered locally, and
    that Cron triggers' scheduled handlers are locally invokable via the test layer
    (distinct from the wired `files.tail` handler surface).
  - `createOfflineEnv()` / `createOfflineBindings()` now report core storage
    bindings (KV/D1/R2/Queues/Durable Objects/Services) that are present in config
    but only available via `createTestContext()` as explicit `missingFixtures`
    entries, instead of leaving `env.X` silently `undefined`.

## 1.0.0-next.37

### Patch Changes

- cd82c4e: Fix the Durable Object WebSocket relay through the live dev gateway, and harden
  proxied-response limits:

  - **DO WebSocket `stub.connect()` was broken in both directions.** The live
    gateway (`gateway-runtime.ts`) and the bridge client disagreed on the WS-data
    wire format: the client sent/expected binary `WsData` frames while the gateway
    only read string frames inbound and emitted a JSON `ws.data` envelope outbound,
    so every payload was silently dropped. The gateway now speaks the same binary
    `WsData` frame format as the client (matching `wire.ts`/`server.ts`) in both
    directions, honoring the TEXT flag. Added an end-to-end integration test that
    round-trips binary (both directions) and a text frame through the real gateway.
  - **Oversized proxied responses now throw a clear error** instead of being
    silently truncated. DO and service-binding `fetch()` responses reached through
    the bridge are delivered inline over the WebSocket and are capped at 512 KB
    (workerd's ~1 MB message limit); a larger body now throws, with the boundary
    documented in the Cloudflare support matrix. Large R2 objects remain exempt
    (HTTP transfer side-channel).
  - The gateway handshake now advertises only the capabilities it actually
    implements end-to-end (`ws-relay`, `http-transfer`); `streams` is no longer
    advertised since proxied responses are inlined, not streamed.

## 1.0.0-next.36

### Patch Changes

- 0b47000: Docs & contract-honesty fixes:

  - The README `devflare/config` row listed ~40 names that the lightweight config
    entry never exported; it now lists the real surface (`defineConfig`, `env`,
    `preview`, `ref`). The doc-integrity guard that should have caught this was
    validating the wrong module (`src/config` instead of `src/config-entry`) — now
    fixed, plus a new reverse guard asserts the exhaustively-listed entrypoints
    document every public export, and a guard checks every README `/docs/` link
    resolves to a real slug.
  - Document the previously-undocumented `vars` export (and the config error
    classes) on the `devflare` row; note that `devflare/vite` re-exports Vite's
    types (so type-checking it needs `vite` installed); fix two broken README
    `/docs/` links; add `files.tail` to the full config examples.
  - Align `DEFAULT_BRIDGE_PORT`/`DEFAULT_HTTP_PORT` to the real dev runtime ports
    (8787/8788) — the bare bridge-client auto-connect fallback pointed at a dead
    8686 port.
  - Remove the contradictory orphan `event` control-message shape from the v2 aux
    vocabulary before the wire surface freezes (the live consumer uses the
    `EventMsg { topic, data }` shape); drop stale "to be implemented" comments from
    the CLI dispatcher; clarify that `test:coverage` is unit-only.

## 1.0.0-next.35

### Patch Changes

- e7b82e3: Packaging & release hygiene:

  - Ship a real MIT `LICENSE` file (the manifest declared `"license": "MIT"` but no
    license text was distributed) and populate the previously-empty `author` field.
  - Add a `SECURITY.md` vulnerability-reporting policy.
  - Fix the published CLI to run on Node: the `bin` shebang was `#!/usr/bin/env bun`
    while `engines` declared Node ≥20 support — a Node-only global install couldn't
    start. The built `dist` uses no Bun-only runtime APIs (verified running under
    Node), so the shebang is now `#!/usr/bin/env node` and both runtimes are honored.
  - Add the `"./package.json"` subpath export so resolver/metadata tooling can read
    it (the `exports` map otherwise blocks `require('devflare/package.json')`).
  - Declare `"sideEffects": false` to let consumer bundlers tree-shake devflare
    (the public modules carry no load-bearing import side effects).

## 1.0.0-next.34

### Patch Changes

- 3f9f0d7: Phase F — architecture & docs close-out. Documentation now correctly describes
  `files.tail` as a public config key (auto-discovers `src/tail.ts` when unset,
  accepts a custom path, or `false` to disable) alongside the other handler
  surfaces, and the watched dev-reload root lists include tail. Adds a clarifying
  note that the phased `resolveResources({ phase })` seam is the canonical
  resource-resolution path and the remaining env-overlay-only callers are by
  design. Removes a stale test-helper reference in the binding-hints comment.

  Internal: the lint gate no longer fights `changeset version` over `package.json`
  (its JSON writer multi-lines arrays that biome's formatter would re-collapse), so
  CI stays green on the commit after every release bump.

## 1.0.0-next.33

### Patch Changes

- e27dd17: Fix default service-binding RPC worker discovery: `resolveServiceBindings` /
  `findDefaultServiceWorkerEntrypoint` now also resolve a package's root-level
  `worker.{ts,js}` (not only `src/worker.{ts,js}`), so a referenced worker that
  keeps its entrypoint at the package root exposes its default RPC surface in
  local tests and dev. (Also: internal quality gates — biome lint is now enforced
  on the published package and releases are gated on typecheck + unit tests.)

## 1.0.0-next.32

### Patch Changes

- 38f576f: Clarify the Cloudflare permission-group display-name fallback warning: it now
  points maintainers at `refresh-permission-groups` (which regenerates the verified
  ids) instead of asking them to hand-edit the generated id map. Also adds a deploy
  & secrets maturity guide (auto-provisioning matrix, partial-deploy orphan
  behavior, secrets boundary, per-environment scoping, permission-group refresh).

## 1.0.0-next.31

### Minor Changes

- dcc56e7: Add three first-class top-level Cloudflare deploy-policy config options: `logpush`, `uploadSourceMaps`, and `keepVars` (all `boolean`).

  - `logpush` — send Trace Events from this Worker to Workers Logpush (does not create a Logpush job). Compiles to the Wrangler `logpush` key.
  - `uploadSourceMaps` — include source maps when uploading this Worker. Compiles to the Wrangler `upload_source_maps` key.
  - `keepVars` — keep dashboard-managed vars when Wrangler deploys this Worker (default `false`). Compiles to the Wrangler `keep_vars` key.

  All three are per-environment overridable like other deploy-surface scalars. They previously required `wrangler.passthrough`.

## 1.0.0-next.30

### Minor Changes

- 3cd03ab: Phase B — close the unfinished bridge/shim code paths:

  - **Large response bodies over the bridge**: oversized Response bodies (>512 KB)
    now stream over the binary channel chunked into ≤512 KB frames (under
    workerd's ~1 MB WebSocket message limit) and round-trip byte-identically,
    including bodies over 2 MB. Oversized request bodies throw a clear, actionable
    error (the local gateway has no streamed-request-body consumer).
  - **Durable Object `namespace.jurisdiction()`** now threads the jurisdiction
    through to the wire instead of silently dropping it.
  - **Bridge event subscriptions**: `client.on(topic, cb)` registry is wired
    (consumer side; no gateway emits `event` frames yet).
  - **R2 multipart upload** is now fully implemented in the test mock
    (`createMultipartUpload`/`uploadPart`/`complete`/`abort`), composing parts into
    the object store so `r2.get()` resolves the completed object.
  - **Documented local limitations** (clear errors, not silent failures): Worker
    Loader dynamic Durable Object classes (injectable stub), `startTls()` on the
    DO WebSocket proxy, and Hyperdrive raw `connect()` (use `connectionString`).
    The two Hyperdrive shims are de-duplicated into `src/shims/local-hyperdrive.ts`.

## 1.0.0-next.29

### Minor Changes

- db83da3: Remove the `@deprecated ContextUnavailableError` alias. Its rich
  `nodejs_compat`-mentioning message is now produced by the canonical
  `ContextAccessError` via the new `ContextAccessError.contextUnavailable()`
  factory, and the per-surface getters / `getContext()` throw that instead.

  Breaking removal (pre-1.0): code that imported `ContextUnavailableError` from
  `devflare/runtime` must switch to `ContextAccessError`. Code that caught
  `ContextAccessError` is unaffected — the removed alias was already a subclass,
  so the thrown instances are still `instanceof ContextAccessError`.

## 1.0.0-next.28

### Minor Changes

- 2303d83: Add `server` config option to set the `devflare dev` runtime instance host and port. Configure `server: { host, port }` in `devflare.config.ts` to control the address the local Miniflare runtime binds to. CLI flags (`--runtime-port`, `--runtime-host`) and environment variables (`DEVFLARE_RUNTIME_PORT`, `DEVFLARE_RUNTIME_HOST`) take precedence over the config value, which in turn overrides the `127.0.0.1:8787` default.
