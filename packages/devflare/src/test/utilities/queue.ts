// =============================================================================
// Mock Queue
// =============================================================================

/**
 * Creates a mock Queue for testing
 */
export function createMockQueue(): Queue {
	const messages: Array<{ body: unknown; options?: unknown }> = []
	const metrics: QueueMetrics = {
		backlogCount: 0,
		backlogBytes: 0
	}
	const response = { metadata: { metrics } }

	return {
		async metrics(): Promise<QueueMetrics> {
			return metrics
		},

		async send(message: unknown, options?: QueueSendOptions): Promise<QueueSendResponse> {
			messages.push({ body: message, options })
			return response
		},

		async sendBatch(
			batch: Iterable<MessageSendRequest>,
			options?: QueueSendBatchOptions
		): Promise<QueueSendBatchResponse> {
			for (const message of batch) {
				messages.push({
					body: message.body,
					options: {
						contentType: message.contentType,
						delaySeconds: message.delaySeconds ?? options?.delaySeconds
					}
				})
			}
			return response
		},

		// Test helper to inspect sent messages
		_getMessages() {
			return messages
		}
	} as Queue & { _getMessages(): Array<{ body: unknown; options?: unknown }> }
}
