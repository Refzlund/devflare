// =============================================================================
// Dev Server — Miniflare worker-config builders
// =============================================================================
// Pure helpers extracted from createDevServer().buildMiniflareConfig().
// Make these explicit-input so they can be unit-tested without spinning up
// the full dev server.
// =============================================================================

import type { DevflareConfig } from '../config'
import { getLocalD1DatabaseIdentifier, getLocalKVNamespaceIdentifier } from '../config/schema'
import type { buildSendEmailConfig } from './miniflare-bindings'

type Bindings = NonNullable<DevflareConfig['bindings']>
type SendEmailConfig = ReturnType<typeof buildSendEmailConfig>

export type MiniflareServiceBinding = { name: string; entrypoint?: string }

/**
 * Build the per-worker `serviceBindings` map. Combines user-declared
 * `bindings.services` (config) with any extra bindings the caller wants to
 * inject (e.g. internal gateway -> app routing).
 */
export function buildServiceBindings(
	bindings: Bindings,
	extraBindings: Record<string, MiniflareServiceBinding> = {}
): Record<string, MiniflareServiceBinding> | undefined {
	const serviceBindings: Record<string, MiniflareServiceBinding> = {}

	if (bindings.services) {
		for (const [bindingName, serviceConfig] of Object.entries(bindings.services)) {
			serviceBindings[bindingName] = {
				name: serviceConfig.service,
				...(serviceConfig.entrypoint && { entrypoint: serviceConfig.entrypoint })
			}
		}
	}

	for (const [bindingName, target] of Object.entries(extraBindings)) {
		serviceBindings[bindingName] = target
	}

	return Object.keys(serviceBindings).length > 0 ? serviceBindings : undefined
}

export interface MakeMiniflareWorkerOptions {
	name: string
	script?: string
	scriptPath?: string
	durableObjects?: Record<string, string | { className: string; scriptName: string }>
	serviceBindings?: Record<string, MiniflareServiceBinding>
	queueConsumers?: Record<string, Record<string, unknown>>
	triggers?: { crons?: string[] }
}

export interface MakeMiniflareWorkerContext {
	cwd: string
	loadedConfig: DevflareConfig
	bindings: Bindings
	sendEmailConfig: SendEmailConfig
	queueProducers: Record<string, { queueName: string }> | undefined
}

/**
 * Build a single worker config object for Miniflare's `workers` array.
 * All inputs are passed explicitly (no closures over the caller's locals).
 */
export function makeMiniflareWorker(
	context: MakeMiniflareWorkerContext,
	options: MakeMiniflareWorkerOptions
): any {
	const { cwd, loadedConfig, bindings, sendEmailConfig, queueProducers } = context

	const baseFlags = loadedConfig.compatibilityFlags ?? []
	const compatFlags = baseFlags.includes('nodejs_compat')
		? baseFlags
		: [...baseFlags, 'nodejs_compat']
	const workerBindings: Record<string, unknown> = loadedConfig.vars ?? {}

	const workerConfig: any = {
		name: options.name,
		modules: true,
		compatibilityDate: loadedConfig.compatibilityDate,
		compatibilityFlags: compatFlags,
		...(bindings.kv && {
			kvNamespaces: Object.fromEntries(
				Object.entries(bindings.kv).map(([bindingName, bindingConfig]) => {
					return [bindingName, getLocalKVNamespaceIdentifier(bindingConfig)]
				})
			)
		}),
		...(bindings.r2 && { r2Buckets: bindings.r2 }),
		...(bindings.d1 && {
			d1Databases: Object.fromEntries(
				Object.entries(bindings.d1).map(([bindingName, bindingConfig]) => {
					return [bindingName, getLocalD1DatabaseIdentifier(bindingConfig)]
				})
			)
		}),
		...(Object.keys(workerBindings).length > 0 && { bindings: workerBindings }),
		...(sendEmailConfig && { email: sendEmailConfig }),
		...(queueProducers && { queueProducers }),
		...(options.queueConsumers && { queueConsumers: options.queueConsumers }),
		...(options.triggers && { triggers: options.triggers })
	}

	if (options.scriptPath) {
		workerConfig.scriptPath = options.scriptPath
		workerConfig.modulesRoot = cwd
		workerConfig.modulesRules = [
			{ type: 'ESModule', include: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.mjs'] },
			{ type: 'CommonJS', include: ['**/*.js', '**/*.cjs'] },
			{ type: 'ESModule', include: ['**/*.jsx'] }
		]
	}

	if (options.script) {
		workerConfig.script = options.script
	}

	if (options.durableObjects && Object.keys(options.durableObjects).length > 0) {
		workerConfig.durableObjects = options.durableObjects
	}

	if (options.serviceBindings && Object.keys(options.serviceBindings).length > 0) {
		workerConfig.serviceBindings = options.serviceBindings
	}

	return workerConfig
}
