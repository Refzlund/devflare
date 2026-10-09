---
'devflare': patch
---

Report a deploy as successful only when something OBSERVED the upload, so a run that uploaded
nothing fails instead of printing `Deployed successfully!`.

Measured in production on 2026-09-03 (devflare `1.0.0-next.86`, wrangler `4.128.0`, a Linux CI
runner): `devflare deploy --prod` ran `bunx wrangler deploy` for a Worker that did not exist on the
account. Wrangler printed its version banner and nothing else — no `Total Upload`, no
`Deployed … triggers`, no version id — and exited `0`. Devflare's own preview-registry sync then
warned with Cloudflare error `10007 This Worker does not exist on your account`, and the command
finished `[success] Deployed successfully!`, exit `0`. The Worker still did not exist afterwards.
The CI job was green.

The single failure branch was `deployProc.exitCode !== 0`, and **a zero exit code is not evidence of
an upload**: wrangler exits 0 on a dry run, on an aborted deploy, and on that run. Every
`resolveVersionIdFrom…` fallback threw into `versionRecoveryDiagnostics`, which was collected and
then never printed by anything. The one check that would have caught it — "wrangler did not return a
version id, so devflare cannot prove which version Cloudflare accepted" — sat behind
`DEVFLARE_VERIFY_DEPLOYMENT`, an opt-in that was off.

That check is now **always on**, and it is the deploy's terminal rule: reaching the end without a
resolved Worker version id is a failure, exit `1`, whatever wrangler's exit code said.
`DEVFLARE_VERIFY_DEPLOYMENT` still opts in to the extra control-plane round-trips *on top* of it
(confirming the version record exists and that a deployment references it); it never was, and is no
longer read as, the switch that decides whether an upload happened.

The failure now says which of four things occurred, read from the ND-JSON wrangler appends to
`WRANGLER_OUTPUT_FILE_PATH` — the only in-band record devflare has, since wrangler is spawned with
`stdio: 'inherit'` and its console never reaches this process:

- wrangler wrote no structured output at all, so it exited before reaching its deploy command;
- wrangler ran but recorded no `deploy` / `version-upload` entry, so it exited without uploading;
- wrangler recorded that entry with a null version id — what it writes for a dry run or an aborted
  deploy;
- wrangler recorded its own `command-failed`, quoted verbatim.

Each is followed by what every Cloudflare fallback reported (previously dropped on the floor), or by
a note that no account id resolved so the API cross-check never ran, plus the path to wrangler's own
debug log for that run where it wrote one. On a deploy that recovers through a fallback, those same
diagnostics are now printed dimmed rather than discarded.

**The legitimate unchanged-bundle case is unaffected.** When the built Worker and its configuration
are identical to what is already live, Cloudflare keeps the existing version; devflare resolves the
id from the current active deployment, prints its existing verification note, and exits `0` — the
deploy is proven, it simply proves the version that was already there.
`DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT` still turns that into a failure for callers that need
a new version. A deploy also still needs no Cloudflare credentials: wrangler's own structured output
is sufficient evidence on its own, and is checked first.

Classified `patch` because nothing in the public API changed and this is a bug fix — but it is a
behaviour change worth reading twice: a pipeline whose deploys were silently doing nothing will
start failing, which is the point.

Graded by a unit suite over the structured-output read and the failure message, and by four
integration cases: the production incident reproduced end to end (exits `1`, never prints
`Deployed successfully!`), wrangler's own deploy record accepted with no Cloudflare request at all,
a null-version-id record rejected as the dry-run/abort it is, and the unchanged-bundle path still
succeeding with its note. Eleven mutants were built against them; all eleven died, and the precise
one — re-gating the new check behind `DEVFLARE_VERIFY_DEPLOYMENT` — dies to the two new integration
cases and to nothing else in the deploy suite.
