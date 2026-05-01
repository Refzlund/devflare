// =============================================================================
// Types Command — Generate TypeScript types from config
// =============================================================================

import { type ConsolaInstance } from 'consola'
import { resolve } from 'pathe'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { loadConfig, normalizeDOBinding } from '../../config'
import { getDependencies } from '../dependencies'
import { DEFAULT_DO_PATTERN, DEFAULT_ENTRYPOINT_PATTERN } from '../../utils/glob'
import { discoverEntrypointsAsync, type DiscoveredEntrypoint } from '../../utils/entrypoint-discovery'
import { resolveConfigCandidatePath } from '../config-path'
import { bold, createCliTheme, dim } from '../ui'
import { discoverDurableObjects, generateImportPath, resolveReferencedConfigs } from './type-generation/discovery'
import { generateBindingTypes } from './type-generation/generator'
import type { DiscoveredDO } from './type-generation/models'

function logTypesLine(logger: ConsolaInstance, message: string = ''): void {
	if (typeof logger.log === 'function') {
		logger.log(message)
		return
	}

	if (typeof logger.info === 'function') {
		logger.info(message)
	}
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

	logTypesLine(logger)
	logTypesLine(logger, `${bold('types', theme)} ${dim('Generating TypeScript bindings', theme)}`)

	try {
		const config = await loadConfig({ cwd, configFile: configPath })
		const requestedConfigPath = configPath
			? resolve(cwd, configPath)
			: cwd
		const actualConfigPath = await resolveConfigCandidatePath(requestedConfigPath)

		if (!actualConfigPath) {
			throw new Error('Could not resolve the loaded devflare config file path')
		}

		const doPattern = typeof config.files?.durableObjects === 'string'
			? config.files.durableObjects
			: DEFAULT_DO_PATTERN

		let discoveredDOs: DiscoveredDO[] = []
		if (config.files?.durableObjects !== false) {
			discoveredDOs = await discoverDurableObjects(cwd, doPattern)
			if (discoveredDOs.length > 0) {
				logTypesLine(logger, `Discovered ${discoveredDOs.length} Durable Object class(es):`)
				for (const doInfo of discoveredDOs) {
					logTypesLine(logger, `  • ${doInfo.className} → ${doInfo.bindingName}`)
				}
			}
		}

		if (config.bindings?.durableObjects) {
			for (const [bindingName, doConfig] of Object.entries(config.bindings.durableObjects)) {
				const normalized = normalizeDOBinding(doConfig)
				const className = normalized.className
				if (!className) {
					continue
				}

				const existing = discoveredDOs.find((doInfo) => doInfo.className === className)
				if (existing) {
					continue
				}

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

		const entrypointPattern = typeof config.files?.entrypoints === 'string'
			? config.files.entrypoints
			: DEFAULT_ENTRYPOINT_PATTERN

		let discoveredEntrypoints: DiscoveredEntrypoint[] = []
		if (config.files?.entrypoints !== false) {
			discoveredEntrypoints = await discoverEntrypointsAsync(cwd, entrypointPattern)
			if (discoveredEntrypoints.length > 0) {
				logTypesLine(logger, `Discovered ${discoveredEntrypoints.length} entrypoint class(es):`)
				for (const entrypoint of discoveredEntrypoints) {
					logTypesLine(logger, `  • ${entrypoint.className}`)
				}
			}
		}

		const referencedConfigs = await resolveReferencedConfigs(actualConfigPath, cwd)
		if (referencedConfigs.length > 0) {
			logTypesLine(logger, `Found ${referencedConfigs.length} referenced worker(s):`)
			for (const ref of referencedConfigs) {
				const typedBindings = ref.serviceBindings.filter((serviceBinding) => serviceBinding.interfaceType)
				if (typedBindings.length > 0) {
					logTypesLine(logger, `  • ${ref.varName}: ${typedBindings.map((serviceBinding) => `${serviceBinding.bindingName} → ${serviceBinding.interfaceType}`).join(', ')}`)
				}
			}
		}

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

		const types = generateBindingTypes(
			normalizedConfig,
			discoveredDOs,
			discoveredEntrypoints,
			referencedConfigs,
			cwd,
			{ configImportPath: generateImportPath(cwd, actualConfigPath) }
		)

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
