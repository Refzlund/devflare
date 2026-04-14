import type {
	D1Binding,
	DurableObjectBinding,
	HyperdriveBinding,
	KVBinding
} from '../../../config'
import type { DiscoveredEntrypoint } from '../../../utils/entrypoint-discovery'
import { generateImportPath } from './discovery'
import type {
	CrossWorkerDOInfo,
	DiscoveredDO,
	ReferencedConfig,
	ServiceBindingInfo
} from './models'

interface TypeGenerationConfig {
	bindings?: {
		kv?: Record<string, KVBinding>
		d1?: Record<string, D1Binding>
		r2?: Record<string, string>
		durableObjects?: Record<string, { className?: string; scriptName?: string }>
		queues?: { producers?: Record<string, string>; consumers?: unknown[] }
		services?: Record<string, { service?: string }>
		ai?: { binding?: string }
		vectorize?: Record<string, { indexName?: string }>
		hyperdrive?: Record<string, HyperdriveBinding>
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
}

function generateBindingMembers(
	config: TypeGenerationConfig,
	doClassMap: Map<string, { importPath: string; className: string }>,
	crossWorkerDOMap: Map<string, CrossWorkerDOInfo>,
	serviceBindingMap: Map<string, ServiceBindingInfo>,
	cwd: string,
	indent: string
): { lines: string[]; imports: string[] } {
	const lines: string[] = []
	const imports: string[] = []

	if (config.bindings) {
		if (config.bindings.kv) {
			for (const binding of Object.keys(config.bindings.kv)) {
				lines.push(`${indent}${binding}: KVNamespace`)
			}
		}

		if (config.bindings.d1) {
			for (const binding of Object.keys(config.bindings.d1)) {
				lines.push(`${indent}${binding}: D1Database`)
			}
		}

		if (config.bindings.r2) {
			for (const binding of Object.keys(config.bindings.r2)) {
				lines.push(`${indent}${binding}: R2Bucket`)
			}
		}

		if (config.bindings.durableObjects) {
			for (const [binding, doConfig] of Object.entries(config.bindings.durableObjects)) {
				const crossWorkerDO = crossWorkerDOMap.get(binding)
				if (crossWorkerDO) {
					const importPath = generateImportPath(cwd, crossWorkerDO.filePath)
					lines.push(`${indent}${binding}: DurableObjectNamespace<Rpc.DurableObjectBranded & import('${importPath}').${crossWorkerDO.className}>`)
					continue
				}

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

		if (config.bindings.queues?.producers) {
			for (const binding of Object.keys(config.bindings.queues.producers)) {
				lines.push(`${indent}${binding}: Queue`)
			}
		}

		if (config.bindings.services) {
			for (const binding of Object.keys(config.bindings.services)) {
				const serviceInfo = serviceBindingMap.get(binding)
				if (serviceInfo?.interfaceType && serviceInfo.interfaceImport) {
					imports.push(`import type { ${serviceInfo.interfaceType} } from '${serviceInfo.interfaceImport}'`)
					lines.push(`${indent}${binding}: ${serviceInfo.interfaceType}`)
					continue
				}

				lines.push(`${indent}${binding}: Fetcher`)
			}
		}

		if (config.bindings.ai) {
			lines.push(`${indent}${config.bindings.ai.binding}: Ai`)
		}

		if (config.bindings.vectorize) {
			for (const binding of Object.keys(config.bindings.vectorize)) {
				lines.push(`${indent}${binding}: VectorizeIndex`)
			}
		}

		if (config.bindings.hyperdrive) {
			for (const binding of Object.keys(config.bindings.hyperdrive)) {
				lines.push(`${indent}${binding}: Hyperdrive`)
			}
		}

		if (config.bindings.browser) {
			for (const binding of Object.keys(config.bindings.browser)) {
				lines.push(`${indent}${binding}: Fetcher`)
			}
		}

		if (config.bindings.analyticsEngine) {
			for (const binding of Object.keys(config.bindings.analyticsEngine)) {
				lines.push(`${indent}${binding}: AnalyticsEngineDataset`)
			}
		}

		if (config.bindings.sendEmail) {
			for (const binding of Object.keys(config.bindings.sendEmail)) {
				lines.push(`${indent}${binding}: SendEmail`)
			}
		}
	}

	if (config.vars) {
		for (const key of Object.keys(config.vars)) {
			lines.push(`${indent}${key}: string`)
		}
	}

	if (config.secrets) {
		for (const secret of Object.keys(config.secrets)) {
			lines.push(`${indent}${secret}: string`)
		}
	}

	return { lines, imports }
}

export function generateBindingTypes(
	config: TypeGenerationConfig,
	discoveredDOs: DiscoveredDO[],
	discoveredEntrypoints: DiscoveredEntrypoint[],
	referencedConfigs: ReferencedConfig[],
	cwd: string
): string {
	const doClassMap = new Map<string, { importPath: string; className: string }>()
	for (const doInfo of discoveredDOs) {
		doClassMap.set(doInfo.className, {
			importPath: generateImportPath(cwd, doInfo.filePath),
			className: doInfo.className
		})
	}

	const crossWorkerDOMap = new Map<string, CrossWorkerDOInfo>()
	for (const ref of referencedConfigs) {
		for (const doInfo of ref.durableObjects) {
			crossWorkerDOMap.set(doInfo.bindingName, doInfo)
		}
	}

	const serviceBindingMap = new Map<string, ServiceBindingInfo>()
	for (const ref of referencedConfigs) {
		for (const serviceBinding of ref.serviceBindings) {
			serviceBindingMap.set(serviceBinding.bindingName, serviceBinding)
		}
	}

	const usedTypes = new Set<string>()

	if (config.bindings) {
		if (config.bindings.kv && Object.keys(config.bindings.kv).length > 0) usedTypes.add('KVNamespace')
		if (config.bindings.d1 && Object.keys(config.bindings.d1).length > 0) usedTypes.add('D1Database')
		if (config.bindings.r2 && Object.keys(config.bindings.r2).length > 0) usedTypes.add('R2Bucket')
		if (config.bindings.durableObjects && Object.keys(config.bindings.durableObjects).length > 0) usedTypes.add('DurableObjectNamespace')
		if (config.bindings.queues?.producers && Object.keys(config.bindings.queues.producers).length > 0) usedTypes.add('Queue')
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

	const hasLocalDOsWithClasses = Boolean(
		config.bindings?.durableObjects
		&& Object.values(config.bindings.durableObjects).some((doConfig) => doConfig.className && doClassMap.has(doConfig.className))
	)
	const hasCrossWorkerDOs = crossWorkerDOMap.size > 0
	const hasDOsWithClasses = hasLocalDOsWithClasses || hasCrossWorkerDOs

	if (usedTypes.size > 0) {
		const sortedTypes = [...usedTypes].sort()
		if (hasDOsWithClasses) {
			lines.push(`import type { ${sortedTypes.join(', ')}, Rpc } from '@cloudflare/workers-types'`)
		} else {
			lines.push(`import type { ${sortedTypes.join(', ')} } from '@cloudflare/workers-types'`)
		}
		lines.push('')
	}

	const { lines: bindingMembers, imports: serviceImports } = generateBindingMembers(
		config,
		doClassMap,
		crossWorkerDOMap,
		serviceBindingMap,
		cwd,
		'\t\t'
	)
	const uniqueImports = [...new Set(serviceImports)]
	if (uniqueImports.length > 0) {
		lines.push(...uniqueImports)
		lines.push('')
	}

	lines.push('declare global {')
	lines.push('\tinterface DevflareEnv {')
	lines.push(...bindingMembers)
	lines.push('\t}')
	lines.push('}')
	lines.push('')

	if (discoveredEntrypoints.length > 0) {
		const entrypointNames = discoveredEntrypoints.map((entrypoint) => `'${entrypoint.className}'`).join(' | ')
		lines.push('/**')
		lines.push(' * Named entrypoints discovered from ep.*.ts files.')
		lines.push(' * Use with defineConfig<Entrypoints>() for type-safe cross-worker references.')
		lines.push(' */')
		lines.push(`export type Entrypoints = ${entrypointNames}`)
	} else {
		lines.push('/**')
		lines.push(' * Named entrypoints (none discovered - add ep.*.ts files to enable).')
		lines.push(' * Use with defineConfig<Entrypoints>() for type-safe cross-worker references.')
		lines.push(' */')
		lines.push('export type Entrypoints = string')
	}
	lines.push('')

	return lines.join('\n')
}
