import { resolve } from 'pathe'
import type { DevflareConfig } from '../config'

export const DEFAULT_FETCH_ENTRY_FILES = [
	'src/fetch.ts',
	'src/fetch.js',
	'src/fetch.mts',
	'src/fetch.mjs'
] as const

export const DEFAULT_QUEUE_ENTRY_FILES = [
	'src/queue.ts',
	'src/queue.js',
	'src/queue.mts',
	'src/queue.mjs'
] as const

export const DEFAULT_SCHEDULED_ENTRY_FILES = [
	'src/scheduled.ts',
	'src/scheduled.js',
	'src/scheduled.mts',
	'src/scheduled.mjs'
] as const

export const DEFAULT_EMAIL_ENTRY_FILES = [
	'src/email.ts',
	'src/email.js',
	'src/email.mts',
	'src/email.mjs'
] as const

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