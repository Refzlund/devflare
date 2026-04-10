// =============================================================================
// Package Specifier Resolution — Resolves package specifiers to filesystem paths
// =============================================================================

import { resolve, dirname } from 'pathe'
import { readFileSync, existsSync } from 'node:fs'

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

	// Package specifier - try to resolve via require.resolve or Bun.resolveSync
	try {
		// For scoped packages like @scope/pkg/subpath, we need to find the package root
		// and then navigate to the subpath
		const parts = specifier.startsWith('@')
			? specifier.split('/').slice(0, 2).join('/') // @scope/pkg
			: specifier.split('/')[0] // pkg

		const subpath = specifier.startsWith('@')
			? specifier.split('/').slice(2).join('/') // subpath after @scope/pkg
			: specifier.split('/').slice(1).join('/') // subpath after pkg

		// Try to find the package's package.json
		const pkgJsonPath = require.resolve(`${parts}/package.json`, { paths: [fromDir] })
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
	} catch {
		// Fallback: treat as relative path
		return resolve(fromDir, specifier)
	}
}
