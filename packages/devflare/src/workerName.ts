// =============================================================================
// workerName — Current worker's name (build-time injected)
// =============================================================================
// This module exports the current worker's name as configured in devflare.config.ts
// The value is injected at build time by the devflare bundler.
//
// Usage:
//   import { workerName } from 'devflare'
//   console.log(`Running in worker: ${workerName}`)
// =============================================================================

// Declare the build-time injected global
declare const __DEVFLARE_WORKER_NAME__: string | undefined

/**
 * The current worker's name from devflare.config.ts
 *
 * This value is injected at build time by the devflare bundler.
 * In development (non-bundled), it will be 'unknown' or throw an error.
 *
 * @example
 * import { workerName } from 'devflare'
 *
 * export default {
 *   fetch(request) {
 *     return new Response(`Hello from ${workerName}`)
 *   }
 * }
 */
export const workerName: string = (() => {
	// This placeholder is replaced at build time by the bundler
	// See: bundler/index.ts for the replacement logic

	// Check if we're in a bundled environment with injected value
	// The bundler replaces this entire module with a simple export
	if (typeof __DEVFLARE_WORKER_NAME__ !== 'undefined') {
		return __DEVFLARE_WORKER_NAME__
	}

	// In dev mode or tests, try to read from environment
	if (typeof process !== 'undefined' && process.env?.DEVFLARE_WORKER_NAME) {
		return process.env.DEVFLARE_WORKER_NAME
	}

	// Fallback for development/testing
	return 'unknown'
})()
