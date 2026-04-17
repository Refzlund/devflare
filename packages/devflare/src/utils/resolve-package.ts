// =============================================================================
// Package Specifier Resolution — Resolves package specifiers to filesystem paths
// =============================================================================

import { resolve, dirname } from 'pathe'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const NOT_FOUND_CODES = new Set(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'])

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false
	}

	const code = (error as { code?: unknown }).code
	return typeof code === 'string' && NOT_FOUND_CODES.has(code)
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
		? specifier.split('/').slice(0, 2).join('/') // @scope/pkg
		: specifier.split('/')[0] // pkg

	const subpath = specifier.startsWith('@')
		? specifier.split('/').slice(2).join('/') // subpath after @scope/pkg
		: specifier.split('/').slice(1).join('/') // subpath after pkg

	// Try to find the package's package.json via ESM-first resolution.
	// A missing package falls back to a path-based guess to preserve
	// historical behavior callers depend on; other errors (syntax,
	// permission, etc.) propagate from resolveSpecifier().
	const pkgJsonPath = resolveSpecifier(`${parts}/package.json`, fromDir)
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
			const targetPath = typeof exportPath === 'string' ? exportPath : exportPath.default || exportPath.import
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
