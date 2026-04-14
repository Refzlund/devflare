import { dirname, relative, resolve } from 'pathe'
import type { DevflareConfig } from '../config'
import { normalizeDOBinding } from '../config/schema'
import { resolveConfigForEnvironment } from '../config/resolve'
import { findDurableObjectClasses } from '../transform/durable-object'
import { DEFAULT_DO_PATTERN, findFiles } from '../utils/glob'
import { discoverRoutes, type RouteDiscoveryResult } from './routes'
import {
	resolveWorkerSurfacePaths,
	type WorkerSurfacePaths
} from './surface-paths'

interface GeneratedRouteModuleImport {
	identifier: string
	importPath: string
	filePath: string
	routePath: string
	segmentsJson: string
}

interface GeneratedDurableObjectExport {
	importPath: string
	filePath: string
	classNames: string[]
}

export interface PrepareComposedWorkerEntrypointOptions {
	devInternalEmail?: boolean
}

function toImportSpecifier(fromFilePath: string, toFilePath: string): string {
	const specifier = relative(dirname(fromFilePath), toFilePath).replace(/\\/g, '/')
	return specifier.startsWith('.') ? specifier : `./${specifier}`
}

function createGeneratedRouteModuleImports(
	entryPath: string,
	routeDiscovery: RouteDiscoveryResult | null
): GeneratedRouteModuleImport[] {
	if (!routeDiscovery) {
		return []
	}

	return routeDiscovery.routes.map((route, index) => ({
		identifier: `__devflareRouteModule${index}`,
		importPath: toImportSpecifier(entryPath, route.absolutePath),
		filePath: route.filePath,
		routePath: route.routePath,
		segmentsJson: JSON.stringify(route.segments)
	}))
}

async function createGeneratedDurableObjectExports(
	entryPath: string,
	cwd: string,
	config: DevflareConfig
): Promise<GeneratedDurableObjectExport[]> {
	if (config.files?.durableObjects === false || !config.bindings?.durableObjects) {
		return []
	}

	const localClassNames = new Set(
		Object.values(config.bindings.durableObjects)
			.map((binding) => normalizeDOBinding(binding))
			.filter((binding) => !binding.scriptName)
			.map((binding) => binding.className)
	)

	if (localClassNames.size === 0) {
		return []
	}

	const fs = await import('node:fs/promises')
	const pattern = typeof config.files?.durableObjects === 'string'
		? config.files.durableObjects
		: DEFAULT_DO_PATTERN
	const matchedFiles = await findFiles(pattern, { cwd })
	const exports: GeneratedDurableObjectExport[] = []
	const discoveredClassNames = new Set<string>()

	for (const filePath of matchedFiles) {
		try {
			const code = await fs.readFile(filePath, 'utf-8')
			const classNames = findDurableObjectClasses(code).filter((className) => localClassNames.has(className))

			if (classNames.length === 0) {
				continue
			}

			for (const className of classNames) {
				discoveredClassNames.add(className)
			}

			exports.push({
				importPath: toImportSpecifier(entryPath, filePath),
				filePath,
				classNames
			})
		} catch {
			continue
		}
	}

	const missingClassNames = Array.from(localClassNames).filter((className) => !discoveredClassNames.has(className))

	if (missingClassNames.length > 0) {
		throw new Error(
			`Failed to discover local Durable Object class${missingClassNames.length === 1 ? '' : 'es'} ${missingClassNames.join(', ')} for worker composition. `
			+ `Ensure files.durableObjects matches the source file pattern for your do.* files.`
		)
	}

	return exports
}

function needsComposedWorkerEntrypoint(
	cwd: string,
	surfacePaths: WorkerSurfacePaths,
	config: DevflareConfig,
	routeDiscovery: RouteDiscoveryResult | null
): boolean {
	const hasAdditionalWorkerSurfaces = Boolean(
		surfacePaths.queue
		|| surfacePaths.scheduled
		|| surfacePaths.email
		|| routeDiscovery?.routes.length
	)

	if (hasAdditionalWorkerSurfaces) {
		return true
	}

	if (!surfacePaths.fetch) {
		return false
	}

	const assetsDirectory = config.assets?.directory
	if (assetsDirectory) {
		const generatedAssetsWorkerPath = resolve(cwd, assetsDirectory, '_worker.js')
		if (surfacePaths.fetch === generatedAssetsWorkerPath) {
			return false
		}
	}

	return Boolean(
		surfacePaths.fetch
	)
}

function getComposedWorkerEntrypointSource(
	surfaceImportPaths: WorkerSurfacePaths,
	configuredLocalSendEmailBindings: Record<string, {
		destinationAddress?: string
		allowedDestinationAddresses?: string[]
		allowedSenderAddresses?: string[]
	}> = {},
	durableObjectExports: readonly GeneratedDurableObjectExport[] = [],
	routeImports: readonly GeneratedRouteModuleImport[] = [],
	options: PrepareComposedWorkerEntrypointOptions = {}
): string {
	const importLines = [`import { createEmailEvent, createFetchEvent, createQueueEvent, createRouteResolve, createScheduledEvent, invokeFetchModule, matchFetchRoute, runWithEventContext, setLocalSendEmailBindings } from 'devflare/runtime'`]
	const moduleFallbackLines: string[] = []
	const durableObjectExportLines = durableObjectExports.map(({ classNames, importPath }) => `export { ${classNames.join(', ')} } from '${importPath}'`)
	const localSendEmailBindings = JSON.stringify(configuredLocalSendEmailBindings)
	const routeManifestEntries = routeImports.map(({ identifier, filePath, routePath, segmentsJson }) => {
		return `\t{ filePath: ${JSON.stringify(filePath)}, routePath: ${JSON.stringify(routePath)}, segments: ${segmentsJson}, module: ${identifier} }`
	})

	const registerSurfaceModule = (identifier: string, importPath: string | null) => {
		if (importPath) {
			importLines.push(`import * as ${identifier} from '${importPath}'`)
			return
		}

		moduleFallbackLines.push(`const ${identifier} = {}`)
	}

	registerSurfaceModule('__devflareFetchModule', surfaceImportPaths.fetch)
	registerSurfaceModule('__devflareQueueModule', surfaceImportPaths.queue)
	registerSurfaceModule('__devflareScheduledModule', surfaceImportPaths.scheduled)
	registerSurfaceModule('__devflareEmailModule', surfaceImportPaths.email)

	for (const routeImport of routeImports) {
		importLines.push(`import * as ${routeImport.identifier} from '${routeImport.importPath}'`)
	}

	const includeDevInternalEmail = options.devInternalEmail === true
	const devInternalEmailHelpers = includeDevInternalEmail
		? `
function __devflareCreateEmailHeaders(rawBody) {
	const headers = new Headers()
	const lines = rawBody.split(/\\r?\\n/)

	for (const line of lines) {
		if (line.trim() === '') {
			break
		}

		const colonIndex = line.indexOf(':')
		if (colonIndex <= 0) {
			continue
		}

		headers.append(line.slice(0, colonIndex).trim(), line.slice(colonIndex + 1).trim())
	}

	return headers
}

function __devflareCreateEmailRawStream(rawBody) {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(rawBody))
			controller.close()
		}
	})
}

async function __devflareHandleInternalEmail(request, env, ctx) {
	if (!__devflareEmailHandler) {
		return new Response('Email handler not configured', { status: 501 })
	}

	const from = request.headers.get('x-devflare-email-from') || 'unknown@example.com'
	const to = request.headers.get('x-devflare-email-to') || 'worker@example.com'
	const rawBody = await request.text()
	const emailMessage = {
		from,
		to,
		headers: __devflareCreateEmailHeaders(rawBody),
		raw: __devflareCreateEmailRawStream(rawBody),
		rawSize: rawBody.length,
		setReject(reason) {
			console.warn('[Devflare email rejected]', reason)
		},
		async forward(rcptTo) {
			console.log('[Devflare email forwarded]', rcptTo)
			return Promise.resolve()
		},
		async reply(message) {
			console.log('[Devflare email reply sent]', message?.from)
			return Promise.resolve()
		}
	}

	const __devflareEvent = createEmailEvent(emailMessage, env, ctx)

	await runWithEventContext(
		__devflareEvent,
		() => __devflareEmailHandler(__devflareEvent, env, ctx)
	)

	return new Response(JSON.stringify({ ok: true, from, to }), {
		headers: { 'Content-Type': 'application/json' }
	})
}
`
		: ''

	return `
${importLines.join('\n')}
${moduleFallbackLines.join('\n')}
${durableObjectExportLines.join('\n')}

setLocalSendEmailBindings(${localSendEmailBindings})

const __devflareHasFetchModule = ${surfaceImportPaths.fetch ? 'true' : 'false'}
const __devflareRoutes = [
${routeManifestEntries.join(',\n')}
]
const __devflareHasRoutes = __devflareRoutes.length > 0

const __devflareResolveHandler = (module, namedExport) => {
	const defaultExport = module.default

	if (typeof defaultExport === 'function') {
		return defaultExport
	}

	if (defaultExport && typeof defaultExport[namedExport] === 'function') {
		return defaultExport[namedExport].bind(defaultExport)
	}

	if (typeof module[namedExport] === 'function') {
		return module[namedExport]
	}

	return null
}

const __devflareQueueHandler = __devflareResolveHandler(__devflareQueueModule, 'queue')
const __devflareScheduledHandler = __devflareResolveHandler(__devflareScheduledModule, 'scheduled')
const __devflareEmailHandler = __devflareResolveHandler(__devflareEmailModule, 'email')
${devInternalEmailHelpers}

export default {
	...(${surfaceImportPaths.fetch || routeImports.length > 0 || includeDevInternalEmail ? 'true' : 'false'}
		? {
			async fetch(request, env, ctx) {
				${includeDevInternalEmail ? `const url = new URL(request.url)

				if (
					request.headers.get('x-devflare-event') === 'email'
					&& url.pathname === '/_devflare/internal/email'
				) {
					return __devflareHandleInternalEmail(request, env, ctx)
				}

				` : ''}const __devflareInitialRouteMatch = __devflareHasRoutes ? matchFetchRoute(__devflareRoutes, request) : null
				const __devflareEvent = createFetchEvent(request, env, ctx, {
					params: __devflareInitialRouteMatch?.params ?? {}
				})
				return runWithEventContext(
					__devflareEvent,
					() => invokeFetchModule(
						__devflareFetchModule,
						__devflareEvent,
						__devflareHasRoutes
							? createRouteResolve(__devflareRoutes, __devflareEvent)
							: undefined
					)
				)
			}
		}
		: {}),
	...(__devflareQueueHandler
		? {
			async queue(batch, env, ctx) {
				const __devflareEvent = createQueueEvent(batch, env, ctx)
				return runWithEventContext(
					__devflareEvent,
					() => __devflareQueueHandler(__devflareEvent, env, ctx)
				)
			}
		}
		: {}),
	...(__devflareScheduledHandler
		? {
			async scheduled(controller, env, ctx) {
				const __devflareEvent = createScheduledEvent(controller, env, ctx)
				return runWithEventContext(
					__devflareEvent,
					() => __devflareScheduledHandler(__devflareEvent, env, ctx)
				)
			}
		}
		: {}),
	...(__devflareEmailHandler
		? {
			async email(message, env, ctx) {
				const __devflareEvent = createEmailEvent(message, env, ctx)
				return runWithEventContext(
					__devflareEvent,
					() => __devflareEmailHandler(__devflareEvent, env, ctx)
				)
			}
		}
		: {})
}
`.trimStart()
}

export async function prepareComposedWorkerEntrypoint(
	cwd: string,
	config: DevflareConfig,
	environment?: string,
	options: PrepareComposedWorkerEntrypointOptions = {}
): Promise<string | null> {
	const resolvedConfig = resolveConfigForEnvironment(config, environment)
	if (
		resolvedConfig.wrangler?.passthrough
		&& Object.prototype.hasOwnProperty.call(resolvedConfig.wrangler.passthrough, 'main')
	) {
		return null
	}

	const surfacePaths = await resolveWorkerSurfacePaths(cwd, resolvedConfig)
	const routeDiscovery = await discoverRoutes(cwd, resolvedConfig)
	if (!needsComposedWorkerEntrypoint(cwd, surfacePaths, resolvedConfig, routeDiscovery)) {
		return null
	}

	const fs = await import('node:fs/promises')
	const entryDir = resolve(cwd, '.devflare', 'worker-entrypoints')
	const entryPath = resolve(entryDir, 'main.ts')

	await fs.mkdir(entryDir, { recursive: true })

	const surfaceImportPaths: WorkerSurfacePaths = {
		fetch: surfacePaths.fetch ? toImportSpecifier(entryPath, surfacePaths.fetch) : null,
		queue: surfacePaths.queue ? toImportSpecifier(entryPath, surfacePaths.queue) : null,
		scheduled: surfacePaths.scheduled ? toImportSpecifier(entryPath, surfacePaths.scheduled) : null,
		email: surfacePaths.email ? toImportSpecifier(entryPath, surfacePaths.email) : null
	}
	const durableObjectExports = await createGeneratedDurableObjectExports(entryPath, cwd, resolvedConfig)
	const routeImports = createGeneratedRouteModuleImports(entryPath, routeDiscovery)

	await fs.writeFile(
		entryPath,
		getComposedWorkerEntrypointSource(
			surfaceImportPaths,
			resolvedConfig.bindings?.sendEmail ?? {},
			durableObjectExports,
			routeImports,
			options
		)
	)

	return '.devflare/worker-entrypoints/main.ts'
}
