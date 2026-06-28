/**
 * Options for the @durableObject decorator
 */
export interface DurableObjectOptions {
	/**
	 * Enable alarm handling (wraps alarm() method with context)
	 * @default true
	 */
	alarms?: boolean

	/**
	 * RPC method names to expose
	 * When specified, only these methods will be exposed via RPC
	 */
	rpc?: string[]

	/**
	 * WebSocket handling options
	 * @default true
	 */
	websockets?: boolean

	/**
	 * Custom class name for wrangler binding
	 * If not provided, uses the decorated class name
	 */
	className?: string
}

/**
 * Decorator factory for Durable Object classes
 *
 * @example
 * ```ts
 * // Basic usage
 * @durableObject()
 * export class Counter {
 *   private count = 0
 *
 *   async increment() {
 *     return ++this.count
 *   }
 * }
 *
 * // With options
 * @durableObject({ alarms: true, rpc: ['increment', 'getValue'] })
 * export class Timer {
 *   // ...
 * }
 * ```
 *
 * Note: This decorator is primarily used as a marker for the Vite transform.
 * At runtime, it returns the class unchanged. The actual context injection
 * happens during the build transform.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClass = abstract new (...args: any[]) => any

export function durableObject(options: DurableObjectOptions = {}) {
	return <T extends AnyClass>(target: T): T => {
		// Store options on the class for potential runtime access
		Object.defineProperty(target, '__durableObjectOptions', {
			value: options,
			enumerable: false,
			writable: false
		})

		// Return class unchanged — transform handles wrapping
		return target
	}
}

/**
 * Get the stored durable object options from a decorated class
 */
export function getDurableObjectOptions(target: unknown): DurableObjectOptions | undefined {
	if (typeof target === 'function') {
		return (target as unknown as { __durableObjectOptions?: DurableObjectOptions })
			.__durableObjectOptions
	}
	return undefined
}
