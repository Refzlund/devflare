import { describe, expect, mock, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { ConsolaInstance } from 'consola'
import type { Browser } from 'puppeteer-core'
import {
	ChromeLivenessError,
	ChromeReapError,
	type ExitingProcess,
	killProcessTree,
	processIsRunning,
	reapExitingChrome,
	toSessionBrowser
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
		const seenByOs: number[] = []
		setTimeout(() => chrome.exit(), 20)

		const outcome = await reapExitingChrome(chrome, {
			exitGraceMs: 1000,
			killTree: killer.killTree,
			isRunning: chrome.isRunning,
			onExitSeenByOs: (pid) => seenByOs.push(pid)
		})

		expect(outcome).toBe('exited')
		expect(killer.calls).toEqual([])
		// The event decided, so there is nothing to trace.
		expect(seenByOs).toEqual([])
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
	//
	// → MUTANT: drop the poll, leaving the probe asked only at once and at the
	//   deadline. The reap still says `exited`, but only when the 2 s grace ends.
	// → MUTANT: drop the onExitSeenByOs call. Nothing traces the late event.
	test('a Chrome the OS reports gone has exited, though its exit event has not come', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'survives')
		const seenByOs: number[] = []
		setTimeout(() => chrome.exitUnnoticed(), 20)
		const started = Date.now()

		const outcome = await reapExitingChrome(chrome, {
			exitGraceMs: 2000,
			killGraceMs: 10,
			killTree: killer.killTree,
			isRunning: chrome.isRunning,
			onExitSeenByOs: (pid) => seenByOs.push(pid)
		})

		expect(outcome).toBe('exited')
		// Seen on the poll, long before the grace runs out.
		expect(Date.now() - started).toBeLessThan(500)
		expect(killer.calls).toEqual([])
		expect(seenByOs).toEqual([31337])
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
		// → MUTANT: drop the probe asked at once. The first poll answers, 100 ms in.
		expect(Date.now() - started).toBeLessThan(50)
		expect(killer.calls).toEqual([])
	})

	// The same lag after a kill: the kill worked, the event is late.
	//
	// → MUTANT: as above. The reap throws although the OS says the pid is gone.
	test('a killed Chrome the OS reports gone was killed, though its exit event has not come', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'exits-unnoticed')
		const seenByOs: number[] = []
		const started = Date.now()

		const outcome = await reapExitingChrome(chrome, {
			exitGraceMs: 20,
			killGraceMs: 2000,
			killTree: killer.killTree,
			isRunning: chrome.isRunning,
			onExitSeenByOs: (pid) => seenByOs.push(pid)
		})

		expect(outcome).toBe('killed')
		// Seen on the poll, long before the kill grace runs out.
		expect(Date.now() - started).toBeLessThan(500)
		expect(killer.calls).toEqual([31337])
		expect(seenByOs).toEqual([31337])
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

	// A probe that cannot answer is a fault to surface, not a verdict either way —
	// and the report must say which Chrome, and that it was left running.
	//
	// → MUTANT: let the probe's own error through. It names no pid and does not
	//   say the kill never ran.
	test('a liveness probe that fails before the kill names the Chrome and says it was not killed', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'survives')
		const failure = new Error('EINVAL: probe failed')

		const reap = reapExitingChrome(chrome, {
			exitGraceMs: 300,
			killTree: killer.killTree,
			isRunning: () => {
				throw failure
			}
		})

		await expect(reap).rejects.toBeInstanceOf(ChromeLivenessError)
		await expect(reap).rejects.toThrow('pid 31337')
		await expect(reap).rejects.toThrow('so it was not killed: EINVAL: probe failed')
		await expect(reap).rejects.toMatchObject({ pid: 31337, cause: failure })
		expect(killer.calls).toEqual([])
	})

	test('a liveness probe that fails after the kill says the kill ran', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'survives')

		const reap = reapExitingChrome(chrome, {
			exitGraceMs: 10,
			killGraceMs: 300,
			killTree: killer.killTree,
			isRunning: (pid) => {
				if (killer.calls.length > 0) throw new Error('EINVAL: probe failed')
				return chrome.isRunning(pid)
			}
		})

		await expect(reap).rejects.toBeInstanceOf(ChromeLivenessError)
		await expect(reap).rejects.toThrow('exited after it was killed')
		expect(killer.calls).toEqual([31337])
	})

	// A reap that has finished must stop asking: a poll left running would ask
	// the OS ten times a second, for every session the dev server ever ended.
	//
	// → MUTANT: drop `clearInterval(poll)` from waitForExit's stop(). The probe
	//   keeps being asked after the reap resolved.
	test.each([
		['the exit event', 'exit'],
		['the OS', 'exitUnnoticed']
	] as const)('a reap decided by %s stops asking the OS', async (_, how) => {
		const chrome = createFakeChrome({ pid: 31337 })
		const killer = createKiller(chrome, 'survives')
		let probes = 0
		setTimeout(() => chrome[how](), 150)

		await reapExitingChrome(chrome, {
			exitGraceMs: 2000,
			killTree: killer.killTree,
			isRunning: (pid) => {
				probes += 1
				return chrome.isRunning(pid)
			}
		})
		const probesAtResolve = probes
		await new Promise((resolve) => setTimeout(resolve, 350))

		// It polled while it waited — so a later poll WOULD show up.
		expect(probesAtResolve).toBeGreaterThan(1)
		expect(probes).toBe(probesAtResolve)
	})
})

describe('processIsRunning', () => {
	/** A stand-in for `process.kill` that fails the way the OS would. */
	function failingWith(code: string) {
		const calls: Array<[number, number]> = []
		return {
			calls,
			kill(pid: number, signal: number): never {
				calls.push([pid, signal])
				throw Object.assign(new Error(`kill ${code}`), { code })
			}
		}
	}

	test('asks with signal 0, and a call that returns means running', () => {
		const calls: Array<[number, number]> = []
		expect(processIsRunning(31337, (pid, signal) => calls.push([pid, signal]))).toBe(true)
		expect(calls).toEqual([[31337, 0]])
	})

	test('ESRCH means gone', () => {
		expect(processIsRunning(31337, failingWith('ESRCH').kill)).toBe(false)
	})

	// → MUTANT: map EPERM to "gone". A Chrome that is not ours to signal would
	//   be seen out as exited, and never killed or reported.
	test('EPERM means running: the process exists, it is just not ours to signal', () => {
		expect(processIsRunning(31337, failingWith('EPERM').kill)).toBe(true)
	})

	test('any other failure is thrown, not taken as an answer', () => {
		expect(() => processIsRunning(31337, failingWith('EINVAL').kill)).toThrow('kill EINVAL')
	})

	// The default probe, against the OS. On Windows `process.kill(pid, 0)` asks
	// for the process's exit code, so it answers for an exited process even
	// while the runtime has not reported the exit — and it is asked in a loop
	// that never yields, so the runtime cannot report `exit`, and release the pid
	// for reuse by some other process, before the probe has answered.
	//
	// → NOTE: on POSIX a killed child is a zombie, which `kill(pid, 0)` reports
	//   as running, until the runtime reaps it — which it does only on its event
	//   loop, as it reports `exit`. So there the probe is asked after `exit`.
	test('is true for a running process and false once it has exited', async () => {
		const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
			stdio: 'ignore'
		})
		const exited = new Promise((resolve) => child.once('exit', resolve))
		await new Promise((resolve) => child.once('spawn', resolve))
		const pid = child.pid as number

		expect(processIsRunning(pid)).toBe(true)
		child.kill('SIGKILL')

		let running = true
		if (process.platform === 'win32') {
			const deadline = Date.now() + 5000
			while (running && Date.now() < deadline) running = processIsRunning(pid)
			await exited
		} else {
			await exited
			running = processIsRunning(pid)
		}

		expect(running).toBe(false)
	})
})

describe('toSessionBrowser', () => {
	// The trace the reap offers is only worth anything if the shim's browser
	// writes it somewhere a developer looking can see.
	//
	// → MUTANT: drop toSessionBrowser's default onExitSeenByOs. A Chrome the OS
	//   saw out before the runtime did leaves no line at all.
	test('a reap decided by the OS leaves a debug line naming the Chrome', async () => {
		const chrome = createFakeChrome({ pid: 31337 })
		chrome.exitUnnoticed()
		const browser = { process: () => chrome } as unknown as Browser
		const debug = mock((message: string) => message)

		await toSessionBrowser(browser, { isRunning: chrome.isRunning }, {
			debug
		} as unknown as ConsolaInstance).reap()

		expect(debug.mock.calls.map(([message]) => message)).toEqual([
			"[BrowserShim] Chrome (pid 31337) had exited by the OS's account before the runtime reported it"
		])
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
