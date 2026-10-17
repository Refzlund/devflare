// =============================================================================
// SvelteKit Hooks — Server-side request handling
// =============================================================================
// In development mode with devflare, use the pre-configured handle that
// auto-loads binding hints from devflare.config.ts.
// =============================================================================

import { sequence } from '@sveltejs/kit/hooks'
import { handle as devflareHandle } from 'devflare/sveltekit'

// Devflare handle must be first to set up platform.env
// Add your own hooks after it in the sequence
export const handle = sequence(
	devflareHandle
	// Add your own handles here, e.g.:
	// authHandle,
	// loggingHandle,
)
