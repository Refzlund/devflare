import { WorkerEntrypoint } from 'cloudflare:workers'

export class AdminEntrypoint extends WorkerEntrypoint {
	async getHealth(): Promise<{
		status: 'healthy'
		service: string
		checkedAt: string
	}> {
		return {
			status: 'healthy',
			service: 'devflare-testing-auth-service',
			checkedAt: new Date().toISOString()
		}
	}

	async runDiagnostics(): Promise<{
		service: string
		queueBacklog: number
		sessionCount: number
	}> {
		return {
			service: 'devflare-testing-auth-service',
			queueBacklog: 0,
			sessionCount: 0
		}
	}
}
