---
'devflare': patch
---

Fix `devflare workspace dev` leaving each Vite app running after it stops, on Windows.

The coordinator stopped a Vite child with a plain `kill()`. The child is a `bunx` shim, and on
Windows that ends only the shim: Vite, and the workerd its Cloudflare adapter starts, kept
running and kept the app's port. Stopping now ends the whole process tree with `taskkill`, as
`devflare dev` already did for its own Vite child. If a child has still not exited three seconds
later, the workspace logs a warning naming the app, its pid and the port it may still hold. On
other platforms the child is sent `SIGTERM`, as before.
