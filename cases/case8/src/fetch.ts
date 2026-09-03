// =============================================================================
// Case 8: File-Based Routing - Fetch Handler
// =============================================================================
// Demonstrates route-module organization with a manual router:
// - src/fetch.ts as main entry point
// - src/routes/ folder for route-module organization
// - src/lib/ for shared utilities like Router
// =============================================================================

import type { FetchEvent } from 'devflare/runtime'
import { Router } from './lib/router'

// Import route handlers
import * as indexRoutes from './routes/index'
import * as userRoutes from './routes/users/[id]'
import * as apiRoutes from './routes/api/[...path]'

// Build router from file-based routes
const router = new Router()

// Register routes manually.
// Devflare does not currently auto-generate a built-in route tree dispatcher from files.routes.
router.get('/', indexRoutes.GET)
router.get('/users/:id', userRoutes.GET)
router.put('/users/:id', userRoutes.PUT)
router.delete('/users/:id', userRoutes.DELETE)
router.get('/api/[...path]', apiRoutes.GET)

/**
 * Main fetch handler
 * Routes requests to file-based route handlers
 */

export async function fetch({ request }: FetchEvent): Promise<Response> {
	return router.handle(request)
}

// Re-export Router for testing
export { Router } from './lib/router'
