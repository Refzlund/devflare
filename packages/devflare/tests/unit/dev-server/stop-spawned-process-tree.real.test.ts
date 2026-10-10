/*
	Real child processes, not fakes: what `ChildProcess.killed` means is decided
	by the runtime, and a fake only encodes whatever the author believed it means.
	Both runtimes set `killed` the moment `kill()` SENDS a signal, long before the
	child exits — the belief these tests exist to refute.

	→ NOTE: unit lane on purpose. These children bind no port and start no
	  workerd, which is what the serial integration lanes exist for, and the unit
	  lane is the one the publish workflow gates on.
*/
import { afterEach, describe, expect, test } from 'bun:test'
import childProcess, { ChildProcess, spawn } from 'node:child_process'
import { stopSpawnedProcessTree } from '../../../src/dev-server/vite-utils'

const children: ChildProcess[] = []

afterEach(() => {
	for (const child of children.splice(0)) {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill('SIGKILL')
		}
	}
})

/**
 * @description Spawns the current runtime on an inline script, as `devflare dev`
 * spawns Vite: through `node:child_process`, whose `ChildProcess` is the subject.
 * @param script - source for `-e`
 * @returns the child, registered for cleanup
 * @throws when `spawn` is not the real one, by its named or its default export,
 *   so a module mock leaked from another file fails here by name instead of as a
 *   fake child that never exits
 */
function spawnScript(script: string): ChildProcess {
	const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] })
	// Registered before the check: when only the default export is mocked, the
	// named `spawn` above started a real child, and the cleanup must reach it.
	children.push(child)
	if (!(child instanceof ChildProcess) || childProcess.spawn !== spawn) {
		throw new Error('node:child_process is mocked: another test file left a mock.module in place')
	}
	return child
}

/**
 * @description Resolves once the child prints `ready`, so a signal sent after it
 * meets the handler the script installs rather than the default disposition.
 */
function untilReady(child: ChildProcess): Promise<void> {
	return new Promise((resolvePromise, rejectPromise) => {
		let output = ''
		child.stdout?.on('data', (chunk: Buffer) => {
			output += chunk.toString()
			if (output.includes('ready')) {
				resolvePromise()
			}
		})
		child.on('exit', (code, signal) =>
			rejectPromise(new Error(`child exited before it was ready (${code ?? signal})`))
		)
	})
}

/** @description Resolves once the child has exited and recorded it. */
function untilExited(child: ChildProcess): Promise<void> {
	return new Promise((resolvePromise) => child.once('exit', () => resolvePromise()))
}

/**
 * The two ways a child is already gone, each recorded in its own field:
 * `exitCode` when it ended itself, `signalCode` when a signal ended it — as
 * Ctrl+C ends a dev server's children on macOS and Linux. Each spawns a child,
 * waits for it to exit, and asserts which field recorded the exit.
 */
const ALREADY_EXITED: Array<[string, () => Promise<ChildProcess>]> = [
	[
		'with an exit code',
		async () => {
			const child = spawnScript('')
			await untilExited(child)
			expect(child.exitCode).toBe(0)
			expect(child.signalCode).toBeNull()
			return child
		}
	],
	[
		'on a signal',
		async () => {
			const child = spawnScript("console.log('ready'); setInterval(() => {}, 1000)")
			await untilReady(child)
			child.kill('SIGTERM')
			await untilExited(child)
			expect(child.exitCode).toBeNull()
			expect(child.signalCode).toBe('SIGTERM')
			return child
		}
	]
]

describe('stopSpawnedProcessTree, against a real child', () => {
	test.skipIf(process.platform === 'win32')(
		'escalates to SIGKILL and waits for the exit when the child traps SIGTERM',
		async () => {
			const child = spawnScript(
				"process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"
			)
			await untilReady(child)

			const exited = await stopSpawnedProcessTree(child, { timeoutMs: 300 })

			// Read at the moment stop resolves: the child must already be gone, and
			// gone to the SIGKILL, since it ignores the SIGTERM.
			expect(child.signalCode).toBe('SIGKILL')
			expect(exited).toBe(true)
		}
	)

	test.each(ALREADY_EXITED)(
		'returns at once for a child that has already exited %s',
		async (_how, exitChild) => {
			const child = await exitChild()

			const timeoutMs = 5000
			const startedAt = performance.now()
			const exited = await stopSpawnedProcessTree(child, {
				timeoutMs,
				// No taskkill on Windows: the pid is dead and may already belong to
				// another process. The subject is the wait, which runs after it.
				runCommand: async () => {}
			})
			const elapsedMs = performance.now() - startedAt

			expect(exited).toBe(true)
			// The exit event fired before stop listened for one, so a wait that
			// trusts only the event sits out its whole budget.
			expect(elapsedMs).toBeLessThan(timeoutMs / 5)
			// Room for the old behaviour to sit out two whole budgets and FAIL on the
			// assertion above, rather than on bun's 5s default test timeout.
		},
		20_000
	)
})
