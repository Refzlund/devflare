import { dirname, resolve } from 'pathe'
import type { DevflareConfig } from '../config'
import { getRouteDirectoryCandidate } from '../worker-entry/routes'
import {
	DEFAULT_EMAIL_ENTRY_FILES,
	DEFAULT_FETCH_ENTRY_FILES,
	DEFAULT_QUEUE_ENTRY_FILES,
	DEFAULT_SCHEDULED_ENTRY_FILES,
	type WorkerSurfacePaths,
	hasWorkerSurfacePaths,
	resolveWorkerSurfacePaths
} from '../worker-entry/surface-paths'

const DEFAULT_TRANSPORT_ENTRY_FILES = [
	'src/transport.ts',
	'src/transport.js',
	'src/transport.mts',
	'src/transport.mjs'
] as const

export { hasWorkerSurfacePaths, type WorkerSurfacePaths }

export const resolveMainWorkerSurfacePaths = resolveWorkerSurfacePaths

function addWorkerWatchRoots(
	roots: Set<string>,
	cwd: string,
	configuredPath: string | false | null | undefined,
	defaultEntries: readonly string[]
): void {
	if (configuredPath === false || configuredPath === null) {
		return
	}

	if (typeof configuredPath === 'string' && configuredPath) {
		roots.add(dirname(resolve(cwd, configuredPath)))
		return
	}

	for (const defaultEntry of defaultEntries) {
		roots.add(dirname(resolve(cwd, defaultEntry)))
	}
}

export function collectWorkerWatchRoots(
	cwd: string,
	config: DevflareConfig,
	mainWorkerSurfacePaths: WorkerSurfacePaths
): string[] {
	const roots = new Set<string>()

	for (const surfacePath of Object.values(mainWorkerSurfacePaths)) {
		if (surfacePath) {
			roots.add(dirname(surfacePath))
		}
	}

	addWorkerWatchRoots(roots, cwd, config.files?.fetch, DEFAULT_FETCH_ENTRY_FILES)
	addWorkerWatchRoots(roots, cwd, config.files?.queue, DEFAULT_QUEUE_ENTRY_FILES)
	addWorkerWatchRoots(roots, cwd, config.files?.scheduled, DEFAULT_SCHEDULED_ENTRY_FILES)
	addWorkerWatchRoots(roots, cwd, config.files?.email, DEFAULT_EMAIL_ENTRY_FILES)
	addWorkerWatchRoots(roots, cwd, config.files?.transport, DEFAULT_TRANSPORT_ENTRY_FILES)

	const routeDirectory = getRouteDirectoryCandidate(cwd, config)
	if (routeDirectory) {
		roots.add(routeDirectory.absoluteDir)
	}

	return [...roots]
}
