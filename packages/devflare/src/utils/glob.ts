// =============================================================================
// Glob Utilities — Gitignore-aware file matching
// =============================================================================
// Uses globby for fast file discovery with automatic .gitignore support.
// All glob patterns in devflare should use these utilities.
// =============================================================================

import { globby, globbySync } from 'globby'

// -----------------------------------------------------------------------------
// Default Patterns
// -----------------------------------------------------------------------------

/** Default glob pattern for Durable Object discovery */
export const DEFAULT_DO_PATTERN = '**/do.*.{ts,js}'

/** Default glob pattern for WorkerEntrypoint discovery */
export const DEFAULT_ENTRYPOINT_PATTERN = '**/ep.*.{ts,js}'

/** Default glob pattern for Workflow discovery */
export const DEFAULT_WORKFLOW_PATTERN = '**/wf.*.{ts,js}'

// -----------------------------------------------------------------------------
// Glob Options
// -----------------------------------------------------------------------------

export interface GlobOptions {
	/** Working directory for glob pattern */
	cwd: string
	/** Return absolute paths instead of relative */
	absolute?: boolean
	/** Respect .gitignore files (default: true) */
	gitignore?: boolean
}

// -----------------------------------------------------------------------------
// Glob Functions
// -----------------------------------------------------------------------------

/**
 * Find files matching a glob pattern with .gitignore support.
 * This is the async version for use in CLI commands and bundlers.
 *
 * @param pattern - Glob pattern (e.g., '**​/do.*.{ts,js}')
 * @param options - Glob options
 * @returns Array of matching file paths
 */
export async function findFiles(
	pattern: string | string[],
	options: GlobOptions
): Promise<string[]> {
	const { cwd, absolute = true, gitignore = true } = options

	return globby(pattern, {
		cwd,
		absolute,
		gitignore,
		// Additional ignore patterns for common non-source directories
		// These are fallbacks in case no .gitignore exists
		ignore: ['**/node_modules/**', '**/.devflare/**', '**/dist/**', '**/build/**', '**/.git/**']
	})
}

/**
 * Find files matching a glob pattern synchronously.
 * Use sparingly — prefer async version for better performance.
 *
 * @param pattern - Glob pattern (e.g., '**​/do.*.{ts,js}')
 * @param options - Glob options
 * @returns Array of matching file paths
 */
export function findFilesSync(pattern: string | string[], options: GlobOptions): string[] {
	const { cwd, absolute = true, gitignore = true } = options

	return globbySync(pattern, {
		cwd,
		absolute,
		gitignore,
		ignore: ['**/node_modules/**', '**/.devflare/**', '**/dist/**', '**/build/**', '**/.git/**']
	})
}
