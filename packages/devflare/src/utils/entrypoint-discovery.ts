// =============================================================================
// Entrypoint Discovery — Shared utilities for finding WorkerEntrypoint classes
// =============================================================================
// Used by:
// - CLI types command (async, glob pattern)
// - Test context bundling (sync, single directory)
// =============================================================================

import { readFileSync } from 'fs'
import { DEFAULT_ENTRYPOINT_PATTERN, findFiles, findFilesSync } from './glob'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Information about a discovered entrypoint class
 */
export interface DiscoveredEntrypoint {
	className: string
	filePath: string
}

// -----------------------------------------------------------------------------
// Core Discovery Logic
// -----------------------------------------------------------------------------

/**
 * Regex pattern to find WorkerEntrypoint class exports
 * Matches: export class ClassName extends WorkerEntrypoint
 */
const ENTRYPOINT_CLASS_PATTERN = /export\s+class\s+(\w+)\s+extends\s+WorkerEntrypoint/g

/**
 * Find WorkerEntrypoint classes in source code
 * @param code - Source code to search
 * @returns Array of class names found
 */
export function findEntrypointClasses(code: string): string[] {
	const classes: string[] = []

	// Reset regex state for reuse
	ENTRYPOINT_CLASS_PATTERN.lastIndex = 0

	let match
	while ((match = ENTRYPOINT_CLASS_PATTERN.exec(code)) !== null) {
		classes.push(match[1])
	}

	return classes
}

// -----------------------------------------------------------------------------
// Directory Discovery (Sync)
// -----------------------------------------------------------------------------

/**
 * Discover entrypoint classes from a glob pattern synchronously.
 * Respects `.gitignore` automatically.
 *
 * @param cwd - Working directory for glob resolution
 * @param pattern - Glob pattern for entrypoint files (default: recursive `ep.*.{ts,js}` matching)
 * @returns Array of discovered entrypoints
 */
export function discoverEntrypointsSync(
	cwd: string,
	pattern = DEFAULT_ENTRYPOINT_PATTERN
): DiscoveredEntrypoint[] {
	const discovered: DiscoveredEntrypoint[] = []

	try {
		const files = findFilesSync(pattern, { cwd })

		for (const file of files) {
			try {
				const code = readFileSync(file, 'utf-8')
				const classNames = findEntrypointClasses(code)

				for (const className of classNames) {
					discovered.push({ className, filePath: file })
				}
			} catch {
				// Skip files that can't be read
			}
		}
	} catch {
		// Glob failed — return empty result
	}

	return discovered
}

// -----------------------------------------------------------------------------
// Glob Discovery (Async)
// -----------------------------------------------------------------------------

/**
 * Discover entrypoint classes from ep.*.ts files using glob pattern (async).
 * Respects .gitignore automatically.
 *
 * @param cwd - Working directory for glob
 * @param pattern - Glob pattern for ep.*.ts files (default: **​/ep.*.{ts,js})
 * @returns Array of discovered entrypoints
 */
export async function discoverEntrypointsAsync(
	cwd: string,
	pattern = DEFAULT_ENTRYPOINT_PATTERN
): Promise<DiscoveredEntrypoint[]> {
	const fs = await import('node:fs/promises')
	const discovered: DiscoveredEntrypoint[] = []

	const files = await findFiles(pattern, { cwd })

	for (const filePath of files) {
		try {
			const code = await fs.readFile(filePath, 'utf-8')
			const classNames = findEntrypointClasses(code)

			for (const className of classNames) {
				discovered.push({ className, filePath })
			}
		} catch {
			// Skip files that can't be read
		}
	}

	return discovered
}
