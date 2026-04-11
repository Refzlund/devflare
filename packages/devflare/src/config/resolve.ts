import { defu } from 'defu'
import { materializePreviewScopedConfig } from './preview'
import type { DevflareConfig } from './schema'

export function mergeConfigForEnvironment(
	config: DevflareConfig,
	environment?: string
): DevflareConfig {
	return environment && config.env?.[environment]
		? defu(config.env[environment], config) as DevflareConfig
		: config
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