---
'devflare': patch
---

Report a slow Vite start truthfully. `devflare dev` and the workspace dev server waited 15 s for
Vite's local URL, then warned that it "could not be confirmed" — which read as a fault — and
stopped listening, so a Vite that served at 25 s (a cold SvelteKit start) was never reported. The
workspace then printed `Workspace ready` about ten seconds before that app was serving.

Startup still waits at most 15 s per Vite app, on purpose: the child is registered for teardown
only once that wait returns, and the workspace server waits at most 30 s for a starting server
before tearing down, so an unbounded wait would leave a Vite that never serves running after
Ctrl+C. What changed is what happens after the bound:

- at 15 s an info line says Vite is still starting and that its URL will be reported;
- the URL is reported when it arrives (`started on http://… (after 25.9s)`);
- a Vite that exits after the bound is reported as an error, which it never was before;
- a Vite that has neither served nor exited after 60 s gets a warning that it may be stuck;
- the workspace says `Workspace started — …; waiting for Vite: "app"` and prints
  `Workspace ready` only once every Vite app serves, or a warning naming any that exited first.

A Vite that exits within the first 15 s still fails startup, as before. Once the 15 s have passed,
an exit or a stall is not reported while the dev server is stopping. The workspace server also no
longer spawns the next app's Vite once a stop has been requested.
