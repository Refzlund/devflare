import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case6-queues-crons',

	bindings: {
		queues: {
			producers: {
				TASK_QUEUE: 'task-queue'
			},
			consumers: [
				{
					queue: 'task-queue',
					maxBatchSize: 10,
					maxRetries: 3
				}
			]
		},
		kv: {
			RESULTS: 'results-kv-id'
		}
	},

	triggers: {
		crons: ['0 */6 * * *', '0 0 * * 1']
	}
})
