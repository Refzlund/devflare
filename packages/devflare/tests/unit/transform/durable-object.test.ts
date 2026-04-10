// =============================================================================
// Durable Object Transform Tests
// =============================================================================

import { describe, expect, test } from 'bun:test'
import {
	transformDurableObject,
	findDurableObjectClasses,
	findDurableObjectClassesDetailed,
	generateWrapper
} from '../../../src/transform/durable-object'

describe('findDurableObjectClasses', () => {
	test('finds class extending DurableObject', () => {
		const code = `
export class MyCounter extends DurableObject {
	async fetch(request: Request) {
		return new Response('Hello')
	}
}
`
		const classes = findDurableObjectClasses(code)
		expect(classes).toEqual(['MyCounter'])
	})

	test('finds multiple DO classes', () => {
		const code = `
export class Counter extends DurableObject {
	count = 0
}

export class Session extends DurableObject {
	data = {}
}
`
		const classes = findDurableObjectClasses(code)
		expect(classes).toContain('Counter')
		expect(classes).toContain('Session')
		expect(classes).toHaveLength(2)
	})

	test('ignores non-DO classes', () => {
		const code = `
export class Helper {
	static format() {}
}

export class MyDO extends DurableObject {
	async fetch() {}
}
`
		const classes = findDurableObjectClasses(code)
		expect(classes).toEqual(['MyDO'])
	})

	test('handles implements clause', () => {
		const code = `
export class MyDO extends DurableObject implements MyInterface {
	async fetch() {}
}
`
		const classes = findDurableObjectClasses(code)
		expect(classes).toEqual(['MyDO'])
	})

	test('returns empty array for no DOs', () => {
		const code = `
export class RegularClass {
	method() {}
}
`
		const classes = findDurableObjectClasses(code)
		expect(classes).toEqual([])
	})

	test('finds class with @durableObject decorator', () => {
		const code = `
@durableObject()
export class Counter {
	private count = 0
	
	async increment() {
		return ++this.count
	}
}
`
		const classes = findDurableObjectClasses(code)
		expect(classes).toEqual(['Counter'])
	})

	test('finds class with @durableObject decorator and options', () => {
		const code = `
@durableObject({ alarms: true, rpc: ['increment', 'getValue'] })
export class Timer {
	private value = 0
}
`
		const classes = findDurableObjectClasses(code)
		expect(classes).toEqual(['Timer'])
	})

	test('finds both decorated and extended classes', () => {
		const code = `
@durableObject()
export class DecoratedCounter {
	count = 0
}

export class ExtendedCounter extends DurableObject {
	count = 0
}
`
		const classes = findDurableObjectClasses(code)
		expect(classes).toContain('DecoratedCounter')
		expect(classes).toContain('ExtendedCounter')
		expect(classes).toHaveLength(2)
	})

	test('deduplicates classes with both decorator and extends', () => {
		const code = `
@durableObject()
export class Counter extends DurableObject {
	count = 0
}
`
		const classes = findDurableObjectClasses(code)
		expect(classes).toEqual(['Counter'])
	})
})

describe('findDurableObjectClassesDetailed', () => {
	test('returns detailed info for extended class', () => {
		const code = `
export class Counter extends DurableObject {
	count = 0
}
`
		const classes = findDurableObjectClassesDetailed(code)
		expect(classes).toHaveLength(1)
		expect(classes[0].name).toBe('Counter')
		expect(classes[0].extendsBase).toBe(true)
		expect(classes[0].hasDecorator).toBe(false)
	})

	test('returns detailed info for decorated class', () => {
		const code = `
@durableObject()
export class Counter {
	count = 0
}
`
		const classes = findDurableObjectClassesDetailed(code)
		expect(classes).toHaveLength(1)
		expect(classes[0].name).toBe('Counter')
		expect(classes[0].extendsBase).toBe(false)
		expect(classes[0].hasDecorator).toBe(true)
	})

	test('parses decorator options', () => {
		const code = `
@durableObject({ alarms: true, websockets: false })
export class Timer {
	value = 0
}
`
		const classes = findDurableObjectClassesDetailed(code)
		expect(classes).toHaveLength(1)
		expect(classes[0].decoratorOptions?.alarms).toBe(true)
		expect(classes[0].decoratorOptions?.websockets).toBe(false)
	})

	test('parses rpc array option', () => {
		const code = `
@durableObject({ rpc: ['increment', 'getValue'] })
export class Counter {
	value = 0
}
`
		const classes = findDurableObjectClassesDetailed(code)
		expect(classes).toHaveLength(1)
		expect(classes[0].decoratorOptions?.rpc).toEqual(['increment', 'getValue'])
	})
})

describe('generateWrapper', () => {
	test('generates wrapper with context injection', () => {
		const wrapper = generateWrapper('MyCounter')

		expect(wrapper).toContain('class MyCounterWrapper')
		expect(wrapper).toContain('extends __OriginalMyCounter')
		expect(wrapper).toContain('createDurableObjectFetchEvent')
		expect(wrapper).toContain('runWithEventContext')
		expect(wrapper).toContain('async fetch(request')
	})

	test('wrapper preserves original class export', () => {
		const wrapper = generateWrapper('Session')

		// Should export the wrapper as the original name
		expect(wrapper).toContain('export { SessionWrapper as Session }')
	})

	test('generates alarm handler when alarms option is true', () => {
		const wrapper = generateWrapper('Timer', { alarms: true })

		expect(wrapper).toContain('async alarm(')
		expect(wrapper).toContain('createDurableObjectAlarmEvent')
		expect(wrapper).toContain('runWithEventContext')
	})

	test('generates webSocketMessage handler when websockets option is true', () => {
		const wrapper = generateWrapper('Chat', { websockets: true })

		expect(wrapper).toContain('async webSocketMessage(')
		expect(wrapper).toContain('async webSocketClose(')
		expect(wrapper).toContain('async webSocketError(')
	})

	test('generates both alarm and websocket handlers', () => {
		const wrapper = generateWrapper('RealtimeTimer', { alarms: true, websockets: true })

		expect(wrapper).toContain('async alarm(')
		expect(wrapper).toContain('async webSocketMessage(')
	})

	test('omits handlers when options are false', () => {
		const wrapper = generateWrapper('Basic', { alarms: false, websockets: false })

		expect(wrapper).not.toContain('async alarm(')
		expect(wrapper).not.toContain('async webSocketMessage(')
	})
})

describe('transformDurableObject', () => {
	test('transforms simple DO class', async () => {
		const code = `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
	private count = 0

	async fetch(request: Request): Promise<Response> {
		this.count++
		return new Response(String(this.count))
	}
}
`
		const result = await transformDurableObject(code, 'counter.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain('CounterWrapper')
		expect(result?.code).toContain('createDurableObjectFetchEvent')
		expect(result?.code).toContain('runWithEventContext')
	})

	test('returns null for non-DO code', async () => {
		const code = `
export function helper() {
	return 'hello'
}
`
		const result = await transformDurableObject(code, 'helper.ts')
		expect(result).toBeNull()
	})

	test('includes source map', async () => {
		const code = `
export class MyDO extends DurableObject {
	async fetch(request: Request) {
		return new Response('OK')
	}
}
`
		const result = await transformDurableObject(code, 'do.ts')

		expect(result?.map).toBeDefined()
	})

	test('preserves non-DO exports', async () => {
		const code = `
export const VERSION = '1.0.0'

export class MyDO extends DurableObject {
	async fetch() {
		return new Response(VERSION)
	}
}

export function helper() {}
`
		const result = await transformDurableObject(code, 'mixed.ts')

		expect(result?.code).toContain('VERSION')
		expect(result?.code).toContain('helper')
	})

	test('transforms decorated class without extends', async () => {
		const code = `
import { durableObject } from 'devflare'

@durableObject()
export class Counter {
	private count = 0

	async fetch(request: Request): Promise<Response> {
		this.count++
		return new Response(String(this.count))
	}
}
`
		const result = await transformDurableObject(code, 'counter.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain('CounterWrapper')
		expect(result?.code).toContain('createDurableObjectFetchEvent')
		expect(result?.code).toContain('runWithEventContext')
	})

	test('transforms decorated class with alarms option', async () => {
		const code = `
import { durableObject } from 'devflare'

@durableObject({ alarms: true })
export class Timer {
	private deadline = 0

	async fetch(request: Request): Promise<Response> {
		return new Response('OK')
	}

	async alarm() {
		console.log('Alarm triggered')
	}
}
`
		const result = await transformDurableObject(code, 'timer.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain('TimerWrapper')
		expect(result?.code).toContain('async alarm(')
	})

	test('transforms decorated class with websockets option', async () => {
		const code = `
import { durableObject } from 'devflare'

@durableObject({ websockets: true })
export class ChatRoom {
	async fetch(request: Request): Promise<Response> {
		return new Response('OK')
	}

	async webSocketMessage(ws: WebSocket, message: string) {
		// handle message
	}
}
`
		const result = await transformDurableObject(code, 'chat.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain('ChatRoomWrapper')
		expect(result?.code).toContain('async webSocketMessage(')
	})

	test('transforms multiple decorated classes', async () => {
		const code = `
import { durableObject } from 'devflare'

@durableObject()
export class Counter {
	count = 0
	async fetch() { return new Response('counter') }
}

@durableObject({ alarms: true })
export class Timer {
	deadline = 0
	async fetch() { return new Response('timer') }
}
`
		const result = await transformDurableObject(code, 'multi.ts')

		expect(result).not.toBeNull()
		expect(result?.code).toContain('CounterWrapper')
		expect(result?.code).toContain('TimerWrapper')
	})
})
