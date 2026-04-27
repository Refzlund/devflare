import { describe, expect, test } from 'bun:test'
import { wrapEnvSendEmailBindings } from '../../../src/utils/send-email'

describe('wrapEnvSendEmailBindings', () => {
	test('does not probe non-email RPC-style bindings unsafely', () => {
		const serviceBinding = {
			get send(): never {
				throw new Error('RPC receiver does not implement the method "send".')
			}
		}

		const env = { SERVICE: serviceBinding }

		expect(wrapEnvSendEmailBindings(env)).toBe(env)
	})
})
