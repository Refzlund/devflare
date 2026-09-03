// =============================================================================
// Case 5: Multi-Worker - MathService WorkerEntrypoint
// =============================================================================
// This is the math service worker that exposes RPC methods via WorkerEntrypoint.
// It runs as a separate worker and is called by the gateway via service binding.
//
// In production, this would be deployed as a separate worker with its own config.
// For testing, we bundle it into the same Miniflare instance using the workers array.
// =============================================================================

import { WorkerEntrypoint } from 'cloudflare:workers'
import type { StatsResult } from './math-service.types'

/**
 * MathService WorkerEntrypoint
 * 
 * Extends WorkerEntrypoint to expose RPC methods that other workers can call.
 * Each public method becomes an RPC endpoint accessible via service binding.
 */
export class MathService extends WorkerEntrypoint {
	/**
	 * RPC method: Add two numbers
	 */
	add(a: number, b: number): number {
		return a + b
	}

	/**
	 * RPC method: Multiply two numbers
	 */
	multiply(a: number, b: number): number {
		return a * b
	}

	/**
	 * RPC method: Calculate the nth Fibonacci number
	 */
	fibonacci(n: number): number {
		if (n <= 1) return n
		let a = 0
		let b = 1
		for (let i = 2; i <= n; i++) {
			const temp = a + b
			a = b
			b = temp
		}
		return b
	}

	/**
	 * RPC method: Calculate statistics for an array of numbers
	 */
	calculateStats(numbers: number[]): StatsResult {
		if (numbers.length === 0) {
			return { count: 0, sum: 0, mean: 0, min: 0, max: 0 }
		}

		const sum = numbers.reduce((acc, n) => acc + n, 0)
		return {
			count: numbers.length,
			sum,
			mean: sum / numbers.length,
			min: Math.min(...numbers),
			max: Math.max(...numbers)
		}
	}
}
