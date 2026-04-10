// =============================================================================
// Worker Entrypoint Transform Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	findExportedFunctions,
	shouldTransformWorker,
	transformWorkerEntrypoint,
	generateRpcInterface
} from '../../../src/transform/worker-entrypoint'

describe('findExportedFunctions', () => {
	test('finds single exported function', () => {
		const code = `
export function add(a: number, b: number): number {
	return a + b
}
`
		const functions = findExportedFunctions(code)
		expect(functions).toHaveLength(1)
		expect(functions[0].name).toBe('add')
		expect(functions[0].isAsync).toBe(false)
		expect(functions[0].params).toBe('a: number, b: number')
		expect(functions[0].returnType).toBe('number')
	})

	test('finds async exported function', () => {
		const code = `
export async function fetchData(url: string): Promise<Response> {
	return fetch(url)
}
`
		const functions = findExportedFunctions(code)
		expect(functions).toHaveLength(1)
		expect(functions[0].name).toBe('fetchData')
		expect(functions[0].isAsync).toBe(true)
	})

	test('finds multiple exported functions', () => {
		const code = `
export function add(a: number, b: number): number {
	return a + b
}

export function multiply(a: number, b: number): number {
	return a * b
}

export async function divide(a: number, b: number): Promise<number> {
	return a / b
}
`
		const functions = findExportedFunctions(code)
		expect(functions).toHaveLength(3)
		expect(functions.map((f) => f.name)).toEqual(['add', 'multiply', 'divide'])
	})

	test('finds fetch handler', () => {
		const code = `
export function fetch(request: Request, env: Env, ctx: ExecutionContext): Response {
	return new Response('Hello')
}
`
		const functions = findExportedFunctions(code)
		expect(functions).toHaveLength(1)
		expect(functions[0].name).toBe('fetch')
	})

	test('returns empty array for no exports', () => {
		const code = `
function internal() {}
const value = 42
`
		const functions = findExportedFunctions(code)
		expect(functions).toEqual([])
	})

	test('ignores non-function exports', () => {
		const code = `
export const VERSION = '1.0.0'
export class MyClass {}
export function add(a: number, b: number) { return a + b }
`
		const functions = findExportedFunctions(code)
		expect(functions).toHaveLength(1)
		expect(functions[0].name).toBe('add')
	})
})

describe('shouldTransformWorker', () => {
	test('returns true for worker.ts with exported functions', () => {
		const code = `
export function add(a: number, b: number): number {
	return a + b
}
`
		expect(shouldTransformWorker(code, 'src/worker.ts')).toBe(true)
		expect(shouldTransformWorker(code, '/path/to/worker.ts')).toBe(true)
	})

	test('returns false for non-worker files', () => {
		const code = `
export function add(a: number, b: number): number {
	return a + b
}
`
		expect(shouldTransformWorker(code, 'src/utils.ts')).toBe(false)
		expect(shouldTransformWorker(code, 'src/fetch.ts')).toBe(false)
	})

	test('returns false for worker.ts without exported functions', () => {
		const code = `
export const VERSION = '1.0.0'
class InternalClass {}
`
		expect(shouldTransformWorker(code, 'src/worker.ts')).toBe(false)
	})
})

describe('transformWorkerEntrypoint', () => {
	test('transforms single RPC function', () => {
		const code = `
export function add(a: number, b: number): number {
	return a + b
}
`
		const result = transformWorkerEntrypoint(code, 'worker.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain("import { WorkerEntrypoint } from 'cloudflare:workers'")
		expect(result?.code).toContain('class Worker extends WorkerEntrypoint')
		expect(result?.code).toContain('add(a: number, b: number)')
		expect(result?.rpcMethods).toEqual(['add'])
		expect(result?.className).toBe('Worker')
	})

	test('transforms multiple RPC functions', () => {
		const code = `
export function add(a: number, b: number): number {
	return a + b
}

export function multiply(a: number, b: number): number {
	return a * b
}
`
		const result = transformWorkerEntrypoint(code, 'worker.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain('add(a: number, b: number)')
		expect(result?.code).toContain('multiply(a: number, b: number)')
		expect(result?.rpcMethods).toEqual(['add', 'multiply'])
	})

	test('transforms fetch handler with context injection', () => {
		const code = `
export function fetch(request: Request, env: Env, ctx: ExecutionContext): Response {
	return new Response('Hello')
}
`
		const result = transformWorkerEntrypoint(code, 'worker.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain("import { createFetchEvent, invokeFetchHandler, runWithEventContext } from 'devflare/runtime'")
		expect(result?.code).toContain('async fetch(request: Request): Promise<Response>')
		expect(result?.code).toContain('createFetchEvent(request, this.env, this.ctx)')
		expect(result?.code).toContain('runWithEventContext')
		expect(result?.code).toContain('invokeFetchHandler(__originalFetch, __devflareEvent)')
		expect(result?.code).toContain('__originalFetch')
	})

	test('transforms both fetch and RPC methods', () => {
		const code = `
export function fetch(request: Request): Response {
	return new Response('Gateway')
}

export function calculate(x: number): number {
	return x * 2
}
`
		const result = transformWorkerEntrypoint(code, 'worker.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain('async fetch(request: Request)')
		expect(result?.code).toContain('calculate(x: number)')
		expect(result?.rpcMethods).toEqual(['calculate'])
	})

	test('uses custom class name', () => {
		const code = `
export function add(a: number, b: number): number {
	return a + b
}
`
		const result = transformWorkerEntrypoint(code, 'worker.ts', { className: 'MathService' })

		expect(result).not.toBeNull()
		expect(result?.code).toContain('class MathService extends WorkerEntrypoint')
		expect(result?.className).toBe('MathService')
	})

	test('can disable context injection', () => {
		const code = `
export function fetch(request: Request): Response {
	return new Response('Hello')
}
`
		const result = transformWorkerEntrypoint(code, 'worker.ts', { injectContext: false })

		expect(result).not.toBeNull()
		expect(result?.code).not.toContain('runWithEventContext')
		expect(result?.code).toContain('createFetchEvent(request, this.env, this.ctx)')
		expect(result?.code).toContain('invokeFetchHandler(__originalFetch, __devflareEvent)')
	})

	test('supports event-first fetch handlers', () => {
		const code = `
import type { FetchEvent } from 'devflare/runtime'

export function fetch({ request }: FetchEvent): Response {
	return new Response(request.url)
}
`
		const result = transformWorkerEntrypoint(code, 'worker.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain('const __devflareEvent = createFetchEvent(request, this.env, this.ctx)')
		expect(result?.code).toContain('invokeFetchHandler(__originalFetch, __devflareEvent)')
	})

	test('returns null for empty code', () => {
		const result = transformWorkerEntrypoint('', 'worker.ts')
		expect(result).toBeNull()
	})

	test('includes source map', () => {
		const code = `
export function add(a: number, b: number): number {
	return a + b
}
`
		const result = transformWorkerEntrypoint(code, 'worker.ts')

		expect(result?.map).toBeDefined()
		expect(result?.map.sources).toContain('worker.ts')
	})

	test('preserves non-exported code', () => {
		const code = `
const MULTIPLIER = 2

function internalHelper(x: number) {
	return x * MULTIPLIER
}

export function double(n: number): number {
	return internalHelper(n)
}
`
		const result = transformWorkerEntrypoint(code, 'worker.ts')

		expect(result?.code).toContain('const MULTIPLIER = 2')
		expect(result?.code).toContain('function internalHelper')
	})
})

describe('generateRpcInterface', () => {
	test('generates interface for RPC methods', () => {
		const functions = findExportedFunctions(`
export function add(a: number, b: number): number { return a + b }
export function multiply(a: number, b: number): number { return a * b }
`)
		const iface = generateRpcInterface(functions, 'MathService')

		expect(iface).toContain('export interface MathService')
		expect(iface).toContain('add(a: number, b: number): Promise<number>')
		expect(iface).toContain('multiply(a: number, b: number): Promise<number>')
	})

	test('excludes fetch from interface', () => {
		const functions = findExportedFunctions(`
export function fetch(request: Request): Response { return new Response() }
export function add(a: number, b: number): number { return a + b }
`)
		const iface = generateRpcInterface(functions, 'MyWorker')

		expect(iface).not.toContain('fetch')
		expect(iface).toContain('add')
	})

	test('returns empty string for only fetch', () => {
		const functions = findExportedFunctions(`
export function fetch(request: Request): Response { return new Response() }
`)
		const iface = generateRpcInterface(functions, 'MyWorker')

		expect(iface).toBe('')
	})

	test('wraps non-Promise returns in Promise', () => {
		const functions = findExportedFunctions(`
export function getValue(): number { return 42 }
export async function fetchValue(): Promise<string> { return 'hello' }
`)
		const iface = generateRpcInterface(functions, 'DataService')

		expect(iface).toContain('getValue(): Promise<number>')
		expect(iface).toContain('fetchValue(): Promise<string>')
	})
})
