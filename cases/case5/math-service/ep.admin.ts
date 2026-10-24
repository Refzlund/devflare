// =============================================================================
// Case 5: Admin Entrypoint (Named WorkerEntrypoint Pattern)
// =============================================================================
// This file demonstrates the named entrypoint pattern using `ep.*.ts`:
// - Export a class extending WorkerEntrypoint
// - The class name becomes the entrypoint identifier
// - Referenced via ref().worker('AdminEntrypoint') in other workers
//
// Naming Convention:
//   ep.*.ts    — Worker Entrypoints (classes extending WorkerEntrypoint)
//   do.*.ts    — Durable Objects (classes extending DurableObject)
//   wf.*.ts    — Workflows (classes extending Workflow)
//   worker.ts  — Default worker export (transformed to WorkerEntrypoint)
// =============================================================================

import { WorkerEntrypoint } from 'cloudflare:workers'

/**
 * Admin-only RPC methods for privileged operations.
 * Demonstrates a named entrypoint alongside the default worker.ts.
 */
export class AdminEntrypoint extends WorkerEntrypoint {
	/**
	 * Reset all statistics (admin operation)
	 */
	async resetStats(): Promise<{ success: boolean; timestamp: number }> {
		// In a real scenario, this would clear cached stats, reset counters, etc.
		return {
			success: true,
			timestamp: Date.now()
		}
	}

	/**
	 * Get service health status (admin operation)
	 */
	async getHealth(): Promise<{
		status: 'healthy' | 'degraded' | 'unhealthy'
		uptime: number
		version: string
	}> {
		return {
			status: 'healthy',
			uptime: Date.now() / 1000, // Simulated uptime in seconds
			version: '1.0.0'
		}
	}

	/**
	 * Run diagnostics (admin operation)
	 */
	async runDiagnostics(): Promise<{
		memoryUsage: number
		cpuUsage: number
		requestCount: number
	}> {
		// Simulated diagnostics
		return {
			memoryUsage: Math.random() * 100,
			cpuUsage: Math.random() * 50,
			requestCount: Math.floor(Math.random() * 1000)
		}
	}
}
