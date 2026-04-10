// =============================================================================
// Case 17: Plugin Namespace Example - Fetch Handler
// =============================================================================
// Demonstrates plugin-shaped placeholders and virtual-module usage in source.
// The case name is legacy; this file should not be read as proof that the main
// worker pipeline already supports arbitrary Rolldown plugins end-to-end.
// =============================================================================

// Virtual module import (resolved by virtualModulesPlugin)
// @ts-expect-error - Virtual module resolved at build time
import { config } from 'virtual:config'

// Build-time constants (replaced by plugins)
const BUILD_TIME = '__BUILD_TIME__'
const ENV_MODE = '__ENV_MODE__'
const NODE_VERSION = '__NODE_VERSION__'

/**
 * Main fetch handler
 * Demonstrates plugin-shaped build-time placeholders and virtual modules
 */
export default async function fetch(
	request: Request,
	env: unknown,
	ctx: ExecutionContext
): Promise<Response> {
	const url = new URL(request.url)

	// Route: GET /
	if (url.pathname === '/') {
		return Response.json({
			name: 'Case 17: Plugin Namespace Example',
			description: 'Demonstrates plugin-shaped metadata and virtual-module patterns'
		})
	}

	// Route: GET /build-info
	if (url.pathname === '/build-info') {
		return Response.json({
			buildTime: BUILD_TIME,
			envMode: ENV_MODE,
			nodeVersion: NODE_VERSION
		})
	}

	// Route: GET /config
	if (url.pathname === '/config') {
		return Response.json(config)
	}

	// Route: GET /features
	if (url.pathname === '/features') {
		return Response.json({
			features: [
				{
					name: 'Build Metadata Plugin',
					description: 'Illustrates a build-time transform shape',
					usage: '__BUILD_TIME__ is replaced with actual build time'
				},
				{
					name: 'Env Info Plugin',
					description: 'Illustrates environment placeholder replacement',
					usage: '__ENV_MODE__ and __NODE_VERSION__ placeholders'
				},
				{
					name: 'Virtual Modules Plugin',
					description: 'Illustrates virtual module resolution patterns',
					usage: "import { config } from 'virtual:config'"
				}
			]
		})
	}

	return Response.json({ error: 'Not found' }, { status: 404 })
}
