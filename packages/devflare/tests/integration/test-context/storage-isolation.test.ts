// =============================================================================
// Each test context starts with empty storage
// =============================================================================
// Every binding a context hands out is backed by the Miniflare instance that
// context booted, and `dispose()` takes that instance — and its storage — with
// it. This is the contract that lets a suite put two contexts in one process
// without the first one's rows, objects, keys and Durable Object state showing
// up in the second.
//
// It is also the reason the runtime is NOT reused between contexts, tempting as
// that is at ~700ms a boot: `Miniflare.setOptions()` keeps every store alive
// across the reconfigure, including Durable Object state, which survives even
// when the KV/R2/D1 binding ids are all changed. Anything that reaches for
// reuse has to keep this test green.
// =============================================================================

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

interface StorageBindings {
	CACHE: { put(key: string, value: string): Promise<void>; get(key: string): Promise<unknown> }
	FILES: { put(key: string, value: string): Promise<unknown>; get(key: string): Promise<unknown> }
	DB: {
		exec(sql: string): Promise<unknown>
		prepare(sql: string): { run(): Promise<unknown>; first(column?: string): Promise<unknown> }
	}
	COUNTER: { getByName(name: string): { increment(): Promise<number> } }
	dispose(): Promise<void>
}

async function createStorageProject(): Promise<string> {
	const projectDir = await mkdtemp(join(tmpdir(), 'devflare-storage-isolation-'))
	tempDirs.push(projectDir)

	await mkdir(join(projectDir, 'src'), { recursive: true })
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify({ name: 'storage-isolation-project', private: true, type: 'module' }, null, 2)
	)
	await writeFile(
		join(projectDir, 'devflare.config.ts'),
		`
export default {
	name: 'storage-isolation-project',
	compatibilityDate: '2026-03-17',
	bindings: {
		kv: { CACHE: 'cache-kv-id' },
		r2: { FILES: 'files-bucket' },
		d1: { DB: 'db-id' },
		durableObjects: { COUNTER: { className: 'Counter' } }
	}
}
`.trim()
	)
	// Counts through ctx.storage rather than a field, so the assertion is about
	// DURABLE state — an in-memory field would only prove a fresh instance.
	await writeFile(
		join(projectDir, 'src', 'do.counter.ts'),
		`
export class Counter {
	storage: any

	constructor(state: any) {
		this.storage = state.storage
	}

	async increment(): Promise<number> {
		const next = (((await this.storage.get('count')) as number | undefined) ?? 0) + 1
		await this.storage.put('count', next)
		return next
	}
}
`.trim()
	)

	return projectDir
}

describe('test context storage isolation', () => {
	test('a second context sees none of the first context’s data', async () => {
		const projectDir = await createStorageProject()
		const configPath = join(projectDir, 'devflare.config.ts')

		await createTestContext(configPath)
		const first = env as unknown as StorageBindings
		try {
			await first.CACHE.put('leaked-key', 'leaked-value')
			await first.FILES.put('leaked-object', 'leaked-body')
			await first.DB.exec('CREATE TABLE leaked (value TEXT)')
			await first.DB.prepare(`INSERT INTO leaked (value) VALUES ('leaked-row')`).run()

			expect(await first.CACHE.get('leaked-key')).toBe('leaked-value')
			expect(await first.COUNTER.getByName('main').increment()).toBe(1)
		} finally {
			await first.dispose()
		}

		await createTestContext(configPath)
		const second = env as unknown as StorageBindings
		try {
			expect(await second.CACHE.get('leaked-key')).toBeNull()
			expect(await second.FILES.get('leaked-object')).toBeNull()
			expect(
				await second.DB.prepare(
					`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'leaked'`
				).first('name')
			).toBeNull()

			// A Durable Object that kept its state would count on from 1.
			expect(await second.COUNTER.getByName('main').increment()).toBe(1)
		} finally {
			await second.dispose()
		}
	}, 30000)
})
