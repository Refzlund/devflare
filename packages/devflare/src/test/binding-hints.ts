// =============================================================================
// Binding Hints — Shared extractor for test contexts
// =============================================================================

import type { BindingHints } from '../bridge/proxy'
import type { DevflareConfig } from '../config'

/**
 * Derive `BindingHints` from a resolved Devflare config.
 *
 * Used by both `createTestContext` (simple-context) and `createBridgeTestContext`
 * (bridge-context) to avoid duplicating the mapping between config sections and
 * hint kinds.
 */
export function extractBindingHints(config: DevflareConfig): BindingHints {
	const hints: BindingHints = {}

	if (config.bindings?.kv) {
		for (const name of Object.keys(config.bindings.kv)) {
			hints[name] = 'kv'
		}
	}
	if (config.bindings?.r2) {
		for (const name of Object.keys(config.bindings.r2)) {
			hints[name] = 'r2'
		}
	}
	if (config.bindings?.d1) {
		for (const name of Object.keys(config.bindings.d1)) {
			hints[name] = 'd1'
		}
	}
	if (config.bindings?.durableObjects) {
		for (const name of Object.keys(config.bindings.durableObjects)) {
			hints[name] = 'do'
		}
	}
	if (config.bindings?.services) {
		for (const name of Object.keys(config.bindings.services)) {
			hints[name] = 'service'
		}
	}
	if (config.bindings?.queues?.consumers) {
		for (const consumer of config.bindings.queues.consumers) {
			hints[consumer.queue] = 'queue'
		}
	}
	if (config.bindings?.queues?.producers) {
		for (const name of Object.keys(config.bindings.queues.producers)) {
			hints[name] = 'queue'
		}
	}
	if (config.bindings?.ai) {
		hints[config.bindings.ai.binding] = 'ai'
	}
	if (config.bindings?.sendEmail) {
		for (const name of Object.keys(config.bindings.sendEmail)) {
			hints[name] = 'sendEmail'
		}
	}
	if (config.bindings?.workflows) {
		for (const name of Object.keys(config.bindings.workflows)) {
			hints[name] = 'workflow'
		}
	}

	return hints
}
