import { defu } from 'defu'
import type { DevflareConfig } from './schema'

export function resolveConfigForEnvironment(
	config: DevflareConfig,
	environment?: string
): DevflareConfig {
	if (environment && config.env?.[environment]) {
		return defu(config.env[environment], config) as DevflareConfig
	}

	return config
}