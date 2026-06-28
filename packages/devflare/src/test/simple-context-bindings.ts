// =============================================================================
// Test Context — Remote/static binding initialization
// =============================================================================
// Pure helper extracted from createTestContext(). Builds the initial
// `remoteBindings` map from the resolved devflare config: remote AI/Vectorize
// proxies (only when remote mode is active), config `vars`, and local
// sendEmail bindings.
// =============================================================================

import { isRemoteModeActive } from '../cloudflare/remote-config'
import type { DevflareConfig } from '../config'
import { createLocalWorkerLoaderBinding } from '../shims/local-worker-loader'
import { createLocalSendEmailBinding } from '../utils/send-email'
import { createRemoteAI } from './remote-ai'
import { createRemoteVectorize } from './remote-vectorize'
import { createMockVersionMetadata } from './utilities'

/**
 * Build the initial remote/static binding map for a test context.
 *
 * - When `isRemoteModeActive()`, registers `RemoteAI` / `RemoteVectorize`
 *   proxies for every `bindings.ai` / `bindings.vectorize` entry. Otherwise
 *   those bindings are left to come from Miniflare (or remain absent).
 * - `config.vars` are always copied in as-is.
 * - `config.bindings.sendEmail` is always wired to the local SendEmail
 *   binding (so tests can intercept outgoing mail without remote setup).
 */
export function buildRemoteAndStaticBindings(config: DevflareConfig): Record<string, unknown> {
	const remoteBindings: Record<string, unknown> = {}

	if (isRemoteModeActive()) {
		if (config.bindings?.ai) {
			const aiBindingName = config.bindings.ai.binding || 'AI'
			remoteBindings[aiBindingName] = createRemoteAI(config.accountId)
		}

		if (config.bindings?.vectorize) {
			for (const [name, vectorConfig] of Object.entries(config.bindings.vectorize)) {
				remoteBindings[name] = createRemoteVectorize(vectorConfig.indexName, config.accountId)
			}
		}
	}

	if (config.vars) {
		for (const [key, value] of Object.entries(config.vars)) {
			remoteBindings[key] = value
		}
	}

	if (config.bindings?.sendEmail) {
		for (const [name, binding] of Object.entries(config.bindings.sendEmail)) {
			remoteBindings[name] = createLocalSendEmailBinding(binding)
		}
	}

	if (config.bindings?.workerLoaders) {
		for (const name of Object.keys(config.bindings.workerLoaders)) {
			remoteBindings[name] = createLocalWorkerLoaderBinding()
		}
	}

	if (config.bindings?.versionMetadata) {
		remoteBindings[config.bindings.versionMetadata.binding] = createMockVersionMetadata()
	}

	return remoteBindings
}
