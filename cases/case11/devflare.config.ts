import { defineConfig, ref } from 'devflare/config'

// =============================================================================
// Case 11: Cross-Package Durable Objects (Monorepo Pattern)
// =============================================================================
// Demonstrates using a Durable Object from a shared workspace package via ref().
//
// Monorepo Pattern:
//   1. Add workspace dependency: "@devflare/case11-do-shared": "workspace:*"
//   2. Shared package exports its devflare.config: "./devflare.config": "./devflare.config.ts"
//   3. Use ref() with package import (NOT relative path):
//      const doShared = ref(() => import('@devflare/case11-do-shared/devflare.config'))
//   4. Use doShared.BINDING_NAME to get cross-package DO bindings
//   5. Access the DO: env.SESSION_STORE.get(id).getSession('user123')
//
// The test context automatically sets up multi-worker Miniflare when it
// detects cross-worker DO bindings (those with __ref).
//
// NOTE: This is the recommended pattern for monorepos. Relative paths like
// '../case11-do-shared/devflare.config' work but don't demonstrate the
// full monorepo workflow with proper package boundaries.
// =============================================================================

const doShared = ref(() => import('@devflare/case11-do-shared/devflare.config'))

export default defineConfig({
	name: 'case11-cross-package-do',

	bindings: {
		durableObjects: {
			// Cross-package DO — hosted by case11-do-shared
			// doShared.SESSION_STORE returns { className: 'SessionStore', scriptName: 'case11-do-shared', __ref }
			SESSION_STORE: doShared.SESSION_STORE
		}
	}
})
