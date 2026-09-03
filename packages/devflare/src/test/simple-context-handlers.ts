// =============================================================================
// Handler-path resolution for createTestContext
// =============================================================================
// Resolves the per-handler file paths (`fetch`, `queue`, `scheduled`, `email`,
// `tail`) that createTestContext wires into the test bridge. Honours
// user-supplied `config.files.*` overrides, falls back to convention-based
// defaults under `src/`, and treats `false` as an explicit opt-out.
// =============================================================================

import { join } from 'path'
import type { DevflareConfig } from '../config'
import { type RouteDiscoveryResult, discoverRoutes } from '../worker-entry/routes'

const DEFAULT_FETCH_PATH = 'src/fetch.ts'
const DEFAULT_QUEUE_PATH = 'src/queue.ts'
const DEFAULT_SCHEDULED_PATH = 'src/scheduled.ts'
const DEFAULT_EMAIL_PATH = 'src/email.ts'
const DEFAULT_TAIL_PATH = 'src/tail.ts'

export interface ResolvedHandlerPaths {
	fetch: string | null
	queue: string | null
	scheduled: string | null
	email: string | null
	tail: string | null
	routes: RouteDiscoveryResult | null
}

async function resolveHandlerPath(
	configDir: string,
	configValue: string | false | undefined,
	defaultPath: string
): Promise<string | null> {
	if (typeof configValue === 'string') {
		return configValue
	}
	if (configValue === false) {
		return null
	}

	const defaultAbsolute = join(configDir, defaultPath)
	try {
		const fs = await import('fs/promises')
		await fs.access(defaultAbsolute)
		return defaultPath
	} catch {
		return null
	}
}

export async function resolveHandlerPaths(
	configDir: string,
	config: DevflareConfig
): Promise<ResolvedHandlerPaths> {
	const [fetch, queue, scheduled, email, tail, routes] = await Promise.all([
		resolveHandlerPath(configDir, config.files?.fetch, DEFAULT_FETCH_PATH),
		resolveHandlerPath(configDir, config.files?.queue, DEFAULT_QUEUE_PATH),
		resolveHandlerPath(configDir, config.files?.scheduled, DEFAULT_SCHEDULED_PATH),
		resolveHandlerPath(configDir, config.files?.email, DEFAULT_EMAIL_PATH),
		resolveHandlerPath(configDir, config.files?.tail, DEFAULT_TAIL_PATH),
		discoverRoutes(configDir, config)
	])

	return { fetch, queue, scheduled, email, tail, routes }
}
