---
'devflare': minor
---

Tell a reloading runtime apart from a dev server that is not running, so a mid-reload request stops
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
