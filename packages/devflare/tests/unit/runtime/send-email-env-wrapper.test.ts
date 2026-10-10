import { afterEach, describe, expect, test } from 'bun:test'
import {
	clearLocalSendEmailBindings,
	setLocalSendEmailBindings,
	wrapEnvSendEmailBindings
} from '../../../src/utils/send-email'

describe('wrapEnvSendEmailBindings', () => {
	afterEach(() => {
		clearLocalSendEmailBindings()
	})

	test('does not probe non-email RPC-style bindings unsafely', () => {
		const serviceBinding = {
			get send(): never {
				throw new Error('RPC receiver does not implement the method "send".')
			}
		}

		const env = { SERVICE: serviceBinding }

		expect(wrapEnvSendEmailBindings(env)).toBe(env)
	})

	test('prefers configured local sendEmail bindings over runtime sendEmail bindings', async () => {
		let runtimeSendCalls = 0
		const runtimeSendEmail = {
			async send(): Promise<EmailSendResult> {
				runtimeSendCalls += 1
				throw new Error('runtime sendEmail should not be called')
			}
		} as SendEmail

		setLocalSendEmailBindings({
			EMAIL: {
				destinationAddress: 'recipient@example.com',
				allowedSenderAddresses: ['sender@example.com']
			}
		})

		const env = wrapEnvSendEmailBindings<{ EMAIL: SendEmail }>({
			EMAIL: runtimeSendEmail
		})

		await env.EMAIL.send({
			from: 'sender@example.com',
			to: 'recipient@example.com',
			subject: 'Hello',
			text: 'Sent locally'
		})

		expect(runtimeSendCalls).toBe(0)
		expect(Object.getOwnPropertyDescriptor(env, 'EMAIL')?.value).not.toBe(runtimeSendEmail)
	})
})
