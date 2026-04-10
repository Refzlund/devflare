// =============================================================================
// Case 6: Queues & Crons - Scheduled Handler
// =============================================================================
// Scheduled handler - runs on cron triggers
// =============================================================================

import type { ScheduledController } from '@cloudflare/workers-types'
import type { Env } from './lib/types'
import { cleanupOldResults, generateWeeklyReport } from './lib/tasks'

/**
 * Scheduled handler
 * Runs on cron triggers defined in devflare.config.ts
 */
export default async function scheduled(
	controller: ScheduledController,
	env: Env,
	ctx: ExecutionContext
): Promise<void> {
	const cron = controller.cron

	// Every 6 hours - cleanup old results
	if (cron === '0 */6 * * *') {
		ctx.waitUntil(cleanupOldResults(env))
	}

	// Every Monday at midnight - weekly report
	if (cron === '0 0 * * 1') {
		ctx.waitUntil(generateWeeklyReport(env))
	}
}
