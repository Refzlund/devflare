import { stateKeys, writeJson } from './state'

interface ScheduledControllerLike {
	cron: string
	scheduledTime?: number
}

interface ScheduledEnv {
	SESSIONS: KVNamespace
	APP_NAME: string
}

export async function scheduled(controller: ScheduledControllerLike, env: ScheduledEnv): Promise<void> {
	await writeJson(env.SESSIONS, stateKeys.scheduled, {
		appName: env.APP_NAME,
		cron: controller.cron,
		scheduledTime: controller.scheduledTime ?? Date.now(),
		ranAt: new Date().toISOString()
	})
}
