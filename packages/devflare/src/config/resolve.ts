import { normalizeCompatibilityFlags } from './compatibility'
import { materializePreviewScopedConfig } from './preview'
import type { DevflareConfig } from './schema'

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}

	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function mergeEnvironmentValue(base: unknown, override: unknown): unknown {
	if (override === undefined) {
		return base
	}

	if (Array.isArray(override)) {
		return [...override]
	}

	if (isPlainObject(override)) {
		const baseObject = isPlainObject(base) ? base : {}
		const mergedObject: Record<string, unknown> = {
			...baseObject
		}

		for (const [key, value] of Object.entries(override)) {
			mergedObject[key] = mergeEnvironmentValue(baseObject[key], value)
		}

		return mergedObject
	}

	return override
}

export function mergeConfigForEnvironment(
	config: DevflareConfig,
	environment?: string
): DevflareConfig {
	if (!environment || !config.env?.[environment]) {
		return config
	}

	const mergedConfig = mergeEnvironmentValue(config, config.env[environment]) as DevflareConfig

	return {
		...mergedConfig,
		compatibilityFlags: normalizeCompatibilityFlags(mergedConfig.compatibilityFlags)
	}
}

export function resolveConfigForEnvironment(
	config: DevflareConfig,
	environment?: string
): DevflareConfig {
	const mergedConfig = mergeConfigForEnvironment(config, environment)

	return materializePreviewScopedConfig(mergedConfig, {
		environment
	})
}