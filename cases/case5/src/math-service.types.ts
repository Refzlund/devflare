// =============================================================================
// Case 5: Multi-Worker - MathService Interface (RPC Contract)
// =============================================================================
// Defines the interface for the MathService worker's RPC methods.
// This is the "contract" that both the service and client agree on.
//
// In a real monorepo, this would be in a shared package:
// packages/shared/src/math-service.types.ts
// =============================================================================

/**
 * Statistics result from calculateStats
 */
export interface StatsResult {
	count: number
	sum: number
	mean: number
	min: number
	max: number
}

/**
 * Interface for MathService RPC methods
 * 
 * This mirrors the public methods of the MathService WorkerEntrypoint class.
 * Service bindings provide this interface at runtime via RPC.
 */
export interface MathServiceInterface {
	/**
	 * Add two numbers
	 */
	add(a: number, b: number): Promise<number>

	/**
	 * Multiply two numbers
	 */
	multiply(a: number, b: number): Promise<number>

	/**
	 * Calculate the nth Fibonacci number
	 */
	fibonacci(n: number): Promise<number>

	/**
	 * Calculate statistics for an array of numbers
	 */
	calculateStats(numbers: number[]): Promise<StatsResult>
}

/**
 * Interface for AdminEntrypoint RPC methods
 * 
 * Admin-only operations for privileged access.
 * Referenced via mathWorker.worker('AdminEntrypoint') in config.
 */
export interface AdminEntrypointInterface {
	/**
	 * Reset all statistics
	 */
	resetStats(): Promise<{ success: boolean; timestamp: number }>

	/**
	 * Get service health status
	 */
	getHealth(): Promise<{
		status: 'healthy' | 'degraded' | 'unhealthy'
		uptime: number
		version: string
	}>

	/**
	 * Run diagnostics
	 */
	runDiagnostics(): Promise<{
		memoryUsage: number
		cpuUsage: number
		requestCount: number
	}>
}
