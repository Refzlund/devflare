// =============================================================================
// Two test contexts in one process, with Durable Objects
// =============================================================================
// The shape a consumer's suite has when it stops spawning a bun process per
// test file: a module on the Durable Object graph is already loaded here, and
// `createTestContext()` runs more than once. Rebuilding the bundle in that
// state is what `Bun.build` refuses to do, so the second context is only
// reachable through the on-disk bundle cache.
// =============================================================================

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { join } from 'pathe'
import { env } from '../../../src'
import { createTestContext } from '../../../src/test'

const tempDirs: string[] = []
const originalBunBuild = Bun.build

afterAll(async () => {
	restoreBundling()
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

/**
 * Stand in for Bun.build's refusal to re-read a module the test runner has
 * already loaded, so a second context that still bundles fails here rather than
 * on a consumer's machine.
 */
function forbidBundling(): void {
	;(Bun as unknown as { build: () => never }).build = () => {
		throw new Error('EISDIR reading file: module already loaded by the test runner')
	}
}

function restoreBundling(): void {
	;(Bun as unknown as { build: typeof Bun.build }).build = originalBunBuild
}

async function createCounterProject(): Promise<string> {
	const projectDir = await mkdtemp(join(tmpdir(), 'devflare-do-batching-'))
	tempDirs.push(projectDir)

	await mkdir(join(projectDir, 'src'), { recursive: true })
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify({ name: 'do-batching-project', private: true, type: 'module' }, null, 2)
	)
	await writeFile(
		join(projectDir, 'devflare.config.ts'),
		`
export default {
	name: 'do-batching-project',
	compatibilityDate: '2026-03-17',
	bindings: {
		durableObjects: {
			COUNTER: { className: 'Counter' }
		}
	}
}
`.trim()
	)
	await writeFile(
		join(projectDir, 'src', 'step.ts'),
		`
export const STEP = 3
`.trim()
	)
	await writeFile(
		join(projectDir, 'src', 'do.counter.ts'),
		`
import { STEP } from './step'

export class Counter {
	private count = 0

	increment(): number {
		this.count += STEP
		return this.count
	}
}
`.trim()
	)

	return projectDir
}

describe('createTestContext with durable objects, twice in one process', () => {
	test('the second context reuses the bundle instead of rebuilding it', async () => {
		const projectDir = await createCounterProject()
		const configPath = join(projectDir, 'devflare.config.ts')

		// Load a module on the Durable Object graph into this process, exactly as
		// a test file importing its own app code would.
		const step = (await import(pathToFileURL(join(projectDir, 'src', 'step.ts')).href)) as {
			STEP: number
		}
		expect(step.STEP).toBe(3)

		await createTestContext(configPath)
		try {
			expect(await (env as any).COUNTER.getByName('main').increment()).toBe(3)
		} finally {
			await (env as any).dispose()
		}

		forbidBundling()

		try {
			await createTestContext(configPath)
			expect(await (env as any).COUNTER.getByName('main').increment()).toBe(3)
		} finally {
			await (env as any).dispose()
			restoreBundling()
		}
	}, 30000)
})
