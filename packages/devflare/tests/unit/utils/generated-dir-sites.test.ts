/*
	Guards the DEVFLARE_DIR override against the way it was first shipped BROKEN:
	the generated root was a constant copied into a dozen modules, an eyeball
	inventory caught most of them, and the ONE that actually runs at dev time
	(`vite/plugin-context.ts`) was missed — so the override silently did nothing
	and every generated file still landed in `.devflare`.

	A literal `.devflare` in source is therefore either a deliberate exception
	listed below, or a path that ignores the override. This test is the inventory,
	kept honest by the compiler of record: the filesystem.
*/
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SOURCE_ROOT = resolve(import.meta.dir, '../../../src')

/*
	A `.devflare` literal used to BUILD A PATH: a `resolve()`/`join()` argument, a
	constant assignment, or a segment with a trailing slash. Prose that merely
	mentions the directory — comments, log lines, help text — is not the bug this
	guards, and folding it in would make the exception list unreadable.
*/
const PATH_CONSTRUCTION = [
	// `[^()]|\([^()]*\)` so a nested call — `join(homedir(), '.devflare')` — still matches.
	/(?:resolve|join)\((?:[^()]|\([^()]*\))*['"`]\.devflare['"`]/s,
	/=\s*\[?\s*['"`]\.devflare['"`]/
]

/*
	Paths that legitimately hardcode `.devflare`, each for a reason the override
	must NOT change. Keyed by source path (POSIX), valued by that reason.
*/
const ALLOWED: Record<string, string> = {
	'utils/generated-dir.ts': 'defines the default',
	'browser-shim/server.ts': 'a HOME cache (~/.devflare/chrome), not project state',
	'cloudflare/preferences.ts': 'a HOME cache (~/.devflare/preferences.json)',
	'cloudflare/preview-registry-cache.ts': 'a HOME cache',
	'cloudflare/remote-config.ts': 'a HOME cache',
	'secrets/local-secrets.ts':
		'secrets.local.json is AUTHORED input, not generated output — an instance with its own root must still find the secrets the user wrote',
	'cli/commands/deploy/prepare.ts':
		'reads a build directory the user passes on the command line; the literal is a fallback guess for their layout',
	'test/resolve-service-bindings.ts': 'per-test temp dirs beside the entrypoint under test',
	'test/simple-context-durable-objects.ts': 'a per-test virtual entry path'
}

/**
 * Whether a source file builds a path from a hardcoded `.devflare`.
 *
 * @param path - Absolute path to the source file.
 * @returns `true` when any {@link PATH_CONSTRUCTION} shape matches.
 */
function buildsHardcodedPath(path: string): boolean {
	const source = readFileSync(path, 'utf8')
	return PATH_CONSTRUCTION.some((pattern) => pattern.test(source))
}

/**
 * Every `.ts` file under a directory, recursively.
 *
 * @param directory - Where to start.
 * @returns Absolute paths.
 */
function sourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const path = join(directory, entry)
		if (statSync(path).isDirectory()) return sourceFiles(path)
		return path.endsWith('.ts') ? [path] : []
	})
}

describe('generated-dir override coverage', () => {
	test('no source file hardcodes .devflare outside the documented exceptions', () => {
		const offenders = sourceFiles(SOURCE_ROOT)
			.filter(buildsHardcodedPath)
			.map((path) => relative(SOURCE_ROOT, path).replaceAll('\\', '/'))
			.filter((path) => !(path in ALLOWED))

		expect(offenders).toEqual([])
	})

	// An exception that no longer holds a literal is an exception nobody re-reads —
	// it just accumulates, and the next person trusts a list that has gone stale.
	test('every documented exception still contains one', () => {
		const stale = Object.keys(ALLOWED).filter(
			(path) => !buildsHardcodedPath(resolve(SOURCE_ROOT, path))
		)

		expect(stale).toEqual([])
	})
})
