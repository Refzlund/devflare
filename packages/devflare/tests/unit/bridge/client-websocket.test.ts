import { describe, expect, test } from 'bun:test'
import { resolveBridgeWebSocketConstructor } from '../../../src/bridge/client'

describe('resolveBridgeWebSocketConstructor', () => {
	test('falls back to ws when the runtime does not expose a global WebSocket', async () => {
		const constructor = await resolveBridgeWebSocketConstructor(undefined)
		expect(typeof constructor).toBe('function')
	})
})
