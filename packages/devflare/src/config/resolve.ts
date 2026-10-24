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

function withNormalizedCompatibilityFlags(config: DevflareConfig): DevflareConfig {
	return {
		...config,
		compatibilityFlags: normalizeCompatibilityFlags(config.compatibilityFlags)
	}
}

export function mergeConfigForEnvironment(
	config: DevflareConfig,
	environment?: string
): DevflareConfig {
	if (!environment || !config.env?.[environment]) {
		return withNormalizedCompatibilityFlags(config)
	}

	const mergedConfig = mergeEnvironmentValue(config, config.env[environment]) as DevflareConfig

	return withNormalizedCompatibilityFlags(mergedConfig)
}

/**
 * @internal Prefer the unified `resolveResources(config, { phase: 'build' })`
 * facade for the env-merge + preview-materialize pipeline. This lower-level
 * helper remains exported as the implementation that the seam and the
 * build-time compiler delegate to; it is not part of the recommended public
 * surface.
 */
export function resolveConfigForEnvironment(
	config: DevflareConfig,
	environment?: string
): DevflareConfig {
	const mergedConfig = mergeConfigForEnvironment(config, environment)

	return materializePreviewScopedConfig(mergedConfig, {
		environment
	})
}
