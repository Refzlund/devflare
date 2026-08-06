import { afterEach, describe, expect, test } from 'bun:test'
import {
	type OutboundEmailService,
	startOutboundEmailService
} from '../../../src/email/host-service'
import { getOutbox, resetOutbox } from '../../../src/email/outbox'
import type { ResolvedEmailRuntime } from '../../../src/email/runtime-config'
import {
	clearEmailDeliverySink,
	createHttpEmailDeliverySink,
	setEmailDeliverySink
} from '../../../src/utils/email-delivery'
import { createLocalSendEmailBinding } from '../../../src/utils/send-email'

let service: OutboundEmailService | null = null

afterEach(async () => {
	await service?.close()
	service = null
	clearEmailDeliverySink()
	resetOutbox()
})

const capture: ResolvedEmailRuntime = { mode: 'capture', relay: null, inbound: null }

describe('outbound email loopback service', () => {
	test('binds loopback only, so nothing off the machine can reach the relay', async () => {
		service = await startOutboundEmailService(() => capture)

		expect(service.url).toStartWith('http://127.0.0.1:')
		expect(service.url).toEndWith('/_devflare/email/outbound')
		expect(service.port).toBeGreaterThan(0)
	})

	test('carries a send from the worker side to the host outbox', async () => {
		// This is the bridge `devflare dev` relies on: the binding lives inside
		// workerd, which has no sockets, so the composed worker posts here.
		service = await startOutboundEmailService(() => capture)
		setEmailDeliverySink(createHttpEmailDeliverySink(service.url))

		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })
		const result = await binding.send({
			from: 'noreply@example.com',
			to: 'user@example.com',
			cc: 'ops@example.com',
			subject: 'Across the bridge',
			text: 'hello'
		} as Parameters<SendEmail['send']>[0])

		expect(getOutbox()).toHaveLength(1)
		expect(getOutbox()[0].binding).toBe('MAILER')
		expect(getOutbox()[0].message.cc).toEqual(['ops@example.com'])
		expect(getOutbox()[0].raw).toContain('Subject: Across the bridge')
		expect(result.messageId).toBe(getOutbox()[0].messageId)
	})

	test('a host-side failure reaches the worker rather than being logged and dropped', async () => {
		service = await startOutboundEmailService(() => {
			throw new Error('runtime not resolved')
		})
		setEmailDeliverySink(createHttpEmailDeliverySink(service.url))

		const binding = createLocalSendEmailBinding({}, { binding: 'MAILER' })

		await expect(
			binding.send({
				from: 'a@example.com',
				to: 'b@example.com',
				subject: 's',
				text: 't'
			} as Parameters<SendEmail['send']>[0])
		).rejects.toThrow('runtime not resolved')
	})

	test('answers 404 on any other path', async () => {
		service = await startOutboundEmailService(() => capture)
		const base = new URL(service.url).origin

		expect((await fetch(`${base}/nope`, { method: 'POST' })).status).toBe(404)
		expect((await fetch(service.url)).status).toBe(404)
	})

	test('close() releases the port', async () => {
		const started = await startOutboundEmailService(() => capture)
		const url = started.url
		await started.close()

		await expect(fetch(url, { method: 'POST', body: '{}' })).rejects.toThrow()
	})
})
