// =============================================================================
// SvelteKit Integration Module
// =============================================================================
// Provides utilities for integrating devflare with SvelteKit
// =============================================================================

export {
	type CreateHandleOptions,
	// Factory for custom configuration
	createDevflarePlatform,
	createHandle,
	type DevflarePlatformOptions,
	getBridgePort,
	// Pre-configured handle — just re-export for simplest usage
	handle,
	isDevflareDev,
	// Types
	type Platform,
	resetConfigCache,
	// Utilities
	resetPlatform
} from './platform'
