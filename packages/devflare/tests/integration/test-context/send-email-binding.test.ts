import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { env } from '../../../src'
import { createTestContext } from '../../../src/test'

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
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'test-context-send-email-project',
			private: true,
			type: 'module'
		}, null, 2))
		await writeFile(join(projectDir, 'devflare.config.ts'), `
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
`.trim())

		const runtimeEnv = env as unknown as {
			EMAIL: {
				send(message: {
					from: string
					to: string
					subject: string
					text: string
				}): Promise<unknown>
			}
			dispose(): Promise<void>
		}

		await createTestContext(join(projectDir, 'devflare.config.ts'))

		try {
			await expect(runtimeEnv.EMAIL.send({
				from: 'sender@example.com',
				to: 'recipient@example.com',
				subject: 'Bridge send email',
				text: 'Hello from the send email binding'
			})).resolves.toBeUndefined()
		} finally {
			await runtimeEnv.dispose()
		}
	})
})
