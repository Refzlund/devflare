import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { env } from '../../../src'
import { BridgeClient } from '../../../src/bridge'
import { createTestContext } from '../../../src/test'

const tempDirs: string[] = []

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

describe('createTestContext startup retries', () => {
	test('retries bridge-backed startup when the first bridge connection fails', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-test-context-retry-'))
		tempDirs.push(projectDir)

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({
			name: 'test-context-retry-project',
			private: true,
			type: 'module'
		}, null, 2))
		await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'test-context-retry-project',
	compatibilityDate: '2026-03-17',
	bindings: {
		kv: {
			CACHE: 'cache-kv-id'
		}
	}
}
`.trim())
		await writeFile(join(projectDir, 'src', 'fetch.ts'), `
export default {
	async fetch() {
		return new Response('ok')
	}
}
`.trim())

		const originalConnect = BridgeClient.prototype.connect
		let connectAttempts = 0

		BridgeClient.prototype.connect = async function (this: BridgeClient): Promise<void> {
			connectAttempts += 1

			if (connectAttempts === 1) {
				throw new Error('WebSocket connection failed')
			}

			return await originalConnect.call(this)
		}

		try {
			await createTestContext(join(projectDir, 'devflare.config.ts'))

			const envAny = env as any
			await envAny.CACHE.put('retry-check', 'ok')
			expect(await envAny.CACHE.get('retry-check')).toBe('ok')
			expect(connectAttempts).toBe(2)
		} finally {
			BridgeClient.prototype.connect = originalConnect
			await (env as any).dispose()
		}
	})
})