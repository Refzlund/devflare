import { describe, expect, test } from 'bun:test'
import { resolveBridgeWebSocketConstructor } from '../../../src/bridge/client'

describe('resolveBridgeWebSocketConstructor', () => {
	test('falls back to ws when the runtime does not expose a global WebSocket', async () => {
		const wsConstructor = await resolveBridgeWebSocketConstructor(undefined)
		expect(typeof wsConstructor).toBe('function')
	})
})
