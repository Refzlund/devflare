---
'devflare': patch
---

Load a devflare config once per process in `createTestContext()`, instead of once per context.

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
