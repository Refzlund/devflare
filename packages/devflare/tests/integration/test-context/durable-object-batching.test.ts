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

/** How long a one-line `Bun.build` may run before the bundler counts as stuck; it takes milliseconds. */
const BUNDLER_ANSWER_MS = 5_000

/**
 * @description Fails fast, naming the cause, when Bun's bundler has stopped
 * answering in this process. `createTestContext()` bundles the Durable Object
 * graph with `Bun.build` and puts no bound on it, so a stuck bundler would
 * otherwise show up only as this test's 30-second timeout, which reads as a
 * devflare hang.
 *
 * → Seen with Bun 1.3.12 on Linux, depending on which test files ran earlier
 *   in the same process; the same file order passes on Bun 1.4.2. At that
 *   point even this build hangs, though it has no plugins and touches nothing
 *   of the project, so the bundler itself is stuck.
 * → GOTCHA: keep it right before the first context. A `Bun.build` in an
 *   earlier test FILE was measured to keep the stall from happening at all.
 *
 * @throws when the build has not settled within {@link BUNDLER_ANSWER_MS}
 */
async function expectBundlerAnswers(): Promise<void> {
	const probeDir = await mkdtemp(join(tmpdir(), 'devflare-bundler-probe-'))
	tempDirs.push(probeDir)
	const entry = join(probeDir, 'probe.ts')
	await writeFile(entry, 'export const probe = 1\n')

	let timer: ReturnType<typeof setTimeout> | undefined
	const stuck = new Promise<'stuck'>((resolve) => {
		timer = setTimeout(() => resolve('stuck'), BUNDLER_ANSWER_MS)
	})
	const outcome = await Promise.race([
		originalBunBuild({ entrypoints: [entry], target: 'browser' }),
		stuck
	])
	clearTimeout(timer)

	if (outcome === 'stuck') {
		throw new Error(
			[
				`Bun ${Bun.version}'s bundler did not finish a one-line build within ${BUNDLER_ANSWER_MS / 1000}s,`,
				'so createTestContext(), which bundles Durable Objects with Bun.build, would hang.',
				'The stall is in Bun, not devflare: this build has no plugins and does not touch the project.'
			].join(' ')
		)
	}
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

		await expectBundlerAnswers()
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
