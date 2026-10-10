#!/usr/bin/env bash
# Builds devflare when the project resolves it to an UNBUILT workspace checkout.
#
# A published install ships `dist/` and no `src/`, so for every consumer this
# script finds nothing to do. Inside the devflare monorepo, `devflare` resolves
# to `packages/devflare` through a workspace link, and that package's `bin`
# runs `dist/cli/index.js` under node (it only runs `src/` under bun). Nothing
# else in a deploy job builds it, so without this step every deploy that
# invokes the bin through node — `bunx devflare deploy`, or a package script
# calling it — died with ERR_MODULE_NOT_FOUND on `dist/cli/index.js`.
#
# The whole `build` script runs, not just the CLI bundle: every export in the
# package's `exports` map points into `dist/`, so a project whose own build
# imports `devflare/vite` or `devflare/sveltekit` needs all of it.
#
# Run it from the directory the deploy runs in, so resolution matches the
# deploy's own.
set -euo pipefail

package_dir="$(node -e '
const { existsSync } = require("node:fs")
const { dirname, join } = require("node:path")

let manifestPath
try {
	manifestPath = require.resolve("devflare/package.json", { paths: [process.cwd()] })
} catch (error) {
	// Any resolution failure means nothing here for this step to build: absent
	// (MODULE_NOT_FOUND), or a published devflare from before next.35 whose
	// exports map has no "./package.json" (ERR_PACKAGE_PATH_NOT_EXPORTED). A
	// workspace checkout always exports it. The deploy command reports a truly
	// missing devflare itself, in its own words.
	console.error("devflare/package.json does not resolve here (" + (error && error.code) + ").")
	process.exit(0)
}

const packageDir = dirname(manifestPath)
const isWorkspaceSource = existsSync(join(packageDir, "src", "cli", "index.ts"))
const isBuilt = existsSync(join(packageDir, "dist", "cli", "index.js"))
if (isWorkspaceSource && !isBuilt) process.stdout.write(packageDir)
')"

if [ -z "$package_dir" ]; then
	echo 'No unbuilt devflare workspace checkout resolves from here; nothing to build.'
	exit 0
fi

echo "devflare resolves to an unbuilt workspace checkout at ${package_dir}; building it."
bun run --cwd "$package_dir" build
