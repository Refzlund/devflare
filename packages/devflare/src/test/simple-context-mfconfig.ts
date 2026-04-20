// =============================================================================
// Test-context inline-bridge Miniflare config builder
// =============================================================================
// Translates the user's `config.bindings` (KV / R2 / D1 / queues / send_email)
// and `config.vars` into the seed `mfConfig` object that the bridge gateway
// script will run as a single worker. This is the "single-worker" baseline;
// `applyMultiWorkerConfig` rewrites it in place when cross-worker bindings
// are detected.
// =============================================================================

import { getLocalD1DatabaseIdentifier } from '../config'
import type { DevflareConfig } from '../config'

/**
 * Build the seed Miniflare config for an inline (single-worker) bridge.
 * Pure: no I/O, no closures.
 */
export function buildInlineBridgeMfConfig(config: DevflareConfig): any {
	const localWorkerBindings: Record<string, unknown> = config.vars ?? {}
	const mfConfig: any = {
		modules: true
	}

	if (config.bindings?.kv) {
		mfConfig.kvNamespaces = Object.keys(config.bindings.kv)
	}
	if (config.bindings?.r2) {
		mfConfig.r2Buckets = Object.keys(config.bindings.r2)
	}
	if (config.bindings?.d1) {
		mfConfig.d1Databases = Object.fromEntries(
			Object.entries(config.bindings.d1).map(([bindingName, bindingConfig]) => {
				return [bindingName, getLocalD1DatabaseIdentifier(bindingConfig)]
			})
		)
	}

	if (config.bindings?.queues?.producers) {
		const queueProducers: Record<string, { queueName: string }> = {}
		for (const [bindingName, queueName] of Object.entries(config.bindings.queues.producers)) {
			queueProducers[bindingName] = { queueName }
		}
		mfConfig.queueProducers = queueProducers
	}

	if (Object.keys(localWorkerBindings).length > 0) {
		mfConfig.bindings = localWorkerBindings
	}

	if (config.bindings?.sendEmail) {
		mfConfig.email = {
			send_email: Object.entries(config.bindings.sendEmail).map(([name, binding]) => ({
				name,
				...(binding.destinationAddress && {
					destination_address: binding.destinationAddress
				}),
				...(binding.allowedDestinationAddresses && {
					allowed_destination_addresses: binding.allowedDestinationAddresses
				}),
				...(binding.allowedSenderAddresses && {
					allowed_sender_addresses: binding.allowedSenderAddresses
				})
			}))
		}
	}

	return mfConfig
}
