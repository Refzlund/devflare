import { readFile } from 'node:fs/promises'
import { dirname, relative } from 'pathe'
import { DEFAULT_DO_PATTERN, DEFAULT_ENTRYPOINT_PATTERN, findFiles } from '../../../utils/glob'
import { discoverEntrypointsAsync, type DiscoveredEntrypoint } from '../../../utils/entrypoint-discovery'
import { findDurableObjectClasses } from '../../../transform/durable-object'
import { resolvePackageSpecifier } from '../../../utils/resolve-package'
import { resolveConfigCandidatePath } from '../../config-path'
import type {
	CrossWorkerDOInfo,
	DiscoveredDO,
	ReferencedConfig,
	ServiceBindingInfo
} from './models'

interface ParsedConfigRef {
	varName: string
	importPath: string
}

interface ParsedServiceBinding {
	bindingName: string
	varName: string
	entrypoint?: string
}

interface ParsedDOBinding {
	bindingName: string
	varName: string
	doName: string
}

interface InterfaceTypeInfo {
	filePath: string
	interfaceName: string
}

const DEFAULT_INTERFACE_LOOKUP_KEYS = new Set(['Worker', 'Default', 'MathService'])
const interfaceTypeCache = new Map<string, Promise<Map<string, InterfaceTypeInfo>>>()

async function readFileIfAvailable(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, 'utf-8')
	} catch {
		return null
	}
}

function getInterfaceSearchKey(searchDirs: string[]): string {
	return [...new Set(searchDirs)]
		.sort((left, right) => left.localeCompare(right))
		.join('\u0000')
}

function getPatternMatches(pattern: RegExp, code: string): RegExpExecArray[] {
	const matches: RegExpExecArray[] = []
	pattern.lastIndex = 0

	let nextMatch = pattern.exec(code)
	while (nextMatch !== null) {
		matches.push(nextMatch)
		nextMatch = pattern.exec(code)
	}

	return matches
}

function getInterfaceBaseName(interfaceName: string): string | null {
	if (interfaceName.endsWith('Interface')) {
		return interfaceName.slice(0, -9)
	}

	if (interfaceName.endsWith('Rpc')) {
		return interfaceName.slice(0, -3)
	}

	return null
}

function registerInterfaceType(
	interfaces: Map<string, InterfaceTypeInfo>,
	baseName: string,
	interfaceInfo: InterfaceTypeInfo
): void {
	if (!interfaces.has(baseName)) {
		interfaces.set(baseName, interfaceInfo)
	}

	if (!interfaces.has('__default__') && DEFAULT_INTERFACE_LOOKUP_KEYS.has(baseName)) {
		interfaces.set('__default__', interfaceInfo)
	}
}

async function collectInterfaceTypesFromFile(
	interfaces: Map<string, InterfaceTypeInfo>,
	filePath: string
): Promise<void> {
	const code = await readFileIfAvailable(filePath)
	if (!code) {
		return
	}

	const interfacePattern = /export\s+interface\s+(\w+(?:Interface|Rpc))\s*\{/g
	for (const match of getPatternMatches(interfacePattern, code)) {
		const interfaceName = match[1]
		const baseName = getInterfaceBaseName(interfaceName)
		if (!baseName) {
			continue
		}

		registerInterfaceType(interfaces, baseName, {
			filePath,
			interfaceName
		})
	}
}

async function parseConfigForRefs(configPath: string): Promise<{
	refs: ParsedConfigRef[]
	serviceBindings: ParsedServiceBinding[]
	doBindings: ParsedDOBinding[]
}> {
	const refs: ParsedConfigRef[] = []
	const serviceBindings: ParsedServiceBinding[] = []
	const doBindings: ParsedDOBinding[] = []
	const code = await readFileIfAvailable(configPath)

	if (!code) {
		return {
			refs,
			serviceBindings,
			doBindings
		}
	}

	const refPattern = /const\s+(\w+)\s*=\s*ref\s*\(\s*(?:'[^']*'\s*,\s*)?(?:\(\s*\)\s*=>\s*)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
	for (const match of getPatternMatches(refPattern, code)) {
		refs.push({
			varName: match[1],
			importPath: match[2]
		})
	}

	const servicePattern = /(\w+)\s*:\s*(\w+)\.worker(?:\s*\(\s*['"](\w+)['"]\s*\))?/g
	for (const match of getPatternMatches(servicePattern, code)) {
		serviceBindings.push({
			bindingName: match[1],
			varName: match[2],
			entrypoint: match[3]
		})
	}

	const doPattern = /(\w+)\s*:\s*(\w+)\.([A-Z][A-Z0-9_]*)\s*[,\n\r}]/g
	for (const match of getPatternMatches(doPattern, code)) {
		if (match[3] === 'worker') {
			continue
		}

		doBindings.push({
			bindingName: match[1],
			varName: match[2],
			doName: match[3]
		})
	}

	return {
		refs,
		serviceBindings,
		doBindings
	}
}

async function findInterfaceTypes(
	searchDirs: string[]
): Promise<Map<string, InterfaceTypeInfo>> {
	const interfaces = new Map<string, InterfaceTypeInfo>()

	for (const dir of [...new Set(searchDirs)]) {
		const typeFiles = await findFiles('**/*.types.ts', { cwd: dir })
		const srcFiles = await findFiles('src/**/*.ts', { cwd: dir })
		const allFiles = [...new Set([...typeFiles, ...srcFiles])]

		for (const filePath of allFiles) {
			await collectInterfaceTypesFromFile(interfaces, filePath)
		}
	}

	return interfaces
}

async function getCachedInterfaceTypes(searchDirs: string[]): Promise<Map<string, InterfaceTypeInfo>> {
	const cacheKey = getInterfaceSearchKey(searchDirs)
	const cached = interfaceTypeCache.get(cacheKey)
	if (cached) {
		return cached
	}

	const pending = findInterfaceTypes(searchDirs)
	interfaceTypeCache.set(cacheKey, pending)

	try {
		return await pending
	} catch (error) {
		interfaceTypeCache.delete(cacheKey)
		throw error
	}
}

export async function discoverDurableObjects(
	cwd: string,
	pattern: string = DEFAULT_DO_PATTERN
): Promise<DiscoveredDO[]> {
	const discovered: DiscoveredDO[] = []
	const files = await findFiles(pattern, { cwd })

	for (const filePath of files) {
		const code = await readFileIfAvailable(filePath)
		if (!code) {
			continue
		}

		const classNames = findDurableObjectClasses(code)

		for (const className of classNames) {
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
	}

	return discovered
}

export function generateImportPath(cwd: string, filePath: string): string {
	let relativePath = relative(cwd, filePath)
	relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '')

	if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
		relativePath = `./${relativePath}`
	}

	return relativePath
}

export async function resolveReferencedConfigs(
	configPath: string,
	cwd: string
): Promise<ReferencedConfig[]> {
	const referenced: ReferencedConfig[] = []
	const { refs, serviceBindings, doBindings } = await parseConfigForRefs(configPath)

	if (refs.length === 0) {
		return referenced
	}

	const configDir = dirname(configPath)
	const referencedConfigDetailsByPath = new Map<string, Promise<{
		refDir: string
		entrypoints: DiscoveredEntrypoint[]
		refDOs: DiscoveredDO[]
		interfaceMap: Map<string, InterfaceTypeInfo>
	}>>()

	for (const ref of refs) {
		const refImportPath = resolvePackageSpecifier(ref.importPath, configDir)
		const refConfigPath = await resolveConfigCandidatePath(refImportPath)

		if (!refConfigPath) {
			continue
		}

		try {
			let referencedConfigDetails = referencedConfigDetailsByPath.get(refConfigPath)
			if (!referencedConfigDetails) {
				referencedConfigDetails = (async () => {
					const refDir = dirname(refConfigPath)
					return {
						refDir,
						entrypoints: await discoverEntrypointsAsync(refDir, DEFAULT_ENTRYPOINT_PATTERN),
						refDOs: await discoverDurableObjects(refDir, DEFAULT_DO_PATTERN),
						interfaceMap: await getCachedInterfaceTypes([configDir, refDir])
					}
				})()
				referencedConfigDetailsByPath.set(refConfigPath, referencedConfigDetails)
			}

			const {
				refDir,
				entrypoints,
				refDOs,
				interfaceMap
			} = await referencedConfigDetails

			const bindings = serviceBindings
				.filter((serviceBinding) => serviceBinding.varName === ref.varName)
				.map((serviceBinding) => {
					const info: ServiceBindingInfo = {
						bindingName: serviceBinding.bindingName,
						entrypoint: serviceBinding.entrypoint
					}
					const lookupKey = serviceBinding.entrypoint || '__default__'
					const interfaceInfo = interfaceMap.get(lookupKey)
						|| (serviceBinding.entrypoint ? interfaceMap.get(serviceBinding.entrypoint) : undefined)

					if (interfaceInfo) {
						info.interfaceImport = generateImportPath(cwd, interfaceInfo.filePath)
						info.interfaceType = interfaceInfo.interfaceName
					}

					return info
				})

			const crossWorkerDOs = doBindings
				.filter((doBinding) => doBinding.varName === ref.varName)
				.map((doBinding) => {
					const matchingDO = refDOs.find((doInfo) => doInfo.bindingName === doBinding.doName)
					if (!matchingDO) {
						return null
					}

					const crossWorkerDO: CrossWorkerDOInfo = {
						bindingName: doBinding.bindingName,
						doName: doBinding.doName,
						className: matchingDO.className,
						filePath: matchingDO.filePath
					}

					return crossWorkerDO
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
			// Ignore refs whose config cannot be resolved.
		}
	}

	return referenced
}

export type { DiscoveredEntrypoint }
