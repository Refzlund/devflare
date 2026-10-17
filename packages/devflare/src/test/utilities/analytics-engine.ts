// =============================================================================
// Mock Analytics Engine Dataset
// =============================================================================
// Write-only recording stub for the Cloudflare Analytics Engine binding,
// mirroring `createMockQueue`. `writeDataPoint()` records each data point into an
// inspectable array so tests can assert what application code emitted.
//
// Honesty: Analytics Engine has **no read API inside a Worker** (querying is the
// hosted SQL API / dashboard), so this mock deliberately offers no query method.
// It records writes — it does not pretend to query.
// =============================================================================

export type MockAnalyticsEngineDataset = AnalyticsEngineDataset & {
	/** Every data point passed to `writeDataPoint()`, in call order. */
	readonly writtenDataPoints: AnalyticsEngineDataPoint[]
	/** Alias for {@link writtenDataPoints} (parity with other record-only mocks). */
	readonly points: AnalyticsEngineDataPoint[]
	/** Clear the recorded data points. */
	clear(): void
}

/**
 * Creates a write-only Analytics Engine dataset binding for pure unit tests.
 *
 * @example
 * ```ts
 * const dataset = createMockAnalyticsEngine()
 * dataset.writeDataPoint({ indexes: ['user-1'], doubles: [1], blobs: ['signup'] })
 * expect(dataset.writtenDataPoints).toEqual([
 *   { indexes: ['user-1'], doubles: [1], blobs: ['signup'] }
 * ])
 * ```
 */
export function createMockAnalyticsEngine(): MockAnalyticsEngineDataset {
	const dataPoints: AnalyticsEngineDataPoint[] = []

	return {
		writeDataPoint(event?: AnalyticsEngineDataPoint): void {
			// Record a deep snapshot so later caller mutations (including of the
			// nested indexes/doubles/blobs arrays) don't rewrite recorded history.
			dataPoints.push(event ? structuredClone(event) : {})
		},
		get writtenDataPoints(): AnalyticsEngineDataPoint[] {
			return dataPoints
		},
		get points(): AnalyticsEngineDataPoint[] {
			return dataPoints
		},
		clear(): void {
			dataPoints.length = 0
		}
	} as MockAnalyticsEngineDataset
}
