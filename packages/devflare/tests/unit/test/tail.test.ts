import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { configureTail, resetTailState, tail } from '../../../src/test/tail'

const tempDirs: string[] = []

afterEach(async () => {
	resetTailState()
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'devflare-tail-helper-'))
	tempDirs.push(dir)
	return dir
}

describe('tail test helper', () => {
	test('invokes default object tail handlers with Cloudflare native arguments', async () => {
		const dir = await createTempDir()
		await writeFile(
			join(dir, 'tail-object.mjs'),
			`
export default {
	async tail(events, env, ctx) {
		env.calls.push({
			eventCount: events.length,
			hasWaitUntil: typeof ctx.waitUntil === 'function'
		})
	}
}
		`.trim()
		)

		const env = { calls: [] as Array<{ eventCount: number; hasWaitUntil: boolean }> }
		configureTail({
			handlerPath: 'tail-object.mjs',
			configDir: dir,
			getEnv: () => env
		})

		const result = await tail.trigger([{ scriptName: 'producer-worker' }])

		expect(result).toEqual({ success: true, itemCount: 1 })
		expect(env.calls).toEqual([{ eventCount: 1, hasWaitUntil: true }])
	})
})
