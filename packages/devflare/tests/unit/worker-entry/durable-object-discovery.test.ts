import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import {
	discoverDurableObjectFiles,
	discoverDurableObjects
} from '../../../src/worker-entry/durable-object-discovery'

const TEST_DIR = join(import.meta.dirname, '../.fixtures/do-discovery')

describe('discoverDurableObjectFiles', () => {
	beforeEach(async () => {
		await mkdir(join(TEST_DIR, 'src'), { recursive: true })
	})

	afterEach(async () => {
		await rm(TEST_DIR, { recursive: true, force: true })
	})

	test('returns a stable map of file path → DO class names', async () => {
		await writeFile(
			join(TEST_DIR, 'src', 'do.chat.ts'),
			"import { DurableObject } from 'cloudflare:workers'\nexport class ChatRoom extends DurableObject {}\n"
		)
		await writeFile(
			join(TEST_DIR, 'src', 'do.counter.ts'),
			"import { DurableObject } from 'cloudflare:workers'\nexport class Counter extends DurableObject {}\nexport class Counter2 extends DurableObject {}\n"
		)
		await writeFile(join(TEST_DIR, 'src', 'do.empty.ts'), 'export const noop = () => {}\n')

		const result = await discoverDurableObjectFiles(TEST_DIR, 'src/do.*.ts')

		expect(result.size).toBe(2)

		const entries = Array.from(result.entries()).map(([path, classes]) => [
			path.replace(TEST_DIR, '').replace(/\\/g, '/'),
			classes.slice().sort()
		])
		entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])))

		expect(entries).toEqual([
			['/src/do.chat.ts', ['ChatRoom']],
			['/src/do.counter.ts', ['Counter', 'Counter2']]
		])
	})

	test('discoverDurableObjects wraps the file map with the worker name', async () => {
		await writeFile(
			join(TEST_DIR, 'src', 'do.thing.ts'),
			"import { DurableObject } from 'cloudflare:workers'\nexport class Thing extends DurableObject {}\n"
		)

		const discovery = await discoverDurableObjects(TEST_DIR, 'src/do.*.ts', 'do-worker')

		expect(discovery.workerName).toBe('do-worker')
		expect(discovery.files.size).toBe(1)
		expect(Array.from(discovery.files.values())[0]).toEqual(['Thing'])
	})

	test('returns an empty map when no files match', async () => {
		const result = await discoverDurableObjectFiles(TEST_DIR, 'src/do.*.ts')
		expect(result.size).toBe(0)
	})
})
