---
'devflare': patch
---

Report a slow Vite start truthfully. `devflare dev` and the workspace dev server waited 15 s for
Vite's local URL, then warned that it "could not be confirmed" — which read as a fault — and
stopped listening, so a Vite that served at 25 s (a cold SvelteKit start) was never reported. The
workspace then printed `Workspace ready` about ten seconds before that app was serving.

Startup still waits at most 15 s per Vite app, on purpose: both servers register the child for
teardown only once that wait returns, so an unbounded wait would leave a Vite that never serves
running after Ctrl+C. What changed is what happens after the bound:

- at 15 s an info line says Vite is still starting and that its URL will be reported;
- the URL is reported when it arrives (`started on http://… (after 25.9s)`);
- a Vite that exits after the bound is reported as an error, which it never was before;
- a Vite that has neither served nor exited after 60 s gets a warning that it may be stuck;
- the workspace says `Workspace started — …; waiting for Vite: "app"` and prints
  `Workspace ready` only once every Vite app serves, or a warning naming any that exited first.

A Vite that exits within the first 15 s still fails startup, as before. Nothing is reported for
a child that exits because the dev server is stopping.
