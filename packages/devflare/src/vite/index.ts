// =============================================================================
// Vite Module — Public Exports
// =============================================================================

export {
	devflarePlugin,
	getPluginContext,
	getCloudflareConfig,
	getDevflareConfigs,
	type DevflarePluginOptions,
	type DevflarePluginContext,
	type AuxiliaryWorkerConfig,
	type DODiscoveryResult
} from './plugin'
export {
	hasInlineViteConfig,
	resolveEffectiveViteProject,
	resolveViteUserConfig,
	writeGeneratedViteConfig,
	type EffectiveViteProjectDetection
} from './config-file'

// Re-export as default for convenience
export { devflarePlugin as default } from './plugin'
