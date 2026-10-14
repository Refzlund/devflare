import { describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
	ChromeReapError,
	type ExitingProcess,
	killProcessTree,
	reapExitingChrome
} from '../../../src/browser-shim/chrome-process'

// The reap that replaced `browser.close()` on the `disconnected` path. Its
// contract: a Chrome that exits by itself is seen out SILENTLY and never
// killed; only one still running is killed, by a killer whose output is
// captured; and only one that survives even that is an error.

/** A stand-in Chrome process that exits when a test says so. */
interface FakeChrome extends ExitingProcess {
	exit(): void
}

function createFakeChrome(options: { exited?: boolean; pid?: number } = {}): FakeChrome {
	const events = new EventEmitter()
	const chrome = {
		pid: 'pid' in options ? options.pid : 4242,
		exitCode: options.exited ? 0 : null,
		signalCode: null,
		once: (event: string, listener: () => void) => events.once(event, listener),
		off: (event: string, listener: () => void) => events.off(event, listener),
		exit() {
			chrome.exitCode = 0
			events.emit('exit', 0, null)
		}
	}
	return chrome as unknown as FakeChrome
}

/** A killer that records its calls, and may make the process exit. */
function createKiller(chrome: FakeChrome | null, effect: 'exits' | 'survives', printed = '') {
	const calls: number[] = []
	return {
		calls,
		async killTree(pid: number) {
			calls.push(pid)
			if (effect === 'exits') setTimeout(() => chrome?.exit(), 5)
			return printed
		}
	}
}

describe('reapExitingChrome', () => {
	// The normal close: Chrome was asked to close by its client and is exiting.
	//
	// → MUTANT: drop the first waitForExit() in reapExitingChrome() and kill at
	//   once — puppeteer's behaviour, in devflare's own clothes. The killer runs.
	test('a Chrome that exits by itself is never killed', async () => {
		const chrome = createFakeChrome()
		const killer = createKiller(chrome, 'exits')
		setTimeout(() => chrome.exit(), 20)

		const outcome = await reapExitingChrome(chrome, {
			exitGraceMs: 1000,
			killTree: killer.killTree
		})

		expect(outcome).toBe('exited')
		expect(killer.calls).toEqual([])
	})

	test('a Chrome that has already exited is not waited for', async () => {
		const chrome = createFakeChrome({ exited: true })
		const killer = createKiller(chrome, 'exits')
		const started = Date.now()

		expect(await reapExitingChrome(chrome, { exitGraceMs: 5000, killTree: killer.killTree })).toBe(
			'exited'
		)
		expect(Date.now() - started).toBeLessThan(1000)
		expect(killer.calls).toEqual([])
	})

	test('a browser launched with no process has nothing to reap', async () => {
		expect(await reapExitingChrome(null)).toBe('exited')
	})

	// Disconnected, yet still running past its grace: a wedged exit, or a
	// connection that dropped under a live Chrome. It must not be left behind.
	//
	// → MUTANT: return 'exited' instead of killing when the grace runs out.
	test('a Chrome still running after its grace is killed, tree and all', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'exits')

		const outcome = await reapExitingChrome(chrome, {
			exitGraceMs: 20,
			killGraceMs: 1000,
			killTree: killer.killTree
		})

		expect(outcome).toBe('killed')
		expect(killer.calls).toEqual([31337])
	})

	// The one case that IS an error, carrying what the kill said.
	//
	// → MUTANT: return 'killed' without waiting for the exit after the kill.
	test('a Chrome that survives its kill is an error naming the pid and what the kill said', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'survives', 'ERROR: Access is denied.')

		const reap = reapExitingChrome(chrome, {
			exitGraceMs: 10,
			killGraceMs: 10,
			killTree: killer.killTree
		})

		await expect(reap).rejects.toBeInstanceOf(ChromeReapError)
		await expect(reap).rejects.toThrow('pid 31337')
		await expect(reap).rejects.toThrow('ERROR: Access is denied.')
	})

	test('a Chrome with no pid cannot be killed, and says so', async () => {
		const chrome = createFakeChrome({ pid: undefined })
		const killer = createKiller(chrome, 'exits')

		await expect(
			reapExitingChrome(chrome, { exitGraceMs: 10, killTree: killer.killTree })
		).rejects.toThrow('no pid')
		expect(killer.calls).toEqual([])
	})
})

describe('killProcessTree', () => {
	// puppeteer's own kill is `execSync('taskkill …')` with no `stdio`, which
	// INHERITS stderr: that is how "ERROR: The process … not found." reached
	// the dev log. This one must hand the output back instead.
	//
	// → MUTANT: kill the way @puppeteer/browsers does, with
	//   `execSync('taskkill /pid <pid> /T /F')` and no `stdio`. The second
	//   kill's `ERROR: The process "…" not found.` lands on the test run's own
	//   stderr, and `again` is empty.
	test('kills a real process, and captures what a kill of a dead one prints', async () => {
		const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
			stdio: 'ignore'
		})
		const exited = new Promise((resolve) => child.once('exit', resolve))
		await new Promise((resolve) => child.once('spawn', resolve))
		const pid = child.pid as number

		await killProcessTree(pid)
		await exited
		const again = await killProcessTree(pid)

		expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
		if (process.platform === 'win32') {
			// taskkill's "not found" arrives here as a value, not on stderr.
			expect(again).toMatch(/not found|no running instance/i)
		} else {
			// POSIX: ESRCH is "already gone", which is success and says nothing.
			expect(again).toBe('')
		}
	})
})
