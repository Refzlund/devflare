// =============================================================================
// Case 5: Math Service Worker (Worker Entrypoint Pattern)
// =============================================================================
// This file demonstrates the new worker.ts pattern:
// - Export multiple functions that become RPC methods
// - devflare transforms this into a WorkerEntrypoint class at build time
//
// The resulting class exposes each exported function as an RPC method
// that can be called via service bindings from other workers.
// =============================================================================

import type { StatsResult } from '../src/math-service.types'

/**
 * RPC method: Add two numbers
 */
export function add(a: number, b: number): number {
	return a + b
}

/**
 * RPC method: Multiply two numbers
 */
export function multiply(a: number, b: number): number {
	return a * b
}

/**
 * RPC method: Calculate the nth Fibonacci number
 */
export function fibonacci(n: number): number {
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
export function calculateStats(numbers: number[]): StatsResult {
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
