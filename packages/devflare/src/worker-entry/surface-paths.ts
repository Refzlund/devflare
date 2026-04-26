import { resolve } from 'pathe'
import type { DevflareConfig } from '../config'
import { SUPPORTED_WORKER_EXTENSIONS } from './extensions'

const defaultEntriesFor = (surface: string): readonly string[] =>
	SUPPORTED_WORKER_EXTENSIONS.map((ext) => `src/${surface}${ext}`)

export const DEFAULT_FETCH_ENTRY_FILES = defaultEntriesFor('fetch')
export const DEFAULT_QUEUE_ENTRY_FILES = defaultEntriesFor('queue')
export const DEFAULT_SCHEDULED_ENTRY_FILES = defaultEntriesFor('scheduled')
export const DEFAULT_EMAIL_ENTRY_FILES = defaultEntriesFor('email')
export const DEFAULT_TAIL_ENTRY_FILES = defaultEntriesFor('tail')

/**
 * Path prefixes that are known framework / bundler build outputs.
 * A handler path that lives under one of these will not exist on disk
 * until the framework's own build (e.g. `vite build`, `svelte-kit build`)
 * has run, which happens AFTER devflare resolves surface paths.
 */
export const BUILD_OUTPUT_PATH_PREFIXES: readonly string[] = [
	'.svelte-kit/',
	'.adapter-cloudflare/',
	'.next/',
	'.nuxt/',
	'.output/',
	'.vercel/',
	'dist/',
	'build/',
	'.vinxi/',
	'.solid/'
]

/** Returns true when the path looks like a framework build output. */
export function looksLikeBuildArtifactPath(configuredPath: string): boolean {
	const normalised = configuredPath.replace(/\\/g, '/').replace(/^\.\//, '')
	return BUILD_OUTPUT_PATH_PREFIXES.some((prefix) => normalised.startsWith(prefix))
}

export interface WorkerSurfacePaths {
	fetch: string | null
	queue: string | null
	scheduled: string | null
	email: string | null
	tail: string | null
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
			if (looksLikeBuildArtifactPath(configuredPath)) {
				throw new Error(
					`Configured ${surfaceName} handler "${configuredPath}" was not found.\n`
					+ `\n`
					+ `This path looks like a framework build output (e.g. SvelteKit / Vite / Next).\n`
					+ `Devflare resolves handler paths BEFORE your framework runs its build, so the file\n`
					+ `does not exist yet at this stage.\n`
					+ `\n`
					+ `Recommended fix — point devflare at the build artifact via wrangler passthrough\n`
					+ `instead of files.${surfaceName}, so devflare skips composition and lets your\n`
					+ `framework write the worker entry that wrangler/vite then picks up:\n`
					+ `\n`
					+ `    files: { ${surfaceName}: false },\n`
					+ `    wrangler: {\n`
					+ `        passthrough: { main: '${configuredPath}' }\n`
					+ `    }\n`
					+ `\n`
					+ `Alternatively, run your framework build (e.g. \`vite build\`) before \`devflare build\`,\n`
					+ `or move the handler to a source file that exists at config time.`
				)
			}
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
		email: await resolveWorkerHandlerPath(cwd, config.files?.email, DEFAULT_EMAIL_ENTRY_FILES, 'email'),
		tail: await resolveWorkerHandlerPath(cwd, config.files?.tail, DEFAULT_TAIL_ENTRY_FILES, 'tail')
	}
}

export function hasWorkerSurfacePaths(surfacePaths: WorkerSurfacePaths): boolean {
	return Object.values(surfacePaths).some((surfacePath) => typeof surfacePath === 'string' && surfacePath.length > 0)
}
