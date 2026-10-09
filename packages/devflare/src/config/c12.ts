// =============================================================================
// c12 — the one way devflare loads a config file
// =============================================================================
/*
	Both devflare.config.* and devflare.workspace.* are TypeScript or ESM files
	loaded through c12, which hands them to jiti. They meet here so what makes a
	reload correct is done once.

	→ GOTCHA (Bun on Windows): jiti's `tryNative`, on by default under Bun,
	  imports the file with the runtime's own `import()` and then evicts it with
	  `delete require.cache[path]` to honour `moduleCache: false`. jiti spells the
	  key with forward slashes; Bun on Windows keys its module registry with
	  backslashes, so the delete finds nothing and every later load returns the
	  first evaluation. With c12 3.3.4 that made `devflare dev` keep serving a
	  devflare.config.ts the developer had already changed. devflare evicts the
	  file itself, under the platform's own spelling of its path.
	→ NOTE: `jitiOptions: { tryNative: false }` also cures the stale read, and
	  was rejected. It makes jiti load its bundled Babel under Bun, and Babel
	  replaces `Error.prepareStackTrace` for the whole process with a wrapper
	  that hands Bun's native one objects that are not Errors. Bun's throws
	  "First argument must be an Error object", so any later
	  `Error.captureStackTrace(object)` in the same process fails, and Vite's
	  own module initialisation is one such call.
	→ Only the config file itself is evicted. A module it imports keeps its
	  first evaluation under Bun. That is not new: measured on Windows and on
	  Linux, c12 2.0.4 and 3.3.4 both reuse an edited imported module.
	→ c12 is resolved from the project first, so a project that installs its
	  own copy (a monorepo vendoring devflare per app) loads with that copy.
*/

import { createRequire } from 'node:module'
import { resolve as resolveNativePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { LoadConfigOptions, UserInputConfig } from 'c12'
import { join } from 'pathe'

type C12Module = typeof import('c12')

/** The process-wide module registry; Bun shares it between `require` and `import`. */
const moduleRegistry = createRequire(import.meta.url).cache

/**
 * @description Imports c12, preferring the copy the project at `cwd` resolves.
 * @param cwd - the project directory
 * @returns the c12 module
 */
async function importC12(cwd: string): Promise<C12Module> {
	let entry: string
	try {
		entry = createRequire(join(cwd, '__devflare__.cjs')).resolve('c12')
	} catch {
		entry = createRequire(import.meta.url).resolve('c12')
	}
	return (await import(pathToFileURL(entry).href)) as C12Module
}

/**
 * @description Loads a config file through c12, then evicts it from the module
 * registry so the next load evaluates the file as it is then.
 * @param options - c12's own options; `cwd` is required
 * @returns c12's result: the loaded config and the file it came from
 */
export async function loadWithC12<T extends UserInputConfig>(
	options: LoadConfigOptions<T> & { cwd: string }
) {
	const { loadConfig } = await importC12(options.cwd)
	const result = await loadConfig<T>(options)

	// `_configFile` is set only when c12 actually found and loaded a file.
	if (result._configFile) {
		delete moduleRegistry[resolveNativePath(result._configFile)]
	}
	return result
}
