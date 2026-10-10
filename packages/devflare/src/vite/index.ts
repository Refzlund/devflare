// =============================================================================
// Vite Module — Public Exports
// =============================================================================

export {
	type EffectiveViteProjectDetection,
	hasInlineViteConfig,
	resolveEffectiveViteProject,
	resolveViteUserConfig,
	writeGeneratedViteConfig
} from './config-file'
// Re-export as default for convenience
export {
	type AuxiliaryWorkerConfig,
	type DevflarePluginContext,
	type DevflarePluginOptions,
	type DODiscoveryResult,
	devflarePlugin,
	devflarePlugin as default,
	getCloudflareConfig,
	getDevflareConfigs,
	getPluginContext
} from './plugin'
