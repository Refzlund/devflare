// =============================================================================
// Dev server — pure binding-config translators
// =============================================================================
// Translates `DevflareConfig.bindings.queues` and `bindings.sendEmail` into
// the shapes Miniflare expects. Extracted from the long buildMiniflareConfig
// closure in server.ts so the translations are independently testable and the
// main dev-server file is easier to read.
// =============================================================================

import type { DevflareConfig } from '../config'

type Bindings = NonNullable<DevflareConfig['bindings']>

export function buildQueueProducers(
	bindings: Bindings
): Record<string, { queueName: string }> | undefined {
	if (!bindings.queues?.producers) {
		return undefined
	}

	const producers: Record<string, { queueName: string }> = {}
	for (const [bindingName, queueName] of Object.entries(bindings.queues.producers)) {
		producers[bindingName] = { queueName }
	}

	return producers
}

export function buildQueueConsumers(
	bindings: Bindings
): Record<string, Record<string, unknown>> | undefined {
	if (!bindings.queues?.consumers || bindings.queues.consumers.length === 0) {
		return undefined
	}

	const consumers: Record<string, Record<string, unknown>> = {}
	for (const consumer of bindings.queues.consumers) {
		consumers[consumer.queue] = {
			...(consumer.maxBatchSize !== undefined && { maxBatchSize: consumer.maxBatchSize }),
			...(consumer.maxBatchTimeout !== undefined && { maxBatchTimeout: consumer.maxBatchTimeout }),
			...(consumer.maxRetries !== undefined && { maxRetries: consumer.maxRetries }),
			...(consumer.deadLetterQueue && { deadLetterQueue: consumer.deadLetterQueue }),
			...(consumer.maxConcurrency !== undefined && { maxConcurrency: consumer.maxConcurrency }),
			...(consumer.retryDelay !== undefined && { retryDelay: consumer.retryDelay })
		}
	}

	return consumers
}

export function buildSendEmailConfig(
	bindings: Bindings
):
	| {
		send_email: Array<{
			name: string
			destination_address?: string
			allowed_destination_addresses?: string[]
			allowed_sender_addresses?: string[]
		}>
	}
	| undefined {
	if (!bindings.sendEmail) {
		return undefined
	}

	return {
		send_email: Object.entries(bindings.sendEmail).map(([name, binding]) => ({
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
