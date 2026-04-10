// =============================================================================
// File Route Discovery
// =============================================================================

import { relative, resolve } from 'pathe'
import type { DevflareConfig } from '../config'
import type { RouteSegment } from '../router/types'
import { findFiles } from '../utils/glob'

export const DEFAULT_ROUTE_DIR = 'src/routes'

const DEFAULT_ROUTE_FILE_PATTERNS = [
	'**/*.ts',
	'**/*.tsx',
	'**/*.js',
	'**/*.jsx',
	'**/*.mts',
	'**/*.mjs'
]

export interface DiscoveredRoute {
	readonly absolutePath: string
	readonly filePath: string
	readonly routePath: string
	readonly segments: readonly RouteSegment[]
}

export interface RouteDiscoveryResult {
	readonly dir: string
	readonly absoluteDir: string
	readonly prefix: string
	readonly routes: readonly DiscoveredRoute[]
}

function normalizeRoutePrefix(prefix?: string): string {
	if (!prefix || prefix === '/') {
		return ''
	}

	const normalized = prefix.startsWith('/') ? prefix : `/${prefix}`
	return normalized.replace(/\/+$/g, '')
}

function createStaticSegmentsFromPrefix(prefix: string): RouteSegment[] {
	if (!prefix) {
		return []
	}

	return prefix
		.split('/')
		.filter(Boolean)
		.map((value) => ({
			type: 'static' as const,
			value
		}))
}

function shouldIgnoreRouteFile(relativePath: string): boolean {
	return relativePath
		.split('/')
		.some((segment) => segment.startsWith('_'))
}

function toRoutePath(segments: readonly RouteSegment[]): string {
	if (segments.length === 0) {
		return '/'
	}

	return `/${segments.map((segment) => {
		if (segment.type === 'static') {
			return segment.value
		}

		if (segment.type === 'param') {
			return `[${segment.name}]`
		}

		if (segment.type === 'rest') {
			return `[...${segment.name}]`
		}

		return `[[...${segment.name}]]`
	}).join('/')}`
}

function getRouteSignature(segments: readonly RouteSegment[]): string {
	if (segments.length === 0) {
		return '/'
	}

	return segments.map((segment) => {
		if (segment.type === 'static') {
			return `static:${segment.value}`
		}

		if (segment.type === 'param') {
			return 'param'
		}

		if (segment.type === 'rest') {
			return 'rest'
		}

		return 'optional-rest'
	}).join('/')
}

function getSegmentPriority(segment: RouteSegment): number {
	if (segment.type === 'static') {
		return 4
	}

	if (segment.type === 'param') {
		return 3
	}

	if (segment.type === 'rest') {
		return 1
	}

	return 0
}

function compareRoutes(a: DiscoveredRoute, b: DiscoveredRoute): number {
	const maxLength = Math.max(a.segments.length, b.segments.length)

	for (let index = 0; index < maxLength; index += 1) {
		const left = a.segments[index]
		const right = b.segments[index]

		if (!left && !right) {
			break
		}

		if (!left) {
			return 1
		}

		if (!right) {
			return -1
		}

		const priorityDifference = getSegmentPriority(right) - getSegmentPriority(left)
		if (priorityDifference !== 0) {
			return priorityDifference
		}

		if (left.type === 'static' && right.type === 'static') {
			const lexicalDifference = left.value.localeCompare(right.value)
			if (lexicalDifference !== 0) {
				return lexicalDifference
			}
		}
	}

	return a.filePath.localeCompare(b.filePath)
}

function parseRouteSegments(relativePath: string, prefixSegments: readonly RouteSegment[]): RouteSegment[] {
	const withoutExtension = relativePath.replace(/\.[^.]+$/u, '')
	const rawSegments = withoutExtension.split('/').filter(Boolean)
	const routeSegments: RouteSegment[] = [...prefixSegments]

	for (let index = 0; index < rawSegments.length; index += 1) {
		const segment = rawSegments[index]
		const isLastSegment = index === rawSegments.length - 1

		if (segment === 'index' && isLastSegment) {
			continue
		}

		const optionalRestMatch = segment.match(/^\[\[\.\.\.(.+)\]\]$/u)
		if (optionalRestMatch) {
			if (!isLastSegment) {
				throw new Error(`Optional rest segment must be the final segment: ${relativePath}`)
			}

			routeSegments.push({
				type: 'optional-rest',
				name: optionalRestMatch[1]
			})
			continue
		}

		const restMatch = segment.match(/^\[\.\.\.(.+)\]$/u)
		if (restMatch) {
			if (!isLastSegment) {
				throw new Error(`Rest segment must be the final segment: ${relativePath}`)
			}

			routeSegments.push({
				type: 'rest',
				name: restMatch[1]
			})
			continue
		}

		const dynamicMatch = segment.match(/^\[(.+)\]$/u)
		if (dynamicMatch) {
			routeSegments.push({
				type: 'param',
				name: dynamicMatch[1]
			})
			continue
		}

		routeSegments.push({
			type: 'static',
			value: segment
		})
	}

	return routeSegments
}

async function directoryExists(dirPath: string): Promise<boolean> {
	const fs = await import('node:fs/promises')

	try {
		const stat = await fs.stat(dirPath)
		return stat.isDirectory()
	} catch {
		return false
	}
}

export function getRouteDirectoryCandidate(cwd: string, config: DevflareConfig): { dir: string; absoluteDir: string; prefix: string } | null {
	const routesConfig = config.files?.routes
	if (routesConfig === false) {
		return null
	}

	const dir = routesConfig?.dir ?? DEFAULT_ROUTE_DIR
	return {
		dir,
		absoluteDir: resolve(cwd, dir),
		prefix: normalizeRoutePrefix(routesConfig?.prefix)
	}
}

export async function discoverRoutes(cwd: string, config: DevflareConfig): Promise<RouteDiscoveryResult | null> {
	const routeDirectory = getRouteDirectoryCandidate(cwd, config)
	if (!routeDirectory) {
		return null
	}

	if (!(await directoryExists(routeDirectory.absoluteDir))) {
		return null
	}

	const prefixSegments = createStaticSegmentsFromPrefix(routeDirectory.prefix)
	const files = await findFiles(DEFAULT_ROUTE_FILE_PATTERNS, {
		cwd: routeDirectory.absoluteDir,
		absolute: true
	})

	const discoveredRoutes: DiscoveredRoute[] = []
	const routeSignatures = new Map<string, string>()

	for (const absolutePath of files) {
		const relativeToRouteDir = relative(routeDirectory.absoluteDir, absolutePath).replace(/\\/g, '/')
		if (shouldIgnoreRouteFile(relativeToRouteDir)) {
			continue
		}

		const segments = parseRouteSegments(relativeToRouteDir, prefixSegments)
		const routePath = toRoutePath(segments)
		const filePath = relative(cwd, absolutePath).replace(/\\/g, '/')
		const signature = getRouteSignature(segments)
		const existingFilePath = routeSignatures.get(signature)

		if (existingFilePath) {
			throw new Error(
				`Conflicting file routes detected for "${routePath}". ` +
				`Both "${existingFilePath}" and "${filePath}" resolve to the same route.`
			)
		}

		routeSignatures.set(signature, filePath)
		discoveredRoutes.push({
			absolutePath,
			filePath,
			routePath,
			segments
		})
	}

	if (discoveredRoutes.length === 0) {
		return null
	}

	discoveredRoutes.sort(compareRoutes)

	return {
		dir: routeDirectory.dir,
		absoluteDir: routeDirectory.absoluteDir,
		prefix: routeDirectory.prefix,
		routes: discoveredRoutes
	}
}
