// =============================================================================
// Types Command — Generate TypeScript types from config
// =============================================================================

import { type ConsolaInstance } from 'consola'
import { resolve, relative, dirname, basename } from 'pathe'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { loadConfig, normalizeDOBinding, resolveConfigPath, type D1Binding, type DurableObjectBinding, type KVBinding } from '../../config'
import { getDependencies } from '../dependencies'
import { findFiles, DEFAULT_DO_PATTERN, DEFAULT_ENTRYPOINT_PATTERN } from '../../utils/glob'
import { findDurableObjectClasses } from '../../transform/durable-object'
import {
	findEntrypointClasses,
	discoverEntrypointsAsync,
	type DiscoveredEntrypoint
} from '../../utils/entrypoint-discovery'
import { resolvePackageSpecifier } from '../../utils/resolve-package'
import { resolveConfigCandidatePath } from '../config-path'
import { bold, createCliTheme, dim, logLine } from '../ui'

/**
 * Information about a discovered Durable Object class
 */
interface DiscoveredDO {
	className: string
	filePath: string
	bindingName: string
}

// DiscoveredEntrypoint type imported from shared utils

/**
 * Information about a service binding with type info
 */
interface ServiceBindingInfo {
	bindingName: string
	/** The entrypoint name (undefined = default) */
	entrypoint?: string
	/** Import path to the interface type */
	interfaceImport?: string
	/** Interface type name */
	interfaceType?: string
}

/**
 * Information about a discovered cross-worker DO binding
 */
interface CrossWorkerDOInfo {
	/** Binding name in the consumer config (e.g., 'COUNTER') */
	bindingName: string
	/** DO name in the referenced worker (e.g., 'COUNTER') */
	doName: string
	/** Class name of the DO (e.g., 'Counter') */
	className: string
	/** File path where the DO class is defined */
	filePath: string
}

/**
 * Information about a referenced worker config
 */
interface ReferencedConfig {
	/** Variable name in the config (e.g., 'mathWorker') */
	varName: string
	/** Import path from the config file */
	importPath: string
	/** Absolute path to the referenced config directory */
	refDir: string
	/** Discovered entrypoints in the referenced worker */
	entrypoints: DiscoveredEntrypoint[]
	/** Service bindings that use this ref */
	serviceBindings: ServiceBindingInfo[]
	/** Cross-worker DO bindings from this ref */
	durableObjects: CrossWorkerDOInfo[]
}

// findEntrypointClasses and discoverEntrypointsAsync imported from shared utils

/**
 * Parse a config file to find ref() calls, their variable names, and service bindings
 * Returns structured information about referenced workers and their bindings
 */
async function parseConfigForRefs(configPath: string): Promise<{
	refs: Array<{ varName: string; importPath: string }>
	serviceBindings: Array<{ bindingName: string; varName: string; entrypoint?: string }>
	doBindings: Array<{ bindingName: string; varName: string; doName: string }>
}> {
	const fs = await import('node:fs/promises')
	const refs: Array<{ varName: string; importPath: string }> = []
	const serviceBindings: Array<{ bindingName: string; varName: string; entrypoint?: string }> = []
	const doBindings: Array<{ bindingName: string; varName: string; doName: string }> = []

	try {
		const code = await fs.readFile(configPath, 'utf-8')

		// Pattern: const varName = ref(() => import('path'))
		// or: const varName = ref('name', () => import('path'))
		const refPattern = /const\s+(\w+)\s*=\s*ref\s*\(\s*(?:'[^']*'\s*,\s*)?(?:\(\s*\)\s*=>\s*)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
		let match

		while ((match = refPattern.exec(code)) !== null) {
			refs.push({
				varName: match[1],
				importPath: match[2]
			})
		}

		// Pattern for service bindings - look for:
		// BINDING_NAME: varName.worker  (default)
		// BINDING_NAME: varName.worker('EntrypointName')  (named)
		const servicePattern = /(\w+)\s*:\s*(\w+)\.worker(?:\s*\(\s*['"](\w+)['"]\s*\))?/g
		while ((match = servicePattern.exec(code)) !== null) {
			serviceBindings.push({
				bindingName: match[1],
				varName: match[2],
				entrypoint: match[3] // undefined if default worker
			})
		}

		// Pattern for cross-worker DO bindings - look for:
		// BINDING_NAME: varName.DO_NAME  (e.g., COUNTER: doService.COUNTER)
		// Matches: UPPER_CASE: varName.UPPER_CASE
		const doPattern = /(\w+)\s*:\s*(\w+)\.([A-Z][A-Z0-9_]*)\s*[,\n\r}]/g
		while ((match = doPattern.exec(code)) !== null) {
			// Skip if it matches the .worker pattern (already handled above)
			if (match[3] === 'worker') continue
			doBindings.push({
				bindingName: match[1],
				varName: match[2],
				doName: match[3]
			})
		}
	} catch {
		// Ignore files that can't be read
	}

	return { refs, serviceBindings, doBindings }
}

/**
 * Find interface types in source files
 * Looks for exports matching naming conventions:
 * - {ClassName}Interface (e.g., MathServiceInterface)
 * - {ClassName}Rpc (e.g., AdminEntrypointRpc)
 * - WorkerInterface / WorkerRpc for default worker
 * 
 * @param searchDirs - Directories to search in (in priority order)
 */
async function findInterfaceTypes(
	searchDirs: string[]
): Promise<Map<string, { filePath: string; interfaceName: string }>> {
	const fs = await import('node:fs/promises')
	const interfaces = new Map<string, { filePath: string; interfaceName: string }>()

	for (const dir of searchDirs) {
		// Look for *.types.ts files first (preferred convention)
		const typeFiles = await findFiles('**/*.types.ts', { cwd: dir })

		// Also look in src/ directory for any .ts files with interface exports
		const srcFiles = await findFiles('src/**/*.ts', { cwd: dir })

		const allFiles = [...new Set([...typeFiles, ...srcFiles])]

		for (const filePath of allFiles) {
			try {
				const code = await fs.readFile(filePath, 'utf-8')

				// Pattern: export interface FooInterface { ... } or export interface FooRpc { ... }
				const interfacePattern = /export\s+interface\s+(\w+(?:Interface|Rpc))\s*\{/g
				let match

				while ((match = interfacePattern.exec(code)) !== null) {
					const interfaceName = match[1]

					// Extract the base name (remove Interface/Rpc suffix)
					let baseName: string
					if (interfaceName.endsWith('Interface')) {
						baseName = interfaceName.slice(0, -9) // Remove 'Interface'
					} else if (interfaceName.endsWith('Rpc')) {
						baseName = interfaceName.slice(0, -3) // Remove 'Rpc'
					} else {
						continue
					}

					// Only set if not already found (priority order matters)
					if (!interfaces.has(baseName)) {
						interfaces.set(baseName, { filePath, interfaceName })
					}

					// Also map common variations for default worker
					// e.g., 'MathService' maps to 'MathServiceInterface'
					// 'Worker' or 'Default' maps to default worker interface
					if (!interfaces.has('__default__')) {
						if (baseName === 'Worker' || baseName === 'Default' || baseName === 'MathService') {
							interfaces.set('__default__', { filePath, interfaceName })
						}
					}
				}
			} catch {
				// Skip files that can't be read
			}
		}
	}

	return interfaces
}

/**
 * Resolve referenced configs and discover their entrypoints and interface types
 */
async function resolveReferencedConfigs(
	configPath: string,
	cwd: string
): Promise<ReferencedConfig[]> {
	const referenced: ReferencedConfig[] = []

	// Parse config for refs, service bindings, and DO bindings
	const { refs, serviceBindings, doBindings } = await parseConfigForRefs(configPath)

	if (refs.length === 0) {
		return referenced
	}

	const configDir = dirname(configPath)

	for (const ref of refs) {
		// Resolve the config file path using package specifier resolution.
		// This handles relative paths, workspace package specifiers, and config
		// files using .ts/.mts/.js/.mjs extensions.
		const refImportPath = resolvePackageSpecifier(ref.importPath, configDir)
		const refConfigPath = await resolveConfigCandidatePath(refImportPath)

		if (!refConfigPath) {
			continue
		}

		try {
			const refDir = dirname(refConfigPath)

			// Discover entrypoints in the referenced worker directory
			const entrypoints = await discoverEntrypointsAsync(refDir, DEFAULT_ENTRYPOINT_PATTERN)

			// Discover DOs in the referenced worker (for cross-worker DO bindings)
			// Use **/do.*.ts to find DOs in subdirectories like src/
			const refDOs = await discoverDurableObjects(refDir, DEFAULT_DO_PATTERN)

			// Find interface types - search in both the consumer's directory and the referenced worker
			// Priority order: consumer dir first (allows overriding/extending), then referenced worker
			const interfaceMap = await findInterfaceTypes([configDir, refDir])

			// Map service bindings that use this ref
			const bindings = serviceBindings
				.filter((sb) => sb.varName === ref.varName)
				.map((sb) => {
					const info: ServiceBindingInfo = {
						bindingName: sb.bindingName,
						entrypoint: sb.entrypoint
					}

					// Find matching interface type
					const lookupKey = sb.entrypoint || '__default__'
					const interfaceInfo = interfaceMap.get(lookupKey) ||
						(sb.entrypoint && interfaceMap.get(sb.entrypoint))

					if (interfaceInfo) {
						info.interfaceImport = generateImportPath(cwd, interfaceInfo.filePath)
						info.interfaceType = interfaceInfo.interfaceName
					}

					return info
				})

			// Map cross-worker DO bindings that use this ref
			const crossWorkerDOs: CrossWorkerDOInfo[] = doBindings
				.filter((doBinding) => doBinding.varName === ref.varName)
				.map((doBinding) => {
					// Find the DO class in the referenced worker's discovered DOs
					// Match by binding name (e.g., COUNTER → Counter)
					const matchingDO = refDOs.find((do_) => do_.bindingName === doBinding.doName)

					if (matchingDO) {
						return {
							bindingName: doBinding.bindingName,
							doName: doBinding.doName,
							className: matchingDO.className,
							filePath: matchingDO.filePath
						}
					}
					return null
				})
				.filter((item): item is CrossWorkerDOInfo => item !== null)

			referenced.push({
				varName: ref.varName,
				importPath: ref.importPath,
				refDir,
				entrypoints,
				serviceBindings: bindings,
				durableObjects: crossWorkerDOs
			})
		} catch {
			// Config file doesn't exist, skip
		}
	}

	return referenced
}

/**
 * Discover DO classes from a glob pattern.
 * Respects .gitignore automatically.
 */
async function discoverDurableObjects(
	cwd: string,
	pattern: string
): Promise<DiscoveredDO[]> {
	const fs = await import('node:fs/promises')
	const discovered: DiscoveredDO[] = []

	// Find matching files with gitignore support
	const files = await findFiles(pattern, { cwd })

	for (const filePath of files) {
		try {
			const code = await fs.readFile(filePath, 'utf-8')
			const classNames = findDurableObjectClasses(code)

			for (const className of classNames) {
				// Convert PascalCase to SCREAMING_SNAKE_CASE for binding name
				const bindingName = className
					.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
					.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
					.toUpperCase()

				discovered.push({
					className,
					filePath,
					bindingName
				})
			}
		} catch {
			// Skip files that can't be read
		}
	}

	return discovered
}

/**
 * Generate import path for a DO class
 * Converts absolute path to relative import path from project root
 */
function generateImportPath(cwd: string, filePath: string): string {
	// Get relative path from cwd
	let relativePath = relative(cwd, filePath)

	// Remove file extension (.ts, .tsx, .js, .jsx)
	relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '')

	// Ensure it starts with ./ for relative imports
	if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
		relativePath = './' + relativePath
	}

	return relativePath
}

/**
 * Generates the binding members for DevflareEnv interface
 */
function generateBindingMembers(
	config: {
		bindings?: {
			kv?: Record<string, KVBinding>
			d1?: Record<string, D1Binding>
			r2?: Record<string, string>
			durableObjects?: Record<string, { className?: string; scriptName?: string }>
			queues?: { producers?: Record<string, string>; consumers?: unknown[] }
			services?: Record<string, { service?: string }>
			ai?: { binding?: string }
			vectorize?: Record<string, { indexName?: string }>
			hyperdrive?: Record<string, { id?: string }>
			browser?: Record<string, string>
			analyticsEngine?: Record<string, { dataset?: string }>
			sendEmail?: Record<string, {
				destinationAddress?: string
				allowedDestinationAddresses?: string[]
				allowedSenderAddresses?: string[]
			}>
		}
		vars?: Record<string, string>
		secrets?: Record<string, { required?: boolean }>
	},
	doClassMap: Map<string, { importPath: string; className: string }>,
	crossWorkerDOMap: Map<string, CrossWorkerDOInfo>,
	serviceBindingMap: Map<string, ServiceBindingInfo>,
	cwd: string,
	indent: string
): { lines: string[]; imports: string[] } {
	const lines: string[] = []
	const imports: string[] = []

	if (config.bindings) {
		// KV Namespaces
		if (config.bindings.kv) {
			for (const binding of Object.keys(config.bindings.kv)) {
				lines.push(`${indent}${binding}: KVNamespace`)
			}
		}

		// D1 Databases
		if (config.bindings.d1) {
			for (const binding of Object.keys(config.bindings.d1)) {
				lines.push(`${indent}${binding}: D1Database`)
			}
		}

		// R2 Buckets
		if (config.bindings.r2) {
			for (const binding of Object.keys(config.bindings.r2)) {
				lines.push(`${indent}${binding}: R2Bucket`)
			}
		}

		// Durable Objects - with proper generic types
		if (config.bindings.durableObjects) {
			for (const [binding, doConfig] of Object.entries(config.bindings.durableObjects)) {
				// First check if this is a cross-worker DO (from a ref())
				const crossWorkerDO = crossWorkerDOMap.get(binding)
				if (crossWorkerDO) {
					const importPath = generateImportPath(cwd, crossWorkerDO.filePath)
					lines.push(`${indent}${binding}: DurableObjectNamespace<Rpc.DurableObjectBranded & import('${importPath}').${crossWorkerDO.className}>`)
					continue
				}

				// Otherwise, check local DO class map
				const className = doConfig.className
				if (className) {
					const classInfo = doClassMap.get(className)
					if (classInfo) {
						lines.push(`${indent}${binding}: DurableObjectNamespace<Rpc.DurableObjectBranded & import('${classInfo.importPath}').${classInfo.className}>`)
						continue
					}
				}
				lines.push(`${indent}${binding}: DurableObjectNamespace`)
			}
		}

		// Queues
		if (config.bindings.queues?.producers) {
			for (const binding of Object.keys(config.bindings.queues.producers)) {
				lines.push(`${indent}${binding}: Queue`)
			}
		}

		// Service Bindings - with typed RPC interfaces when available
		if (config.bindings.services) {
			for (const binding of Object.keys(config.bindings.services)) {
				const serviceInfo = serviceBindingMap.get(binding)
				if (serviceInfo?.interfaceType && serviceInfo.interfaceImport) {
					// Add import for the interface type
					imports.push(`import type { ${serviceInfo.interfaceType} } from '${serviceInfo.interfaceImport}'`)
					lines.push(`${indent}${binding}: ${serviceInfo.interfaceType}`)
				} else {
					// Fallback to generic Fetcher
					lines.push(`${indent}${binding}: Fetcher`)
				}
			}
		}

		// AI
		if (config.bindings.ai) {
			lines.push(`${indent}${config.bindings.ai.binding}: Ai`)
		}

		// Vectorize
		if (config.bindings.vectorize) {
			for (const binding of Object.keys(config.bindings.vectorize)) {
				lines.push(`${indent}${binding}: VectorizeIndex`)
			}
		}

		// Hyperdrive
		if (config.bindings.hyperdrive) {
			for (const binding of Object.keys(config.bindings.hyperdrive)) {
				lines.push(`${indent}${binding}: Hyperdrive`)
			}
		}

		// Browser
		if (config.bindings.browser) {
			for (const binding of Object.keys(config.bindings.browser)) {
				lines.push(`${indent}${binding}: Fetcher`)
			}
		}

		// Analytics Engine
		if (config.bindings.analyticsEngine) {
			for (const binding of Object.keys(config.bindings.analyticsEngine)) {
				lines.push(`${indent}${binding}: AnalyticsEngineDataset`)
			}
		}

		// Send Email
		if (config.bindings.sendEmail) {
			for (const binding of Object.keys(config.bindings.sendEmail)) {
				lines.push(`${indent}${binding}: SendEmail`)
			}
		}
	}

	// Add vars
	if (config.vars) {
		for (const key of Object.keys(config.vars)) {
			lines.push(`${indent}${key}: string`)
		}
	}

	// Add secrets
	if (config.secrets) {
		for (const secret of Object.keys(config.secrets)) {
			lines.push(`${indent}${secret}: string`)
		}
	}

	return { lines, imports }
}

/**
 * Generates TypeScript type definitions from config bindings
 * Uses permissive types for compatibility with partial env configs
 */
function generateBindingTypes(
	config: {
		bindings?: {
			kv?: Record<string, KVBinding>
			d1?: Record<string, D1Binding>
			r2?: Record<string, string>
			durableObjects?: Record<string, { className?: string; scriptName?: string }>
			queues?: { producers?: Record<string, string>; consumers?: unknown[] }
			services?: Record<string, { service?: string }>
			ai?: { binding?: string }
			vectorize?: Record<string, { indexName?: string }>
			hyperdrive?: Record<string, { id?: string }>
			browser?: Record<string, string>
			analyticsEngine?: Record<string, { dataset?: string }>
			sendEmail?: Record<string, {
				destinationAddress?: string
				allowedDestinationAddresses?: string[]
				allowedSenderAddresses?: string[]
			}>
		}
		vars?: Record<string, string>
		secrets?: Record<string, { required?: boolean }>
	},
	discoveredDOs: DiscoveredDO[],
	discoveredEntrypoints: DiscoveredEntrypoint[],
	referencedConfigs: ReferencedConfig[],
	cwd: string
): string {
	// Build a map of className → import info for discovered DOs
	const doClassMap = new Map<string, { importPath: string; className: string }>()
	for (const do_ of discoveredDOs) {
		doClassMap.set(do_.className, {
			importPath: generateImportPath(cwd, do_.filePath),
			className: do_.className
		})
	}

	// Build a map of binding name → cross-worker DO info (for cross-worker DOs)
	const crossWorkerDOMap = new Map<string, CrossWorkerDOInfo>()
	for (const ref of referencedConfigs) {
		for (const doInfo of ref.durableObjects) {
			crossWorkerDOMap.set(doInfo.bindingName, doInfo)
		}
	}

	// Build a map of binding name → service binding info
	const serviceBindingMap = new Map<string, ServiceBindingInfo>()
	for (const ref of referencedConfigs) {
		for (const sb of ref.serviceBindings) {
			serviceBindingMap.set(sb.bindingName, sb)
		}
	}

	// Collect all Cloudflare types used
	const usedTypes = new Set<string>()

	if (config.bindings) {
		if (config.bindings.kv && Object.keys(config.bindings.kv).length > 0) usedTypes.add('KVNamespace')
		if (config.bindings.d1 && Object.keys(config.bindings.d1).length > 0) usedTypes.add('D1Database')
		if (config.bindings.r2 && Object.keys(config.bindings.r2).length > 0) usedTypes.add('R2Bucket')
		if (config.bindings.durableObjects && Object.keys(config.bindings.durableObjects).length > 0) usedTypes.add('DurableObjectNamespace')
		if (config.bindings.queues?.producers && Object.keys(config.bindings.queues.producers).length > 0) usedTypes.add('Queue')
		// Only add Fetcher if we have service bindings without typed interfaces
		if (config.bindings.services) {
			const hasUntypedServices = Object.keys(config.bindings.services).some(
				(name) => !serviceBindingMap.get(name)?.interfaceType
			)
			if (hasUntypedServices) usedTypes.add('Fetcher')
		}
		if (config.bindings.ai) usedTypes.add('Ai')
		if (config.bindings.vectorize && Object.keys(config.bindings.vectorize).length > 0) usedTypes.add('VectorizeIndex')
		if (config.bindings.hyperdrive && Object.keys(config.bindings.hyperdrive).length > 0) usedTypes.add('Hyperdrive')
		if (config.bindings.browser && Object.keys(config.bindings.browser).length > 0) usedTypes.add('Fetcher')
		if (config.bindings.analyticsEngine && Object.keys(config.bindings.analyticsEngine).length > 0) usedTypes.add('AnalyticsEngineDataset')
		if (config.bindings.sendEmail && Object.keys(config.bindings.sendEmail).length > 0) usedTypes.add('SendEmail')
	}

	const lines: string[] = [
		'// Generated by devflare - DO NOT EDIT',
		'// Run `devflare types` to regenerate',
		''
	]

	// Check if we need Rpc types for DO generics (local DOs with classes OR cross-worker DOs)
	const hasLocalDOsWithClasses = config.bindings?.durableObjects &&
		Object.values(config.bindings.durableObjects).some((doConfig) => doConfig.className && doClassMap.has(doConfig.className))
	const hasCrossWorkerDOs = crossWorkerDOMap.size > 0
	const hasDOsWithClasses = hasLocalDOsWithClasses || hasCrossWorkerDOs

	// Add import for Cloudflare types if any are used
	if (usedTypes.size > 0) {
		const sortedTypes = [...usedTypes].sort()
		// Include Rpc namespace if we have typed DOs
		if (hasDOsWithClasses) {
			lines.push(`import type { ${sortedTypes.join(', ')}, Rpc } from '@cloudflare/workers-types'`)
		} else {
			lines.push(`import type { ${sortedTypes.join(', ')} } from '@cloudflare/workers-types'`)
		}
		lines.push('')
	}

	// Generate binding members (shared between both declarations)
	const { lines: bindingMembers, imports: serviceImports } = generateBindingMembers(
		config, doClassMap, crossWorkerDOMap, serviceBindingMap, cwd, '\t\t'
	)

	// Add service binding interface imports (deduplicated)
	const uniqueImports = [...new Set(serviceImports)]
	if (uniqueImports.length > 0) {
		lines.push(...uniqueImports)
		lines.push('')
	}

	// 1. Global declaration for `import { env } from 'devflare'`
	lines.push('declare global {')
	lines.push('\tinterface DevflareEnv {')
	lines.push(...bindingMembers)
	lines.push('\t}')
	lines.push('}')
	lines.push('')

	// 2. Generate Entrypoints type from discovered ep.*.ts files
	// This enables autocomplete for ref().worker('...') calls
	if (discoveredEntrypoints.length > 0) {
		const entrypointNames = discoveredEntrypoints.map((ep) => `'${ep.className}'`).join(' | ')
		lines.push('/**')
		lines.push(' * Named entrypoints discovered from ep.*.ts files.')
		lines.push(' * Use with defineConfig<Entrypoints>() for type-safe cross-worker references.')
		lines.push(' */')
		lines.push(`export type Entrypoints = ${entrypointNames}`)
	} else {
		// Default to string if no entrypoints discovered
		lines.push('/**')
		lines.push(' * Named entrypoints (none discovered - add ep.*.ts files to enable).')
		lines.push(' * Use with defineConfig<Entrypoints>() for type-safe cross-worker references.')
		lines.push(' */')
		lines.push('export type Entrypoints = string')
	}
	lines.push('')

	return lines.join('\n')
}

export async function runTypesCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const cwd = options.cwd || process.cwd()
	const configPath = parsed.options.config as string | undefined
	const outputPath = (parsed.options.output as string) || 'env.d.ts'
	const theme = createCliTheme(parsed.options)

	logLine(logger)
	logLine(logger, `${bold('types', theme)} ${dim('Generating TypeScript bindings', theme)}`)

	try {
		// Load devflare config
		const config = await loadConfig({ cwd, configFile: configPath })
		const requestedConfigPath = configPath
			? resolve(cwd, configPath)
			: cwd
		const actualConfigPath = await resolveConfigCandidatePath(requestedConfigPath)

		if (!actualConfigPath) {
			throw new Error('Could not resolve the loaded devflare config file path')
		}

		// Discover Durable Objects from files.durableObjects pattern (or default)
		const doPattern = typeof config.files?.durableObjects === 'string'
			? config.files.durableObjects
			: DEFAULT_DO_PATTERN

		let discoveredDOs: DiscoveredDO[] = []
		if (config.files?.durableObjects !== false) {
			discoveredDOs = await discoverDurableObjects(cwd, doPattern)
			if (discoveredDOs.length > 0) {
				logLine(logger, `Discovered ${discoveredDOs.length} Durable Object class(es):`)
				for (const do_ of discoveredDOs) {
					logLine(logger, `  • ${do_.className} → ${do_.bindingName}`)
				}
			}
		}

		// Also add DOs from explicit bindings.durableObjects config
		// These may have scriptName that points to a file
		if (config.bindings?.durableObjects) {
			for (const [bindingName, doConfig] of Object.entries(config.bindings.durableObjects)) {
				const normalized = normalizeDOBinding(doConfig)
				const className = normalized.className
				if (!className) continue

				// Check if we already discovered this class
				const existing = discoveredDOs.find((d) => d.className === className)
				if (existing) continue

				// If scriptName is provided and looks like a file path (not a worker name), use it
				// Cross-worker DOs have scriptName as worker name (no file extension)
				if (normalized.scriptName && (normalized.scriptName.endsWith('.ts') || normalized.scriptName.endsWith('.js'))) {
					const filePath = resolve(cwd, 'src', normalized.scriptName)
					discoveredDOs.push({
						className,
						filePath,
						bindingName
					})
				}
			}
		}

		// Discover Entrypoints from ep.*.ts files (using config pattern or default)
		const epPattern = typeof config.files?.entrypoints === 'string'
			? config.files.entrypoints
			: DEFAULT_ENTRYPOINT_PATTERN

		let discoveredEntrypoints: DiscoveredEntrypoint[] = []
		if (config.files?.entrypoints !== false) {
			discoveredEntrypoints = await discoverEntrypointsAsync(cwd, epPattern)
			if (discoveredEntrypoints.length > 0) {
				logLine(logger, `Discovered ${discoveredEntrypoints.length} entrypoint class(es):`)
				for (const ep of discoveredEntrypoints) {
					logLine(logger, `  • ${ep.className}`)
				}
			}
		}

		// Resolve referenced configs for typed service bindings
		const referencedConfigs = await resolveReferencedConfigs(actualConfigPath, cwd)
		if (referencedConfigs.length > 0) {
			logLine(logger, `Found ${referencedConfigs.length} referenced worker(s):`)
			for (const ref of referencedConfigs) {
				const typedBindings = ref.serviceBindings.filter((sb) => sb.interfaceType)
				if (typedBindings.length > 0) {
					logLine(logger, `  • ${ref.varName}: ${typedBindings.map((sb) => `${sb.bindingName} → ${sb.interfaceType}`).join(', ')}`)
				}
			}
		}

		// Normalize DO bindings for type generation (convert strings to objects)
		const normalizedConfig = {
			...config,
			bindings: config.bindings ? {
				...config.bindings,
				durableObjects: config.bindings.durableObjects
					? Object.fromEntries(
						Object.entries(config.bindings.durableObjects).map(([name, doConfig]) => {
							const normalized = normalizeDOBinding(doConfig)
							return [name, { className: normalized.className, scriptName: normalized.scriptName }]
						})
					)
					: undefined
			} : undefined
		}

		// Generate types
		const types = generateBindingTypes(normalizedConfig, discoveredDOs, discoveredEntrypoints, referencedConfigs, cwd)

		// Get filesystem dependency
		const { fs } = await getDependencies()
		const fullPath = resolve(cwd, outputPath)
		await fs.writeFile(fullPath, types, 'utf-8')

		logger.success(`Generated types: ${outputPath}`)
		return { exitCode: 0 }
	} catch (error) {
		if (error instanceof Error) {
			logger.error('Type generation failed:', error.message)
			if (parsed.options.debug) {
				logger.error(error.stack)
			}
		}
		return { exitCode: 1 }
	}
}
