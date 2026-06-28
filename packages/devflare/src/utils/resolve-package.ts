// =============================================================================
// Package Specifier Resolution — Resolves package specifiers to filesystem paths
// =============================================================================

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'pathe'

const NOT_FOUND_CODES = new Set([
	'MODULE_NOT_FOUND',
	'ERR_MODULE_NOT_FOUND',
	// A package that doesn't list `./package.json` in its `exports` map: this is
	// not a "missing package", just an un-exported subpath. Reading a package's
	// own package.json should never go through `exports`, so treat it as a soft
	// miss and let the caller fall back to a filesystem lookup.
	'ERR_PACKAGE_PATH_NOT_EXPORTED'
])

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false
	}

	const code = (error as { code?: unknown }).code
	return typeof code === 'string' && NOT_FOUND_CODES.has(code)
}

/**
 * Find a package's own `package.json` by walking `node_modules` up the tree,
 * exactly like Node's directory resolution — and crucially WITHOUT consulting
 * the package's `exports` map (a package need not expose `./package.json`).
 */
function findPackageJsonByWalk(packageName: string, fromDir: string): string | null {
	let dir = resolve(fromDir)
	while (true) {
		const candidate = resolve(dir, 'node_modules', packageName, 'package.json')
		if (existsSync(candidate)) {
			// Resolve symlinks so workspace packages (linked into node_modules)
			// report their real source location — downstream resolution computes
			// paths relative to the package dir and needs the real one. This
			// matches Node/Bun's default symlink-resolving module resolution.
			return realpathSync(candidate)
		}
		const parent = dirname(dir)
		if (parent === dir) {
			return null
		}
		dir = parent
	}
}

/**
 * Resolve `specifier` from `fromDir` using ESM-first resolution.
 *
 * Chain:
 *   1. `import.meta.resolve` (Bun exposes this synchronously for ESM packages)
 *   2. `createRequire(fromDir).resolve` (CommonJS fallback)
 *
 * Only swallows MODULE_NOT_FOUND / ERR_MODULE_NOT_FOUND. Any other error
 * (syntax, permission, etc.) is re-thrown.
 */
function resolveSpecifier(specifier: string, fromDir: string): string | null {
	const fromFileUrl = pathToFileURL(resolve(fromDir, 'package.json')).href

	const importMetaResolve = (import.meta as { resolve?: (s: string, p?: string) => string }).resolve
	if (typeof importMetaResolve === 'function') {
		try {
			const resolved = importMetaResolve(specifier, fromFileUrl)
			if (typeof resolved === 'string') {
				return resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved
			}
		} catch (error) {
			if (!isNotFoundError(error)) {
				throw error
			}
			// fall through to createRequire fallback
		}
	}

	try {
		const require_ = createRequire(fromFileUrl)
		return require_.resolve(specifier)
	} catch (error) {
		if (isNotFoundError(error)) {
			return null
		}
		throw error
	}
}

/**
 * Resolve a package specifier to a filesystem path
 * Handles workspace packages like '@devflare/case11-do-shared/devflare.config'
 *
 * @param specifier - Package specifier (e.g., '@scope/pkg/path' or './relative/path')
 * @param fromDir - Directory to resolve relative paths from
 * @returns Resolved filesystem path
 */
export function resolvePackageSpecifier(specifier: string, fromDir: string): string {
	// If it's a relative or absolute path, resolve normally
	if (specifier.startsWith('.') || specifier.startsWith('/') || /^[A-Za-z]:/.test(specifier)) {
		return resolve(fromDir, specifier)
	}

	// For scoped packages like @scope/pkg/subpath, we need to find the package root
	// and then navigate to the subpath
	const parts = specifier.startsWith('@')
		? specifier
				.split('/')
				.slice(0, 2)
				.join('/') // @scope/pkg
		: specifier.split('/')[0] // pkg

	const subpath = specifier.startsWith('@')
		? specifier
				.split('/')
				.slice(2)
				.join('/') // subpath after @scope/pkg
		: specifier.split('/').slice(1).join('/') // subpath after pkg

	// Find the package's own package.json. A node_modules walk is tried first
	// because it does NOT consult the package's `exports` map — reading a
	// package's own package.json must work even when the package omits
	// `./package.json` from `exports`. ESM resolution is the fallback (covers
	// custom layouts the walk misses). A missing package falls back to a
	// path-based guess to preserve historical behavior callers depend on.
	const pkgJsonPath =
		findPackageJsonByWalk(parts, fromDir) ?? resolveSpecifier(`${parts}/package.json`, fromDir)
	if (!pkgJsonPath) {
		return resolve(fromDir, specifier)
	}

	const pkgDir = dirname(pkgJsonPath)

	if (subpath) {
		// Read package.json to check exports
		const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
		const exportPath = pkgJson.exports?.[`./${subpath}`]

		if (exportPath) {
			// Handle export map (can be string or object)
			const targetPath =
				typeof exportPath === 'string' ? exportPath : exportPath.default || exportPath.import
			return resolve(pkgDir, targetPath)
		}

		// Fallback: try direct path resolution
		const directPath = resolve(pkgDir, `${subpath}.ts`)
		if (existsSync(directPath)) return directPath

		const withExt = resolve(pkgDir, subpath)
		if (existsSync(withExt)) return withExt
		if (existsSync(`${withExt}.ts`)) return `${withExt}.ts`
		if (existsSync(`${withExt}.js`)) return `${withExt}.js`
	}

	return pkgDir
}
