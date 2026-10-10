import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { env } from '../../../src'
import { cf, createTestContext } from '../../../src/test'

const tempDirs: string[] = []

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

describe('createTestContext sendEmail bindings', () => {
	test('supports env.EMAIL.send() through the bridge-backed test context', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-test-context-send-email-'))
		tempDirs.push(projectDir)

		await mkdir(projectDir, { recursive: true })
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'test-context-send-email-project',
					private: true,
					type: 'module'
				},
				null,
				2
			)
		)
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
export default {
	name: 'test-context-send-email-project',
	compatibilityDate: '2026-03-17',
	bindings: {
		sendEmail: {
			EMAIL: {
				destinationAddress: 'recipient@example.com',
				allowedSenderAddresses: ['sender@example.com']
			}
		}
	}
}
`.trim()
		)

		const runtimeEnv = env as unknown as {
			EMAIL: {
				send(message: {
					from: string
					to: string
					subject: string
					text: string
					cc?: string[]
					replyTo?: string
				}): Promise<{ messageId: string }>
			}
			dispose(): Promise<void>
		}

		await createTestContext(join(projectDir, 'devflare.config.ts'))

		try {
			const result = await runtimeEnv.EMAIL.send({
				from: 'sender@example.com',
				to: 'recipient@example.com',
				cc: ['recipient@example.com'],
				replyTo: 'sender@example.com',
				subject: 'Bridge send email',
				text: 'Hello from the send email binding'
			})

			// Cloudflare's binding answers with the message id; so does the local one.
			expect(result.messageId).toContain('@')

			// Nothing was configured to leave the machine, so the send is captured.
			expect(cf.email.outbox).toHaveLength(1)
			const [sent] = cf.email.outbox
			expect(sent.binding).toBe('EMAIL')
			expect(sent.mode).toBe('capture')
			expect(sent.relayed).toBe(false)
			expect(sent.message.to).toEqual(['recipient@example.com'])
			expect(sent.message.cc).toEqual(['recipient@example.com'])
			expect(sent.message.replyTo).toBe('sender@example.com')
			expect(sent.raw).toContain('Subject: Bridge send email')
			expect(sent.raw).toContain(`Message-ID: ${result.messageId}`)
			expect(sent.size).toBe(new TextEncoder().encode(sent.raw).length)
		} finally {
			await runtimeEnv.dispose()
		}
	})

	test('the allow-list still rejects a disallowed recipient, and records nothing', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-test-context-send-email-deny-'))
		tempDirs.push(projectDir)

		await mkdir(projectDir, { recursive: true })
		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify({ name: 'send-email-deny', private: true, type: 'module' }, null, 2)
		)
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
export default {
	name: 'send-email-deny',
	compatibilityDate: '2026-03-17',
	bindings: {
		sendEmail: {
			EMAIL: { destinationAddress: 'recipient@example.com' }
		}
	}
}
`.trim()
		)

		const runtimeEnv = env as unknown as {
			EMAIL: { send(message: unknown): Promise<unknown> }
			dispose(): Promise<void>
		}

		await createTestContext(join(projectDir, 'devflare.config.ts'))

		try {
			await expect(
				runtimeEnv.EMAIL.send({
					from: 'sender@example.com',
					to: 'stranger@example.com',
					subject: 'Denied',
					text: 'nope'
				})
			).rejects.toThrow('not allowed')

			expect(cf.email.outbox).toHaveLength(0)
		} finally {
			await runtimeEnv.dispose()
		}
	})
})
