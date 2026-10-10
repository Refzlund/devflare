// =============================================================================
// Shared Durable Object discovery helper
// =============================================================================
// Single source of truth for "walk a glob, return file → DO class names".
// Consumers (vite plugin, dev-server DO bundler, composed-worker entrypoint
// generator, test fixtures) should use these helpers instead of re-rolling
// their own filesystem-walk + `findDurableObjectClasses` loop.
// =============================================================================

import { findDurableObjectClasses } from '../transform/durable-object'
import { findFiles } from '../utils/glob'

export interface DODiscoveryResult {
	/** Map of file path → array of DO class names found in that file */
	files: Map<string, string[]>
	/** Worker name for the auxiliary DO worker */
	workerName: string
}

/**
 * Walk the glob `pattern` under `cwd` and return a map of file path →
 * Durable Object class names declared in that file. Files that fail to read
 * or contain no DO classes are omitted. Respects `.gitignore` automatically
 * (via `findFiles`).
 */
export async function discoverDurableObjectFiles(
	cwd: string,
	pattern: string
): Promise<Map<string, string[]>> {
	const result = new Map<string, string[]>()
	const matchedFiles = await findFiles(pattern, { cwd })
	const fs = await import('node:fs/promises')

	for (const filePath of matchedFiles) {
		try {
			const code = await fs.readFile(filePath, 'utf-8')
			const classNames = findDurableObjectClasses(code)
			if (classNames.length > 0) {
				result.set(filePath, classNames)
			}
		} catch (error) {
			console.warn(`[devflare] Failed to read DO file: ${filePath}`, error)
		}
	}

	return result
}

/**
 * Vite-plugin-shaped wrapper around `discoverDurableObjectFiles`. Returns a
 * `DODiscoveryResult` carrying the discovered file map plus the auxiliary
 * worker name.
 */
export async function discoverDurableObjects(
	projectRoot: string,
	pattern: string,
	workerName: string
): Promise<DODiscoveryResult> {
	const files = await discoverDurableObjectFiles(projectRoot, pattern)
	return { files, workerName }
}
