import { dirname, relative, resolve } from 'pathe'
import type { DevflareConfig } from '../config'
import { resolveConfigForEnvironment } from '../config/resolve'
import { normalizeDOBinding } from '../config/schema'
import { generatedDir } from '../utils/generated-dir'
import { DEFAULT_DO_PATTERN } from '../utils/glob'
import { discoverDurableObjectFiles } from './durable-object-discovery'
import { type RouteDiscoveryResult, discoverRoutes } from './routes'
import {
	type WorkerSurfacePaths,
	looksLikeBuildArtifactPath,
	resolveWorkerSurfacePaths
} from './surface-paths'
import { validateFetchHandlerStyle } from './validate-fetch-style'

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
	includeDevOnlyHooks?: boolean
}

/**
 * Minimal structured codegen helper used to emit the composed worker module.
 * Each method appends a discrete "section" to the output; sections are joined
 * by a single newline when rendered, which matches the shape previously
 * produced by the hand-written template literal.
 */
class CodeBuilder {
	private readonly sections: string[] = []

	importStatement(specifiers: readonly string[], from: string): this {
		this.sections.push(`import { ${specifiers.join(', ')} } from '${from}'`)
		return this
	}

	importNamespace(identifier: string, from: string): this {
		this.sections.push(`import * as ${identifier} from '${from}'`)
		return this
	}

	reExport(names: readonly string[], from: string): this {
		this.sections.push(`export { ${names.join(', ')} } from '${from}'`)
		return this
	}

	constDeclaration(name: string, value: string): this {
		this.sections.push(`const ${name} = ${value}`)
		return this
	}

	classDeclaration(body: string): this {
		this.sections.push(body)
		return this
	}

	exportDefault(body: string): this {
		this.sections.push(`export default ${body}`)
		return this
	}

	raw(text: string): this {
		this.sections.push(text)
		return this
	}

	blank(): this {
		this.sections.push('')
		return this
	}

	toString(): string {
		return this.sections.join('\n')
	}
}

const DEV_ONLY_EMAIL_HOOKS_SOURCE = `
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

function emitDevOnlyEmailHooks(builder: CodeBuilder, options: { enabled: boolean }): void {
	if (!options.enabled) {
		return
	}

	builder.raw(DEV_ONLY_EMAIL_HOOKS_SOURCE)
}

const RESOLVE_HANDLER_DECLARATION = `const __devflareResolveHandler = (module, namedExport) => {
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
}`

function buildDefaultExportBody(options: {
	hasFetchDispatch: boolean
	includeDevOnlyHooks: boolean
}): string {
	const devOnlyEmailEntry = options.includeDevOnlyHooks
		? `const url = new URL(request.url)

				if (
					request.headers.get('x-devflare-event') === 'email'
					&& url.pathname === '/_devflare/internal/email'
				) {
					return __devflareHandleInternalEmail(request, env, ctx)
				}

				`
		: ''

	return `{
	...(${options.hasFetchDispatch ? 'true' : 'false'}
		? {
			async fetch(request, env, ctx) {
				${devOnlyEmailEntry}const __devflareInitialRouteMatch = __devflareHasRoutes ? matchFetchRoute(__devflareRoutes, request) : null
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
				assertExplicitQueueHandlerStyle(__devflareQueueHandler)
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
				assertExplicitScheduledHandlerStyle(__devflareScheduledHandler)
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
		: {}),
	...(__devflareTailHandler
		? {
			async tail(events, env, ctx) {
				const __devflareEvent = createTailEvent(events, env, ctx)
				return runWithEventContext(
					__devflareEvent,
					() => __devflareTailHandler.length >= 2
						? __devflareTailHandler(events, env, ctx)
						: __devflareTailHandler(__devflareEvent, env, ctx)
				)
			}
		}
		: {})
}`
}

function getComposedWorkerEntrypointSource(
	surfaceImportPaths: WorkerSurfacePaths,
	configuredLocalSendEmailBindings: Record<
		string,
		{
			destinationAddress?: string
			allowedDestinationAddresses?: string[]
			allowedSenderAddresses?: string[]
		}
	> = {},
	durableObjectExports: readonly GeneratedDurableObjectExport[] = [],
	routeImports: readonly GeneratedRouteModuleImport[] = [],
	options: PrepareComposedWorkerEntrypointOptions = {}
): string {
	const includeDevOnlyHooks = options.includeDevOnlyHooks ?? options.devInternalEmail === true

	const importsBuilder = new CodeBuilder()
	importsBuilder.importStatement(
		[
			'assertExplicitQueueHandlerStyle',
			'assertExplicitScheduledHandlerStyle',
			'createEmailEvent',
			'createFetchEvent',
			'createQueueEvent',
			'createRouteResolve',
			'createScheduledEvent',
			'createTailEvent',
			'invokeFetchModule',
			'matchFetchRoute',
			'runWithEventContext',
			'setLocalSendEmailBindings'
		],
		'devflare/runtime'
	)

	const fallbackModules: Array<{ identifier: string; importPath: string | null }> = [
		{ identifier: '__devflareFetchModule', importPath: surfaceImportPaths.fetch },
		{ identifier: '__devflareQueueModule', importPath: surfaceImportPaths.queue },
		{ identifier: '__devflareScheduledModule', importPath: surfaceImportPaths.scheduled },
		{ identifier: '__devflareEmailModule', importPath: surfaceImportPaths.email },
		{ identifier: '__devflareTailModule', importPath: surfaceImportPaths.tail }
	]

	const fallbacksBuilder = new CodeBuilder()
	for (const { identifier, importPath } of fallbackModules) {
		if (importPath) {
			importsBuilder.importNamespace(identifier, importPath)
		} else {
			fallbacksBuilder.constDeclaration(identifier, '{}')
		}
	}

	for (const routeImport of routeImports) {
		importsBuilder.importNamespace(routeImport.identifier, routeImport.importPath)
	}

	const reExportsBuilder = new CodeBuilder()
	for (const { classNames, importPath } of durableObjectExports) {
		reExportsBuilder.reExport(classNames, importPath)
	}

	const routeManifestEntries = routeImports.map(
		({ identifier, filePath, routePath, segmentsJson }) => {
			return `\t{ filePath: ${JSON.stringify(filePath)}, routePath: ${JSON.stringify(routePath)}, segments: ${segmentsJson}, module: ${identifier} }`
		}
	)

	const builder = new CodeBuilder()
	builder.raw(importsBuilder.toString())
	builder.raw(fallbacksBuilder.toString())
	builder.raw(reExportsBuilder.toString())
	builder.blank()
	builder.raw(`setLocalSendEmailBindings(${JSON.stringify(configuredLocalSendEmailBindings)})`)
	builder.blank()
	builder.constDeclaration('__devflareHasFetchModule', surfaceImportPaths.fetch ? 'true' : 'false')
	builder.raw(`const __devflareRoutes = [\n${routeManifestEntries.join(',\n')}\n]`)
	builder.constDeclaration('__devflareHasRoutes', '__devflareRoutes.length > 0')
	builder.blank()
	builder.raw(RESOLVE_HANDLER_DECLARATION)
	builder.blank()
	builder.constDeclaration(
		'__devflareQueueHandler',
		"__devflareResolveHandler(__devflareQueueModule, 'queue')"
	)
	builder.constDeclaration(
		'__devflareScheduledHandler',
		"__devflareResolveHandler(__devflareScheduledModule, 'scheduled')"
	)
	builder.constDeclaration(
		'__devflareEmailHandler',
		"__devflareResolveHandler(__devflareEmailModule, 'email')"
	)
	builder.constDeclaration(
		'__devflareTailHandler',
		"__devflareResolveHandler(__devflareTailModule, 'tail')"
	)
	emitDevOnlyEmailHooks(builder, { enabled: includeDevOnlyHooks })
	builder.blank()
	builder.exportDefault(
		buildDefaultExportBody({
			hasFetchDispatch:
				Boolean(surfaceImportPaths.fetch) || routeImports.length > 0 || includeDevOnlyHooks,
			includeDevOnlyHooks
		})
	)
	builder.raw('')

	return builder.toString()
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
			.filter((binding) => binding.kind === 'local')
			.map((binding) => binding.className)
	)

	if (localClassNames.size === 0) {
		return []
	}

	const pattern =
		typeof config.files?.durableObjects === 'string'
			? config.files.durableObjects
			: DEFAULT_DO_PATTERN
	const discoveredFiles = await discoverDurableObjectFiles(cwd, pattern)
	const exports: GeneratedDurableObjectExport[] = []
	const discoveredClassNames = new Set<string>()

	for (const [filePath, allClassNames] of discoveredFiles) {
		const classNames = allClassNames.filter((className) => localClassNames.has(className))

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
	}

	const missingClassNames = Array.from(localClassNames).filter(
		(className) => !discoveredClassNames.has(className)
	)

	if (missingClassNames.length > 0) {
		throw new Error(
			`Failed to discover local Durable Object class${missingClassNames.length === 1 ? '' : 'es'} ${missingClassNames.join(', ')} for worker composition. ` +
				`Ensure files.durableObjects matches the source file pattern for your do.* files.`
		)
	}

	return exports
}

/**
 * Returns true when the resolved config has any composition signal other than
 * `files.fetch` (queue / scheduled / email handler files, durable-object
 * bindings, sendEmail bindings, or routes). Used to decide whether a missing
 * build-artifact fetch path can be safely deferred to wrangler/vite.
 */
function mayRequireCompositionBesidesFetch(config: DevflareConfig): boolean {
	const files = config.files ?? {}
	if (typeof files.queue === 'string' && files.queue) return true
	if (typeof files.scheduled === 'string' && files.scheduled) return true
	if (typeof files.email === 'string' && files.email) return true
	if (typeof files.tail === 'string' && files.tail) return true
	if (files.durableObjects) return true
	if (files.routes) return true
	const bindings = config.bindings ?? {}
	const doBindings = bindings.durableObjects
	if (doBindings && Object.keys(doBindings).length > 0) return true
	const sendEmail = bindings.sendEmail
	if (sendEmail && Object.keys(sendEmail).length > 0) return true
	return false
}

function needsComposedWorkerEntrypoint(
	cwd: string,
	surfacePaths: WorkerSurfacePaths,
	config: DevflareConfig,
	routeDiscovery: RouteDiscoveryResult | null
): boolean {
	const hasAdditionalWorkerSurfaces = Boolean(
		surfacePaths.queue ||
			surfacePaths.scheduled ||
			surfacePaths.email ||
			surfacePaths.tail ||
			routeDiscovery?.routes.length
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

	return Boolean(surfacePaths.fetch)
}

export async function prepareComposedWorkerEntrypoint(
	cwd: string,
	config: DevflareConfig,
	environment?: string,
	options: PrepareComposedWorkerEntrypointOptions = {}
): Promise<string | null> {
	const resolvedConfig = resolveConfigForEnvironment(config, environment)
	if (
		resolvedConfig.wrangler?.passthrough &&
		Object.prototype.hasOwnProperty.call(resolvedConfig.wrangler.passthrough, 'main')
	) {
		return null
	}

	// Build-artifact deferral: if files.fetch points at a framework build output
	// (e.g. `.svelte-kit/cloudflare/_worker.js`), the file does not exist yet at
	// this stage. When no other surface requires composition, skip composition
	// entirely so wrangler/vite picks up the build output post-build. When other
	// surfaces ARE present, fall through to resolveWorkerSurfacePaths so the
	// user gets a clear error explaining that composition cannot wrap an
	// unbuilt artifact.
	const configuredFetch = resolvedConfig.files?.fetch
	if (typeof configuredFetch === 'string' && looksLikeBuildArtifactPath(configuredFetch)) {
		const fs = await import('node:fs/promises')
		const fetchAbsolute = resolve(cwd, configuredFetch)
		let fetchExists = true
		try {
			await fs.access(fetchAbsolute)
		} catch {
			fetchExists = false
		}
		if (!fetchExists && !mayRequireCompositionBesidesFetch(resolvedConfig)) {
			return null
		}
	}

	const surfacePaths = await resolveWorkerSurfacePaths(cwd, resolvedConfig)
	const routeDiscovery = await discoverRoutes(cwd, resolvedConfig)
	if (!needsComposedWorkerEntrypoint(cwd, surfacePaths, resolvedConfig, routeDiscovery)) {
		return null
	}

	// Build/dev-time guard: fail fast on an ambiguous unmarked 2-arg fetch
	// handler now (dev start / build), instead of waiting for the first request.
	await validateFetchHandlerStyle(surfacePaths.fetch)

	const fs = await import('node:fs/promises')
	const entryDir = generatedDir(cwd, 'worker-entrypoints')
	const entryPath = resolve(entryDir, 'main.ts')

	await fs.mkdir(entryDir, { recursive: true })

	const surfaceImportPaths: WorkerSurfacePaths = {
		fetch: surfacePaths.fetch ? toImportSpecifier(entryPath, surfacePaths.fetch) : null,
		queue: surfacePaths.queue ? toImportSpecifier(entryPath, surfacePaths.queue) : null,
		scheduled: surfacePaths.scheduled ? toImportSpecifier(entryPath, surfacePaths.scheduled) : null,
		email: surfacePaths.email ? toImportSpecifier(entryPath, surfacePaths.email) : null,
		tail: surfacePaths.tail ? toImportSpecifier(entryPath, surfacePaths.tail) : null
	}
	const durableObjectExports = await createGeneratedDurableObjectExports(
		entryPath,
		cwd,
		resolvedConfig
	)
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

	return entryPath
}
