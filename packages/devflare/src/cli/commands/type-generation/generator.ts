import type {
	D1Binding,
	DurableObjectBinding,
	HyperdriveBinding,
	KVBinding,
	QueueProducer,
	R2Binding
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
	rules?: Array<{
		type?: string
		globs?: string[]
		fallthrough?: boolean
	}>
	bindings?: {
		kv?: Record<string, KVBinding>
		d1?: Record<string, D1Binding>
		r2?: Record<string, R2Binding>
		durableObjects?: Record<string, { className?: string; scriptName?: string }>
		queues?: { producers?: Record<string, QueueProducer>; consumers?: unknown[] }
		rateLimits?: Record<
			string,
			{
				namespaceId?: string
				simple?: { limit?: number; period?: 10 | 60 }
			}
		>
		versionMetadata?: { binding?: string }
		workerLoaders?: Record<string, Record<string, never>>
		mtlsCertificates?: Record<
			string,
			| string
			| {
					certificateId?: string
					certificate_id?: string
					remote?: boolean
			  }
		>
		dispatchNamespaces?: Record<
			string,
			| string
			| {
					namespace?: string
					outbound?: unknown
					remote?: boolean
			  }
		>
		workflows?: Record<
			string,
			{
				name?: string
				className?: string
				scriptName?: string
				remote?: boolean
				limits?: { steps?: number }
			}
		>
		pipelines?: Record<
			string,
			| string
			| {
					pipeline?: string
					remote?: boolean
			  }
		>
		images?: Record<
			string,
			| true
			| {
					remote?: boolean
			  }
		>
		media?: Record<
			string,
			| true
			| {
					remote?: boolean
			  }
		>
		stream?: Record<
			string,
			| true
			| {
					remote?: boolean
			  }
		>
		vpcServices?: Record<string, unknown>
		vpcNetworks?: Record<string, unknown>
		flagship?: Record<
			string,
			{
				appId?: string
				remote?: boolean
			}
		>
		artifacts?: Record<
			string,
			| string
			| {
					namespace?: string
					remote?: boolean
			  }
		>
		secretsStore?: Record<string, string | { storeId?: string; secretName?: string }>
		services?: Record<string, { service?: string }>
		ai?: { binding?: string; remote?: boolean; staging?: boolean }
		aiSearchNamespaces?: Record<string, { namespace?: string; remote?: boolean }>
		aiSearch?: Record<string, { instanceName?: string; remote?: boolean }>
		vectorize?: Record<string, { indexName?: string; remote?: boolean }>
		hyperdrive?: Record<string, HyperdriveBinding>
		browser?: Record<string, string | { remote?: boolean }>
		analyticsEngine?: Record<string, { dataset?: string }>
		sendEmail?: Record<
			string,
			{
				destinationAddress?: string
				allowedDestinationAddresses?: string[]
				allowedSenderAddresses?: string[]
			}
		>
	}
	vars?: Record<string, unknown>
	secrets?: Record<string, { required?: boolean }>
}

function generateBindingMembers(
	config: TypeGenerationConfig,
	doClassMap: Map<string, { importPath: string; className: string }>,
	crossWorkerDOMap: Map<string, CrossWorkerDOInfo>,
	serviceBindingMap: Map<string, ServiceBindingInfo>,
	cwd: string,
	indent: string,
	options: { includeVarsAsMembers?: boolean } = {}
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
					lines.push(
						`${indent}${binding}: DurableObjectNamespace<Rpc.DurableObjectBranded & import('${importPath}').${crossWorkerDO.className}>`
					)
					continue
				}

				const className = doConfig.className
				if (className) {
					const classInfo = doClassMap.get(className)
					if (classInfo) {
						lines.push(
							`${indent}${binding}: DurableObjectNamespace<Rpc.DurableObjectBranded & import('${classInfo.importPath}').${classInfo.className}>`
						)
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

		if (config.bindings.rateLimits) {
			for (const binding of Object.keys(config.bindings.rateLimits)) {
				lines.push(`${indent}${binding}: RateLimit`)
			}
		}

		if (config.bindings.versionMetadata?.binding) {
			lines.push(`${indent}${config.bindings.versionMetadata.binding}: WorkerVersionMetadata`)
		}

		if (config.bindings.workerLoaders) {
			for (const binding of Object.keys(config.bindings.workerLoaders)) {
				lines.push(`${indent}${binding}: WorkerLoader`)
			}
		}

		if (config.bindings.mtlsCertificates) {
			for (const binding of Object.keys(config.bindings.mtlsCertificates)) {
				lines.push(`${indent}${binding}: Fetcher`)
			}
		}

		if (config.bindings.dispatchNamespaces) {
			for (const binding of Object.keys(config.bindings.dispatchNamespaces)) {
				lines.push(`${indent}${binding}: DispatchNamespace`)
			}
		}

		if (config.bindings.workflows) {
			for (const binding of Object.keys(config.bindings.workflows)) {
				lines.push(`${indent}${binding}: Workflow`)
			}
		}

		if (config.bindings.pipelines) {
			imports.push("import type { Pipeline } from 'cloudflare:pipelines'")
			for (const binding of Object.keys(config.bindings.pipelines)) {
				lines.push(`${indent}${binding}: Pipeline`)
			}
		}

		if (config.bindings.images) {
			for (const binding of Object.keys(config.bindings.images)) {
				lines.push(`${indent}${binding}: ImagesBinding`)
			}
		}

		if (config.bindings.media) {
			for (const binding of Object.keys(config.bindings.media)) {
				lines.push(`${indent}${binding}: MediaBinding`)
			}
		}

		if (config.bindings.stream) {
			for (const binding of Object.keys(config.bindings.stream)) {
				lines.push(`${indent}${binding}: StreamBinding`)
			}
		}

		if (config.bindings.flagship) {
			for (const binding of Object.keys(config.bindings.flagship)) {
				lines.push(`${indent}${binding}: Flagship`)
			}
		}

		if (config.bindings.vpcServices) {
			for (const binding of Object.keys(config.bindings.vpcServices)) {
				lines.push(`${indent}${binding}: Fetcher`)
			}
		}

		if (config.bindings.vpcNetworks) {
			for (const binding of Object.keys(config.bindings.vpcNetworks)) {
				lines.push(`${indent}${binding}: Fetcher`)
			}
		}

		if (config.bindings.artifacts) {
			for (const binding of Object.keys(config.bindings.artifacts)) {
				lines.push(`${indent}${binding}: Artifacts`)
			}
		}

		if (config.bindings.secretsStore) {
			for (const binding of Object.keys(config.bindings.secretsStore)) {
				lines.push(`${indent}${binding}: SecretsStoreSecret`)
			}
		}

		if (config.bindings.services) {
			for (const binding of Object.keys(config.bindings.services)) {
				const serviceInfo = serviceBindingMap.get(binding)
				if (serviceInfo?.interfaceType && serviceInfo.interfaceImport) {
					imports.push(
						`import type { ${serviceInfo.interfaceType} } from '${serviceInfo.interfaceImport}'`
					)
					lines.push(`${indent}${binding}: ${serviceInfo.interfaceType}`)
					continue
				}

				lines.push(`${indent}${binding}: Fetcher`)
			}
		}

		if (config.bindings.ai) {
			lines.push(`${indent}${config.bindings.ai.binding}: Ai`)
		}

		if (config.bindings.aiSearchNamespaces) {
			for (const binding of Object.keys(config.bindings.aiSearchNamespaces)) {
				lines.push(`${indent}${binding}: AiSearchNamespace`)
			}
		}

		if (config.bindings.aiSearch) {
			for (const binding of Object.keys(config.bindings.aiSearch)) {
				lines.push(`${indent}${binding}: AiSearchInstance`)
			}
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

	if (options.includeVarsAsMembers !== false && config.vars) {
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

function normalizeModuleDeclarationGlob(glob: string): string {
	return glob
		.replace(/\\/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\*\*\//, '')
}

function generateModuleRuleDeclarations(config: TypeGenerationConfig): string[] {
	const declarations: string[] = []
	const seen = new Set<string>()
	const typeByRuleType: Record<string, string> = {
		Text: 'string',
		Data: 'ArrayBuffer',
		CompiledWasm: 'WebAssembly.Module'
	}

	for (const rule of config.rules ?? []) {
		const valueType = rule.type ? typeByRuleType[rule.type] : undefined
		if (!valueType) {
			continue
		}

		for (const glob of rule.globs ?? []) {
			const specifier = normalizeModuleDeclarationGlob(glob)
			const key = `${specifier}:${valueType}`
			if (seen.has(key)) {
				continue
			}

			seen.add(key)
			declarations.push(`declare module '${specifier}' {`)
			declarations.push(`\tconst value: ${valueType}`)
			declarations.push('\texport default value')
			declarations.push('}')
			declarations.push('')
		}
	}

	return declarations
}

export function generateBindingTypes(
	config: TypeGenerationConfig,
	discoveredDOs: DiscoveredDO[],
	discoveredEntrypoints: DiscoveredEntrypoint[],
	referencedConfigs: ReferencedConfig[],
	cwd: string,
	options: { configImportPath?: string } = {}
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
		if (config.bindings.kv && Object.keys(config.bindings.kv).length > 0)
			usedTypes.add('KVNamespace')
		if (config.bindings.d1 && Object.keys(config.bindings.d1).length > 0)
			usedTypes.add('D1Database')
		if (config.bindings.r2 && Object.keys(config.bindings.r2).length > 0) usedTypes.add('R2Bucket')
		if (config.bindings.durableObjects && Object.keys(config.bindings.durableObjects).length > 0)
			usedTypes.add('DurableObjectNamespace')
		if (
			config.bindings.queues?.producers &&
			Object.keys(config.bindings.queues.producers).length > 0
		)
			usedTypes.add('Queue')
		if (config.bindings.rateLimits && Object.keys(config.bindings.rateLimits).length > 0)
			usedTypes.add('RateLimit')
		if (config.bindings.versionMetadata?.binding) usedTypes.add('WorkerVersionMetadata')
		if (config.bindings.workerLoaders && Object.keys(config.bindings.workerLoaders).length > 0)
			usedTypes.add('WorkerLoader')
		if (
			config.bindings.mtlsCertificates &&
			Object.keys(config.bindings.mtlsCertificates).length > 0
		)
			usedTypes.add('Fetcher')
		if (
			config.bindings.dispatchNamespaces &&
			Object.keys(config.bindings.dispatchNamespaces).length > 0
		)
			usedTypes.add('DispatchNamespace')
		if (config.bindings.workflows && Object.keys(config.bindings.workflows).length > 0)
			usedTypes.add('Workflow')
		if (config.bindings.images && Object.keys(config.bindings.images).length > 0)
			usedTypes.add('ImagesBinding')
		if (config.bindings.media && Object.keys(config.bindings.media).length > 0)
			usedTypes.add('MediaBinding')
		if (config.bindings.stream && Object.keys(config.bindings.stream).length > 0)
			usedTypes.add('StreamBinding')
		if (config.bindings.flagship && Object.keys(config.bindings.flagship).length > 0)
			usedTypes.add('Flagship')
		if (config.bindings.vpcServices && Object.keys(config.bindings.vpcServices).length > 0)
			usedTypes.add('Fetcher')
		if (config.bindings.vpcNetworks && Object.keys(config.bindings.vpcNetworks).length > 0)
			usedTypes.add('Fetcher')
		if (config.bindings.artifacts && Object.keys(config.bindings.artifacts).length > 0)
			usedTypes.add('Artifacts')
		if (config.bindings.secretsStore && Object.keys(config.bindings.secretsStore).length > 0)
			usedTypes.add('SecretsStoreSecret')
		if (config.bindings.services) {
			const hasUntypedServices = Object.keys(config.bindings.services).some(
				(name) => !serviceBindingMap.get(name)?.interfaceType
			)
			if (hasUntypedServices) usedTypes.add('Fetcher')
		}
		if (config.bindings.ai) usedTypes.add('Ai')
		if (
			config.bindings.aiSearchNamespaces &&
			Object.keys(config.bindings.aiSearchNamespaces).length > 0
		) {
			usedTypes.add('AiSearchNamespace')
		}
		if (config.bindings.aiSearch && Object.keys(config.bindings.aiSearch).length > 0) {
			usedTypes.add('AiSearchInstance')
		}
		if (config.bindings.vectorize && Object.keys(config.bindings.vectorize).length > 0)
			usedTypes.add('VectorizeIndex')
		if (config.bindings.hyperdrive && Object.keys(config.bindings.hyperdrive).length > 0)
			usedTypes.add('Hyperdrive')
		if (config.bindings.browser && Object.keys(config.bindings.browser).length > 0)
			usedTypes.add('Fetcher')
		if (config.bindings.analyticsEngine && Object.keys(config.bindings.analyticsEngine).length > 0)
			usedTypes.add('AnalyticsEngineDataset')
		if (config.bindings.sendEmail && Object.keys(config.bindings.sendEmail).length > 0)
			usedTypes.add('SendEmail')
	}

	const lines: string[] = [
		'// Generated by devflare - DO NOT EDIT',
		'// Run `devflare types` to regenerate',
		''
	]
	const hasConfigVars = Boolean(config.vars && Object.keys(config.vars).length > 0)

	const hasLocalDOsWithClasses = Boolean(
		config.bindings?.durableObjects &&
			Object.values(config.bindings.durableObjects).some(
				(doConfig) => doConfig.className && doClassMap.has(doConfig.className)
			)
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

	if (hasConfigVars) {
		const configImportPath = options.configImportPath ?? './devflare.config'
		lines.push("import type { InferConfigVars } from 'devflare/config'")
		lines.push(
			`type __DevflareConfigVars = InferConfigVars<Awaited<typeof import('${configImportPath}').default>>`
		)
		lines.push('')
	}

	const { lines: bindingMembers, imports: serviceImports } = generateBindingMembers(
		config,
		doClassMap,
		crossWorkerDOMap,
		serviceBindingMap,
		cwd,
		'\t\t',
		{ includeVarsAsMembers: !hasConfigVars }
	)
	const uniqueImports = [...new Set(serviceImports)]
	if (uniqueImports.length > 0) {
		lines.push(...uniqueImports)
		lines.push('')
	}

	lines.push('declare global {')
	if (hasConfigVars) {
		lines.push('\tinterface DevflareVars extends __DevflareConfigVars {}')
		lines.push('\tinterface DevflareEnv extends __DevflareConfigVars {')
	} else {
		lines.push('\tinterface DevflareEnv {')
	}
	lines.push(...bindingMembers)
	lines.push('\t}')
	lines.push('}')
	lines.push('')

	lines.push(...generateModuleRuleDeclarations(config))

	if (discoveredEntrypoints.length > 0) {
		const entrypointNames = discoveredEntrypoints
			.map((entrypoint) => `'${entrypoint.className}'`)
			.join(' | ')
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
