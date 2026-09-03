// =============================================================================
// Case 17: Vite Plugin Namespace - Custom Config
// =============================================================================
// Demonstrates the schema-level `vite` namespace and plugin-shaped metadata.
// This case is useful as a config/example reference, but it is not a proof that
// the main worker pipeline currently wires those plugins through end-to-end.
// =============================================================================

import { defineConfig } from 'devflare/config'
import type { Plugin } from 'vite'

/**
 * Custom plugin that adds build metadata
 */
function buildMetadataPlugin(): Plugin {
	const buildTime = new Date().toISOString()

	return {
		name: 'build-metadata',
		transform(code, id) {
			if (id.endsWith('.ts') && code.includes('__BUILD_TIME__')) {
				return code.replace(/__BUILD_TIME__/g, JSON.stringify(buildTime))
			}
			return null
		}
	}
}

/**
 * Custom plugin that adds environment info
 */
function envInfoPlugin(): Plugin {
	return {
		name: 'env-info',
		transform(code, id) {
			if (id.endsWith('.ts')) {
				return code
					.replace(/__ENV_MODE__/g, JSON.stringify(process.env.NODE_ENV ?? 'development'))
					.replace(/__NODE_VERSION__/g, JSON.stringify(process.version))
			}
			return null
		}
	}
}

/**
 * Custom plugin for virtual modules
 */
function virtualModulesPlugin(): Plugin {
	const virtualModuleId = 'virtual:config'
	const resolvedVirtualModuleId = '\0' + virtualModuleId

	return {
		name: 'virtual-modules',
		resolveId(id) {
			if (id === virtualModuleId) {
				return resolvedVirtualModuleId
			}
			return null
		},
		load(id) {
			if (id === resolvedVirtualModuleId) {
				return `
					export const config = {
						name: 'case17-rolldown-plugin',
						version: '1.0.0',
						features: ['custom-plugins', 'virtual-modules', 'transforms']
					}
				`
			}
			return null
		}
	}
}

export default defineConfig({
	name: 'case17-rolldown-plugin',
	compatibilityDate: '2026-04-26',

	vite: {
		plugins: [
			buildMetadataPlugin(),
			envInfoPlugin(),
			virtualModulesPlugin()
		]
	}
})
