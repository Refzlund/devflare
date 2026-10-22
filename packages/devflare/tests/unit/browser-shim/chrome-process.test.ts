import { describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
	ChromeReapError,
	type ExitingProcess,
	killProcessTree,
	processIsRunning,
	reapExitingChrome
} from '../../../src/browser-shim/chrome-process'

// The reap that replaced `browser.close()` on the `disconnected` path. Its
// contract: a Chrome that exits by itself is seen out SILENTLY and never
// killed; only one still running is killed, by a killer whose output is
// captured; and only one that survives even that is an error. "Exited" is the
// OS's answer as well as the runtime's `exit` event, because on Windows the
// event can trail the exit by seconds.

/** A stand-in Chrome process that exits when a test says so. */
interface FakeChrome extends ExitingProcess {
	/** Exit now: set the exit code and fire `exit`, as a ChildProcess does. */
	exit(): void
	/**
	 * Exit as far as the OS can tell, WITHOUT the `exit` event or an exit
	 * code: a Windows Chrome whose root has exited while its teardown is held
	 * up, which the runtime has not noticed yet.
	 */
	exitUnnoticed(): void
	/** The liveness probe the reap is handed: what the OS says of this process. */
	isRunning(pid: number): boolean
}

/**
 * @param options.exited - start already exited, as a Chrome that crashed first
 * @param options.pid - its pid; pass `undefined` explicitly for a process without one
 */
function createFakeChrome(options: { exited?: boolean; pid?: number } = {}): FakeChrome {
	const events = new EventEmitter()
	let running = !options.exited
	const chrome = {
		pid: 'pid' in options ? options.pid : 4242,
		exitCode: options.exited ? 0 : null,
		signalCode: null,
		once: (event: string, listener: () => void) => events.once(event, listener),
		off: (event: string, listener: () => void) => events.off(event, listener),
		exit() {
			running = false
			chrome.exitCode = 0
			events.emit('exit', 0, null)
		},
		exitUnnoticed() {
			running = false
		},
		isRunning: (pid: number) => pid === chrome.pid && running
	}
	return chrome as unknown as FakeChrome
}

/**
 * A killer that records the pids it was asked to kill.
 * @param chrome - the process its kill acts on
 * @param effect - whether the kill makes that process exit, shortly after
 * @param printed - what the kill reports having printed
 */
function createKiller(
	chrome: FakeChrome | null,
	effect: 'exits' | 'exits-unnoticed' | 'survives',
	printed = ''
) {
	const calls: number[] = []
	return {
		calls,
		async killTree(pid: number) {
			calls.push(pid)
			if (effect === 'exits') setTimeout(() => chrome?.exit(), 5)
			if (effect === 'exits-unnoticed') setTimeout(() => chrome?.exitUnnoticed(), 5)
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
			killTree: killer.killTree,
			isRunning: chrome.isRunning
		})

		expect(outcome).toBe('exited')
		expect(killer.calls).toEqual([])
	})

	test('a Chrome that has already exited is not waited for', async () => {
		const chrome = createFakeChrome({ exited: true })
		const killer = createKiller(chrome, 'exits')
		const started = Date.now()

		expect(
			await reapExitingChrome(chrome, {
				exitGraceMs: 5000,
				killTree: killer.killTree,
				isRunning: chrome.isRunning
			})
		).toBe('exited')
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
			killTree: killer.killTree,
			isRunning: chrome.isRunning
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
			killTree: killer.killTree,
			isRunning: chrome.isRunning
		})

		await expect(reap).rejects.toBeInstanceOf(ChromeReapError)
		await expect(reap).rejects.toThrow('pid 31337')
		await expect(reap).rejects.toThrow('ERROR: Access is denied.')
	})

	test('a Chrome with no pid cannot be killed, and says so', async () => {
		const chrome = createFakeChrome({ pid: undefined })
		const killer = createKiller(chrome, 'exits')

		await expect(
			reapExitingChrome(chrome, {
				exitGraceMs: 10,
				killTree: killer.killTree,
				isRunning: chrome.isRunning
			})
		).rejects.toThrow('no pid')
		expect(killer.calls).toEqual([])
	})

	// Measured under Bun 1.4.2 and Node 25.9.0 on Windows 11 with a real
	// chrome-headless-shell 156: after a CDP `Browser.close`,
	// `process.kill(pid, 0)` answered ESRCH while `exit` had not fired, and
	// `exit` then trailed it by up to ~17 s, past both 5 s graces. The reap
	// killed a Chrome that had exited and reported it "still running", while
	// taskkill's own line for the root said "There is no running instance of
	// the task".
	//
	// → MUTANT: decide "exited" by the `exit` event and the exit code alone, as
	//   before. The grace runs out, the killer runs, the event never comes, and
	//   the reap throws ChromeReapError.
	test('a Chrome the OS reports gone has exited, though its exit event has not come', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'survives')
		setTimeout(() => chrome.exitUnnoticed(), 20)

		const outcome = await reapExitingChrome(chrome, {
			exitGraceMs: 2000,
			killGraceMs: 10,
			killTree: killer.killTree,
			isRunning: chrome.isRunning
		})

		expect(outcome).toBe('exited')
		expect(killer.calls).toEqual([])
	})

	test('a Chrome the OS already reports gone is not waited for', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		chrome.exitUnnoticed()
		const killer = createKiller(chrome, 'survives')
		const started = Date.now()

		expect(
			await reapExitingChrome(chrome, {
				exitGraceMs: 5000,
				killTree: killer.killTree,
				isRunning: chrome.isRunning
			})
		).toBe('exited')
		expect(Date.now() - started).toBeLessThan(1000)
		expect(killer.calls).toEqual([])
	})

	// The same lag after a kill: the kill worked, the event is late.
	//
	// → MUTANT: as above. The reap throws although the OS says the pid is gone.
	test('a killed Chrome the OS reports gone was killed, though its exit event has not come', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'exits-unnoticed')

		const outcome = await reapExitingChrome(chrome, {
			exitGraceMs: 20,
			killGraceMs: 2000,
			killTree: killer.killTree,
			isRunning: chrome.isRunning
		})

		expect(outcome).toBe('killed')
		expect(killer.calls).toEqual([31337])
	})

	// The report still exists: a Chrome the OS says is running after its kill
	// is a process the developer may have to end, whatever the event did.
	//
	// → MUTANT: treat a probe answer of "running" as gone, or stop asking once
	//   the kill has run. The reap resolves, or the probe is asked only before
	//   the kill.
	test('a Chrome the OS still reports running after its kill is still an error', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'survives', 'ERROR: Access is denied.')
		const probedAfterKill: number[] = []

		const reap = reapExitingChrome(chrome, {
			exitGraceMs: 10,
			killGraceMs: 300,
			killTree: killer.killTree,
			isRunning: (pid) => {
				if (killer.calls.length > 0) probedAfterKill.push(pid)
				return chrome.isRunning(pid)
			}
		})

		await expect(reap).rejects.toBeInstanceOf(ChromeReapError)
		await expect(reap).rejects.toThrow('pid 31337')
		await expect(reap).rejects.toThrow('ERROR: Access is denied.')
		expect(killer.calls).toEqual([31337])
		expect(probedAfterKill.length).toBeGreaterThan(1)
		expect(new Set(probedAfterKill)).toEqual(new Set([31337]))
	})

	// A probe that cannot answer is a fault to surface, not a verdict either way.
	test('a liveness probe that throws rejects the reap with its error', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'survives')

		await expect(
			reapExitingChrome(chrome, {
				exitGraceMs: 300,
				killTree: killer.killTree,
				isRunning: () => {
					throw new Error('EINVAL: probe failed')
				}
			})
		).rejects.toThrow('EINVAL: probe failed')
		expect(killer.calls).toEqual([])
	})
})

describe('processIsRunning', () => {
	// The default probe. On Windows `process.kill(pid, 0)` asks the OS for the
	// process's exit code, so it answers for an exited process even while the
	// runtime has not reported the exit.
	test('is true for a running process and false once it has exited', async () => {
		const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
			stdio: 'ignore'
		})
		const exited = new Promise((resolve) => child.once('exit', resolve))
		await new Promise((resolve) => child.once('spawn', resolve))
		const pid = child.pid as number

		try {
			expect(processIsRunning(pid)).toBe(true)
		} finally {
			child.kill('SIGKILL')
		}
		await exited

		expect(processIsRunning(pid)).toBe(false)
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
