import { resolve } from 'pathe'
import type { DevflareConfig } from '../config'
import { SUPPORTED_WORKER_EXTENSIONS } from './extensions'

const defaultEntriesFor = (surface: string): readonly string[] =>
	SUPPORTED_WORKER_EXTENSIONS.map((ext) => `src/${surface}${ext}`)

export const DEFAULT_FETCH_ENTRY_FILES = defaultEntriesFor('fetch')
export const DEFAULT_QUEUE_ENTRY_FILES = defaultEntriesFor('queue')
export const DEFAULT_SCHEDULED_ENTRY_FILES = defaultEntriesFor('scheduled')
export const DEFAULT_EMAIL_ENTRY_FILES = defaultEntriesFor('email')

export interface WorkerSurfacePaths {
	fetch: string | null
	queue: string | null
	scheduled: string | null
	email: string | null
}

export async function resolveWorkerHandlerPath(
	cwd: string,
	configuredPath: string | false | undefined,
	defaultEntries: readonly string[],
	surfaceName = 'worker'
): Promise<string | null> {
	if (configuredPath === false) {
		return null
	}

	const fs = await import('node:fs/promises')

	if (typeof configuredPath === 'string' && configuredPath) {
		const absolutePath = resolve(cwd, configuredPath)
		try {
			await fs.access(absolutePath)
			return absolutePath
		} catch {
			throw new Error(`Configured ${surfaceName} handler "${configuredPath}" was not found`)
		}
	}

	for (const defaultEntry of defaultEntries) {
		const absolutePath = resolve(cwd, defaultEntry)
		try {
			await fs.access(absolutePath)
			return absolutePath
		} catch {
			continue
		}
	}

	return null
}

export async function resolveWorkerSurfacePaths(
	cwd: string,
	config: DevflareConfig
): Promise<WorkerSurfacePaths> {
	return {
		fetch: await resolveWorkerHandlerPath(cwd, config.files?.fetch, DEFAULT_FETCH_ENTRY_FILES, 'fetch'),
		queue: await resolveWorkerHandlerPath(cwd, config.files?.queue, DEFAULT_QUEUE_ENTRY_FILES, 'queue'),
		scheduled: await resolveWorkerHandlerPath(cwd, config.files?.scheduled, DEFAULT_SCHEDULED_ENTRY_FILES, 'scheduled'),
		email: await resolveWorkerHandlerPath(cwd, config.files?.email, DEFAULT_EMAIL_ENTRY_FILES, 'email')
	}
}

export function hasWorkerSurfacePaths(surfacePaths: WorkerSurfacePaths): boolean {
	return Object.values(surfacePaths).some((surfacePath) => typeof surfacePath === 'string' && surfacePath.length > 0)
}