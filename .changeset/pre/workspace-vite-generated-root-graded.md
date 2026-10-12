---
'devflare': patch
---

No behaviour change: the per-app generated root from the previous release is now graded where it was
not. The workspace server takes its Vite-child launcher through the same internal seam as its
Miniflare loader and coordinator lock, so a test can check that each Vite app's child is handed, as
its `DEVFLARE_DIR`, the directory its own generated files were written to. A second case runs the
built CLI with two apps under an absolute `DEVFLARE_DIR` and checks that each app answers with its own
code.
