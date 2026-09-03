// =============================================================================
// Case 6: Queues & Crons - Scheduled Handler
// =============================================================================
// Scheduled handler - runs on cron triggers
// =============================================================================

import { env } from 'devflare'
import type { ScheduledEvent } from 'devflare/runtime'
import { cleanupOldResults, generateWeeklyReport } from './lib/tasks'

/**
 * Scheduled handler
 * Runs on cron triggers defined in devflare.config.ts
 */
export default async function scheduled(
	event: ScheduledEvent
): Promise<void> {
	const cron = event.cron

	// Every 6 hours - cleanup old results
	if (cron === '0 */6 * * *') {
		event.ctx.waitUntil(cleanupOldResults())
	}

	// Every Monday at midnight - weekly report
	if (cron === '0 0 * * 1') {
		event.ctx.waitUntil(generateWeeklyReport())
	}
}
