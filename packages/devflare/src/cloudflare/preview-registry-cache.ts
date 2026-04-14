import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
	DEVFLARE_PREVIEW_REGISTRY_DATABASE,
	type PreviewRegistryCacheFile,
	type PreviewRegistryContext
} from './preview-registry-types'

const DEVFLARE_CACHE_DIR = '.devflare'
const PREVIEW_REGISTRY_CACHE_FILE = 'preview-registry.json'

function getDevflareCacheDir(): string {
	const override = process.env.DEVFLARE_CACHE_DIR?.trim()
	if (override) {
		return override
	}

	return join(homedir(), DEVFLARE_CACHE_DIR)
}

function getPreviewRegistryCachePath(): string {
	return join(getDevflareCacheDir(), PREVIEW_REGISTRY_CACHE_FILE)
}

function getPreviewRegistryCacheKey(accountId: string, databaseName: string): string {
	return `${accountId}:${databaseName}`
}

function readPreviewRegistryCache(): PreviewRegistryCacheFile {
	const cachePath = getPreviewRegistryCachePath()
	if (!existsSync(cachePath)) {
		return {}
	}

	try {
		const content = readFileSync(cachePath, 'utf-8')
		return JSON.parse(content) as PreviewRegistryCacheFile
	} catch {
		return {}
	}
}

function writePreviewRegistryCache(cache: PreviewRegistryCacheFile): void {
	try {
		const cacheDir = getDevflareCacheDir()
		if (!existsSync(cacheDir)) {
			mkdirSync(cacheDir, { recursive: true })
		}

		writeFileSync(getPreviewRegistryCachePath(), JSON.stringify(cache, null, '\t'), 'utf-8')
	} catch {
		// Best-effort local cache only.
	}
}

export function getRegistryDatabaseName(databaseName?: string): string {
	return databaseName?.trim() || DEVFLARE_PREVIEW_REGISTRY_DATABASE
}

export function getCachedPreviewRegistryContext(
	accountId: string,
	databaseName: string
): PreviewRegistryContext | null {
	const entry = readPreviewRegistryCache().registries?.[getPreviewRegistryCacheKey(accountId, databaseName)]
	if (!entry?.databaseId) {
		return null
	}

	return {
		accountId: entry.accountId,
		databaseId: entry.databaseId,
		databaseName: entry.databaseName,
		created: false
	}
}

export function cachePreviewRegistryContext(registry: PreviewRegistryContext): void {
	const cache = readPreviewRegistryCache()
	const registries = cache.registries ?? {}
	registries[getPreviewRegistryCacheKey(registry.accountId, registry.databaseName)] = {
		accountId: registry.accountId,
		databaseId: registry.databaseId,
		databaseName: registry.databaseName,
		updatedAt: new Date().toISOString()
	}
	writePreviewRegistryCache({
		...cache,
		registries
	})
}

export function clearCachedPreviewRegistryContext(accountId: string, databaseName: string): void {
	const cache = readPreviewRegistryCache()
	if (!cache.registries) {
		return
	}

	delete cache.registries[getPreviewRegistryCacheKey(accountId, databaseName)]
	writePreviewRegistryCache(cache)
}
