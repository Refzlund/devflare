// =============================================================================
// SvelteKit Integration Module
// =============================================================================
// Provides utilities for integrating devflare with SvelteKit
// =============================================================================

export {
	// Pre-configured handle — just re-export for simplest usage
	handle,
	// Factory for custom configuration
	createDevflarePlatform,
	createHandle,
	// Utilities
	resetPlatform,
	resetConfigCache,
	isDevflareDev,
	getBridgePort,
	// Types
	type Platform,
	type DevflarePlatformOptions,
	type CreateHandleOptions
} from './platform'
