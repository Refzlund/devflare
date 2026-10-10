---
'devflare': patch
---

Fix `devflare dev` and `devflare workspace dev` treating a Vite child as stopped as soon as it
had been sent `SIGTERM`, on macOS and Linux.

The stop waited on `ChildProcess.killed`, which Node and Bun set the moment a signal is sent,
not when the child exits. So it returned at once, before Vite had shut down, and the `SIGKILL`
meant for a child still running three seconds later was never sent. Stopping now waits for the
spawned child to exit, and sends it `SIGKILL` if it is still running three seconds after
`SIGTERM`.

Stopping also no longer sits out a three-second wait for a child that had already exited before
the stop began listening for its exit, as one did on Windows when it exited while `taskkill` was
still running.
