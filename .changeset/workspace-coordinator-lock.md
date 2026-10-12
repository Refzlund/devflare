---
'devflare': minor
---

`devflare workspace dev` now holds a lock on its persist directory, so two coordinators can no
longer open one store at once. Before this, a second coordinator started on the same persist dir
opened the same SQLite files as the first, and nothing said so.

The coordinator takes an EXCLUSIVE SQLite lock on `<persist>.coordinator.lock` before anything
opens the store, and holds it until `stop()` has disposed of Miniflare. Beside the lock it writes a
holder note, `<persist>.coordinator.lock.json`:
`{"pid":…,"role":"coordinator","since":…,"store":"<persist>"}`. The lock is an OS lock
(`LockFileEx` on Windows, `fcntl` elsewhere), taken through `bun:sqlite` under Bun and `node:sqlite`
under Node 22.13+. On an older Node, devflare warns once and runs without it.

**When the lock is held**, a starting coordinator:

- refuses at once when a live `coordinator` holds it;
- waits for a live holder whose note carries a `deadline` until `min(deadline + 10 s, start + 120 s)`,
  then refuses. Another program can therefore take the lock to keep coordinators out while it works
  on the store;
- waits 10 s for anything else (no note, a pid that is not running), then refuses.

Every refusal names the holder's pid, role, since and deadline, and the lock path. A refusal with no
usable note also names the filesystem as a possible cause, because `fcntl` locks are unreliable on
WSL2's `/mnt/c`, SMB/NFS shares and Docker bind mounts. Ctrl+C during a wait ends it.

**On by default whenever the workspace persists.** Opt out with `DEVFLARE_PERSIST_LOCK=0`, or with
`createWorkspaceDevServer({ persistLock: false })`. `--no-persist` takes no lock. There is no
manifest key on purpose: the manifest schema is strict, so a new key would make an older devflare
reject the manifest. A lock file that cannot be opened fails the start loudly, naming the path and
the opt-out.

**A programmatic `start()` that rejects keeps the lock.** Call `stop()` even when `start()` fails,
as the CLI does.

**A crash frees the lock, but that is not a guarantee the store is closed.** workerd is spawned
non-detached, so a hard-killed coordinator can leave workerd running with the store open after the
lock reads free. A tool that must know the store is closed should also check the coordinator's ports
and processes.
