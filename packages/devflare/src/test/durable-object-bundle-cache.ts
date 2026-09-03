// =============================================================================
// Test context — Durable Object bundle cache
// =============================================================================
// `createTestContext()` bundles the Durable Object module graph with
// `Bun.build`. Rebuilding it per context is not merely slow: it is what keeps a
// consumer with Durable Objects to one test FILE per bun process. The report
// (devflare 1.0.0-next.74, bun 1.3.x, a monorepo whose Durable Objects import
// shared workspace packages) is that once the test runner has loaded a module
// on that graph, Bun.build will not re-read it and fails against an ordinary
// file with a misleading errno — `EISDIR reading file: .../store/d1.ts`,
// naming whichever graph module the tests also import. It does not reproduce on
// every project or every bun build, so treat it as a hazard the cache removes
// rather than a law. One process per test file is the workaround that buys
// around it, and it multiplies the whole per-file setup cost by the file count.
//
// So the bundle is cached ON DISK, keyed by content. A build then happens only
// when an input actually changed, and a process that starts with a warm cache
// never calls Bun.build at all — which is what makes batching files into one
// process possible.
//
// → KEY: the cache root comes from the CONFIG directory, never from
//   `DEVFLARE_DIR`. Concurrent test slots each get their own `DEVFLARE_DIR`; a
//   cache underneath it would be private per slot, and the sharing that lets
//   the first process pay the build for all of them would be lost.
// → KEY: freshness covers what the bundler READ — every file on the transitive
//   graph — AND what it RESOLVED THROUGH, which content hashes alone cannot
//   see: the `package.json` / `tsconfig.json` files above those inputs, and a
//   listing of each directory they came from, so a newly added `mod.ts` beside
//   an already-bundled `mod.js` counts as a change. It also covers WHO built
//   it: bundler version, devflare version and the build options.
// → GOTCHA: a resolver input that did not exist at build time and sits outside
//   those directories — a `tsconfig.json` added further up, a newly installed
//   package that shadows one — can still leave a hit stale. Deleting
//   `.devflare/test-bundles/` forces a rebuild.
// → GOTCHA: the virtual entry file is deliberately NOT a tracked input. Its
//   source IS the cache key, and it is only rewritten on a miss, so a hit must
//   not depend on what happens to sit at that path.
// =============================================================================

import { createHash } from 'node:crypto'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_GENERATED_DIR } from '../utils/generated-dir'

/** Sub-directory of the config's `.devflare` root holding cached bundles. */
const BUNDLE_CACHE_DIR = 'test-bundles'

/**
 * Bumped whenever the manifest shape changes, so an older devflare's cache
 * files are treated as misses rather than misread.
 */
const CACHE_FORMAT_VERSION = 2

/**
 * Files that steer MODULE RESOLUTION rather than being modules themselves.
 * The bundler never hands them to a load hook, so they reach the manifest by
 * being looked for above every input instead.
 */
const RESOLVER_FILES = ['package.json', 'tsconfig.json'] as const

/**
 * What a cached bundle was built from, beyond the files it read.
 */
export interface DurableObjectBundleIdentity {
	/**
	 * The generated virtual entry module. It names the transport file and every
	 * Durable Object class + script path, so it identifies the bundle.
	 */
	entry: string
	/**
	 * Bundler version, devflare version and the build options — everything that
	 * can change the output while every input file stays byte-identical.
	 */
	builder: string
}

/**
 * One cached bundle, as stored on disk.
 */
interface CachedDurableObjectBundle {
	/** The {@link CACHE_FORMAT_VERSION} this file was written by. */
	version: number
	/** {@link DurableObjectBundleIdentity.entry}, compared verbatim. */
	entry: string
	/** {@link DurableObjectBundleIdentity.builder}, compared verbatim. */
	builder: string
	/**
	 * Every file that fed the build — the module graph plus the resolver files
	 * above it — paired with the content hash it had at build time. Any
	 * mismatch, a deleted file included, makes the entry stale.
	 */
	inputs: Array<[path: string, contentHash: string]>
	/**
	 * Each directory an input came from, paired with a hash of its entry names.
	 * This is what notices a file being ADDED: nothing already tracked changes
	 * when `mod.ts` appears beside the `mod.js` that was bundled, but that
	 * directory's listing does.
	 */
	directories: Array<[path: string, listingHash: string]>
	/** The bundled ESM the gateway script embeds. */
	script: string
}

/**
 * Bundles already validated in this process, keyed the same way as the disk
 * cache. Saves re-reading and re-parsing the manifest; it does NOT skip the
 * freshness check, because a test may legitimately edit a source file between
 * two contexts and must see the change.
 */
const validatedBundles = new Map<string, CachedDurableObjectBundle>()

/**
 * @param text - Any string.
 * @returns Its hex sha256 digest.
 */
function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/**
 * Hash a file's current contents.
 *
 * @param filePath - Absolute path to a file that fed the build.
 * @returns The hex sha256 digest, or `null` when the file no longer exists —
 *   which counts as a change, since the bundle cannot still reflect it.
 */
function hashFileContents(filePath: string): string | null {
	if (!existsSync(filePath)) {
		return null
	}

	return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

/**
 * Hash which names a directory holds, ignoring their contents.
 *
 * @param directoryPath - Absolute path to a directory an input came from.
 * @returns The hex sha256 digest of its sorted entry names, or `null` when the
 *   directory is gone.
 */
function hashDirectoryListing(directoryPath: string): string | null {
	if (!existsSync(directoryPath)) {
		return null
	}

	return hashText([...readdirSync(directoryPath)].sort().join('\n'))
}

/**
 * Every directory from `filePath`'s own up to the filesystem root.
 *
 * @param filePath - An absolute file path.
 * @returns The chain, nearest first.
 */
function ancestorDirectories(filePath: string): string[] {
	const directories: string[] = []
	let current = dirname(filePath)

	while (true) {
		directories.push(current)

		const parent = dirname(current)
		if (parent === current) {
			return directories
		}

		current = parent
	}
}

/**
 * Widen the module graph into everything the build actually depended on.
 *
 * @param graphPaths - The files the bundler loaded, absolute.
 * @returns The files to hash (graph + the resolver files above them) and the
 *   directories to list (the ones the graph files came from). Both deduplicated
 *   and sorted, so a manifest is stable whatever order the bundler loaded in.
 */
function collectBuildInputs(graphPaths: string[]): { files: string[]; directories: string[] } {
	const files = new Set(graphPaths)
	const directories = new Set<string>()
	const searched = new Set<string>()

	for (const graphPath of graphPaths) {
		directories.add(dirname(graphPath))

		for (const directory of ancestorDirectories(graphPath)) {
			if (searched.has(directory)) {
				break
			}
			searched.add(directory)

			for (const resolverFile of RESOLVER_FILES) {
				const candidate = join(directory, resolverFile)
				if (existsSync(candidate)) {
					files.add(candidate)
				}
			}
		}
	}

	return {
		files: [...files].sort(),
		directories: [...directories].sort()
	}
}

/**
 * @param identity - What the caller is about to build.
 * @returns A file-system safe key for its manifest.
 */
function bundleCacheKey(identity: DurableObjectBundleIdentity): string {
	return hashText(`${CACHE_FORMAT_VERSION}\n${identity.builder}\n${identity.entry}`)
}

/**
 * @param configDir - The directory holding the devflare config under test.
 * @returns The directory cached bundles live in.
 */
function bundleCacheDir(configDir: string): string {
	return join(configDir, DEFAULT_GENERATED_DIR, BUNDLE_CACHE_DIR)
}

/**
 * @param configDir - The directory holding the devflare config under test.
 * @param key - A {@link bundleCacheKey}.
 * @returns The absolute path of that entry's manifest.
 */
function bundleCachePath(configDir: string, key: string): string {
	return join(bundleCacheDir(configDir), `${key}.json`)
}

/**
 * Decide whether a cached entry still describes the tree on disk.
 *
 * @param cached - A manifest read from disk or from the in-process map.
 * @param identity - What the caller is about to build.
 * @returns True when the entry was produced by the same builder from the same
 *   sources, and nothing it read or resolved through has changed since.
 */
function isBundleFresh(
	cached: CachedDurableObjectBundle,
	identity: DurableObjectBundleIdentity
): boolean {
	if (
		cached.version !== CACHE_FORMAT_VERSION ||
		cached.entry !== identity.entry ||
		cached.builder !== identity.builder
	) {
		return false
	}

	for (const [inputPath, contentHash] of cached.inputs) {
		if (hashFileContents(inputPath) !== contentHash) {
			return false
		}
	}

	for (const [directoryPath, listingHash] of cached.directories) {
		if (hashDirectoryListing(directoryPath) !== listingHash) {
			return false
		}
	}

	return true
}

/**
 * Read a manifest, tolerating a file that cannot be understood.
 *
 * @param cachePath - Absolute path of a manifest file.
 * @returns The parsed manifest, or `null` when it is absent or unparseable. A
 *   cache file is a derived artifact — one that got truncated or was written by
 *   a future devflare must degrade to a rebuild, never break a test run.
 */
function readBundleManifest(cachePath: string): CachedDurableObjectBundle | null {
	if (!existsSync(cachePath)) {
		return null
	}

	const contents = readFileSync(cachePath, 'utf-8')

	try {
		return JSON.parse(contents) as CachedDurableObjectBundle
	} catch {
		return null
	}
}

/**
 * Look up an already-built bundle.
 *
 * @param configDir - The directory holding the devflare config under test.
 * @param identity - What the caller would otherwise build.
 * @returns The bundled ESM when a fresh entry exists, else `null`. A hit costs
 *   one hash per input and — crucially — no call into Bun.build.
 */
export function readCachedDurableObjectBundle(
	configDir: string,
	identity: DurableObjectBundleIdentity
): string | null {
	const key = bundleCacheKey(identity)

	const remembered = validatedBundles.get(key)
	if (remembered && isBundleFresh(remembered, identity)) {
		return remembered.script
	}

	const cached = readBundleManifest(bundleCachePath(configDir, key))
	if (!cached || !isBundleFresh(cached, identity)) {
		validatedBundles.delete(key)
		return null
	}

	validatedBundles.set(key, cached)
	return cached.script
}

/**
 * Store a freshly built bundle.
 *
 * Written to a unique temporary file and renamed into place, so a concurrent
 * test process can only ever observe a whole manifest.
 *
 * @param configDir - The directory holding the devflare config under test.
 * @param identity - What produced the bundle.
 * @param graphPaths - Every module the bundler loaded, absolute. The virtual
 *   entry itself must not be among them (see this file's header). A path that
 *   is not a readable file — nothing the bundler resolves from disk produces
 *   one — is left untracked rather than blocking the entry, since an unhashable
 *   input would mean never caching at all.
 * @param script - The bundled ESM to hand back on a later hit.
 */
export function writeCachedDurableObjectBundle(
	configDir: string,
	identity: DurableObjectBundleIdentity,
	graphPaths: string[],
	script: string
): void {
	const { files, directories } = collectBuildInputs(graphPaths)

	const inputs: Array<[string, string]> = []
	for (const filePath of files) {
		const contentHash = hashFileContents(filePath)
		if (contentHash !== null) {
			inputs.push([filePath, contentHash])
		}
	}

	const listings: Array<[string, string]> = []
	for (const directoryPath of directories) {
		const listingHash = hashDirectoryListing(directoryPath)
		if (listingHash !== null) {
			listings.push([directoryPath, listingHash])
		}
	}

	const key = bundleCacheKey(identity)
	const entry: CachedDurableObjectBundle = {
		version: CACHE_FORMAT_VERSION,
		entry: identity.entry,
		builder: identity.builder,
		inputs,
		directories: listings,
		script
	}
	validatedBundles.set(key, entry)

	const cacheDir = bundleCacheDir(configDir)
	mkdirSync(cacheDir, { recursive: true })

	const cachePath = bundleCachePath(configDir, key)
	const pendingPath = join(cacheDir, `${key}.${process.pid}-${Date.now()}.tmp`)
	writeFileSync(pendingPath, JSON.stringify(entry), 'utf-8')

	try {
		renameSync(pendingPath, cachePath)
	} catch (error) {
		// Windows refuses a rename onto a file another process holds open, which
		// is exactly what a second test slot writing this same key looks like.
		// Their manifests agree — same identity, same tree — so theirs serves ours
		// too; anything else (a full disk, a read-only tree) still surfaces.
		rmSync(pendingPath, { force: true })
		if (!existsSync(cachePath)) {
			throw error
		}
	}
}

/**
 * Forget every bundle validated in this process.
 *
 * Exported for a test that rebuilds the same entry from a rewritten source tree
 * within one process. Consumers do not need it — the freshness check already
 * covers an edit between two contexts — but deleting `.devflare/test-bundles/`
 * is the way to force a rebuild from outside the process.
 */
export function __resetDurableObjectBundleCache(): void {
	validatedBundles.clear()
}
