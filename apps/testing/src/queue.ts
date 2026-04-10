import { stateKeys, writeJson } from './state'

interface QueueMessage<Body = unknown> {
	body: Body
	ack?(): void
}

interface QueueBatch<Body = unknown> {
	queue: string
	messages: QueueMessage<Body>[]
}

interface QueueEnv {
	SESSIONS: KVNamespace
	APP_NAME: string
}

export async function queue(batch: QueueBatch, env: QueueEnv): Promise<void> {
	const key = batch.queue.includes('emails') ? stateKeys.queueEmails : stateKeys.queueJobs
	const lastMessage = batch.messages.at(-1)?.body ?? null

	await writeJson(env.SESSIONS, key, {
		appName: env.APP_NAME,
		queue: batch.queue,
		messageCount: batch.messages.length,
		lastMessage,
		processedAt: new Date().toISOString()
	})

	for (const message of batch.messages) {
		message.ack?.()
	}
}
