// =============================================================================
// Chrome Process — launch a session's Chrome, and see an exiting one out
// =============================================================================
/*
	The shim learns a session is over from puppeteer's `disconnected`, and that
	almost always means Chrome is ALREADY exiting: on the dev path the client's
	own `Browser.close` goes straight to Chrome. The registry used to answer by
	calling `browser.close()` anyway. puppeteer-core 25 tries a CDP close over the
	connection that just dropped, fails, and falls back to @puppeteer/browsers'
	`Process.kill()` — which on Windows runs `execSync('taskkill /pid X /T /F')`
	with no `stdio`, so taskkill's stderr is INHERITED. Against a half-exited
	process tree it prints `ERROR: The process "X" not found.` or `… could not be
	terminated. Reason: There is no running instance of the task.` into the
	developer's dev log, on every single session close. Measured: 10 of 10
	sessions, 18 stderr lines.

	A Chrome that disconnected is therefore given time to exit by itself, which
	is the normal case and makes no sound. Only one still running after that is
	killed — by devflare, with taskkill's output captured, so "already gone" is
	the success it is — and only one that survives even the kill is reported.

	→ KEY: this is for the `disconnected` path ONLY. Idle reaping, shutdown and
	  the shim's connection timeout close a Chrome that is still running, and
	  they keep `browser.close()`: there a CDP close is the right request.
	→ GOTCHA: on POSIX @puppeteer/browsers launches Chrome DETACHED, as its own
	  process group, which is why the kill below can take the whole tree with a
	  negative pid. The fallback to the bare pid covers a launch that was not.
*/

import { type ChildProcess, execFile } from 'node:child_process'
import puppeteerCore, { type Browser, type BrowserEvent } from 'puppeteer-core'
import type { LaunchedBrowser, SessionBrowser } from './sessions'

/** How long a disconnected Chrome gets to exit by itself before it is killed. */
export const DEFAULT_EXIT_GRACE_MS = 5000

/** How long a killed Chrome gets to report its exit before the reap gives up. */
export const DEFAULT_KILL_GRACE_MS = 5000

/** The part of a `ChildProcess` the reaper reads. */
export type ExitingProcess = Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode' | 'once' | 'off'>

/** How a reap waits, and how it kills. */
export interface ReapOptions {
	/** Milliseconds to wait for Chrome to exit by itself. */
	exitGraceMs?: number
	/** Milliseconds to wait for Chrome to exit once killed. */
	killGraceMs?: number
	/**
	 * Kill the process tree rooted at `pid`. Resolves with what the kill
	 * printed, for the report should the process survive it; must never let
	 * that output reach the terminal itself. Defaults to {@link killProcessTree}.
	 */
	killTree?: (pid: number) => Promise<string>
}

/** How an exiting Chrome ended: by itself, or because it was killed. */
export type ReapOutcome = 'exited' | 'killed'

/**
 * A Chrome that was still running after it was killed — a process the
 * developer may have to end by hand, so it is reported rather than dropped.
 */
export class ChromeReapError extends Error {
	/** The process that would not exit. */
	readonly pid: number | undefined

	constructor(pid: number | undefined, detail: string) {
		super(
			`Chrome (pid ${pid ?? 'unknown'}) was still running after its DevTools connection closed and it was killed: ${detail}`
		)
		this.name = 'ChromeReapError'
		this.pid = pid
	}
}

/**
 * @description See out a Chrome whose DevTools connection has already gone:
 * wait for it to exit by itself, and kill it only if it does not.
 * @param chrome - the browser process; `null` when puppeteer launched none
 * @param options - the two grace periods and the killer, see {@link ReapOptions}
 * @returns `exited` when Chrome exited by itself — the normal close, and
 * silent — or `killed` when it had to be killed and then did exit
 * @throws {ChromeReapError} when Chrome is still running after the kill
 */
export async function reapExitingChrome(
	chrome: ExitingProcess | null,
	options: ReapOptions = {}
): Promise<ReapOutcome> {
	const {
		exitGraceMs = DEFAULT_EXIT_GRACE_MS,
		killGraceMs = DEFAULT_KILL_GRACE_MS,
		killTree = killProcessTree
	} = options

	if (!chrome || (await waitForExit(chrome, exitGraceMs))) return 'exited'

	if (chrome.pid === undefined) {
		throw new ChromeReapError(undefined, 'it has no pid to kill')
	}

	const killOutput = await killTree(chrome.pid)
	if (await waitForExit(chrome, killGraceMs)) return 'killed'

	throw new ChromeReapError(chrome.pid, killOutput || 'the kill printed nothing')
}

/**
 * @description Resolve once `chrome` has exited, or after `ms` without.
 * @returns whether it exited
 */
function waitForExit(chrome: ExitingProcess, ms: number): Promise<boolean> {
	if (chrome.exitCode !== null || chrome.signalCode !== null) return Promise.resolve(true)

	return new Promise((resolve) => {
		const onExit = () => {
			clearTimeout(timer)
			resolve(true)
		}
		const timer = setTimeout(() => {
			chrome.off('exit', onExit)
			resolve(false)
		}, ms)
		// A wait for Chrome must not be what keeps a stopping dev server alive.
		timer.unref?.()
		chrome.once('exit', onExit)
	})
}

/**
 * @description Kill a process and everything it started, capturing whatever
 * the kill prints instead of letting it reach the terminal.
 *
 * → taskkill exits non-zero for a tree that is partly or wholly gone already
 *   ("not found", "There is no running instance of the task") — which is the
 *   race this runs in, not a failure. Whether the kill worked is decided by the
 *   process's exit, not by taskkill, so its output is returned as evidence
 *   rather than thrown.
 *
 * @param pid - the root of the tree
 * @returns what the kill printed, or why it could not run; empty when it was silent
 */
export function killProcessTree(pid: number): Promise<string> {
	if (process.platform === 'win32') {
		return new Promise((resolve) => {
			execFile(
				'taskkill',
				['/pid', String(pid), '/T', '/F'],
				{ windowsHide: true },
				(error, stdout, stderr) => {
					const printed = `${stdout}${stderr}`.trim()
					resolve(printed || (error ? error.message : ''))
				}
			)
		})
	}

	return Promise.resolve(killPosixTree(pid))
}

/**
 * @description SIGKILL a POSIX process group, falling back to the lone pid.
 * @returns why neither kill landed, or empty when one did or the process was
 * already gone
 */
function killPosixTree(pid: number): string {
	const failures: string[] = []
	for (const target of [-pid, pid]) {
		try {
			process.kill(target, 'SIGKILL')
			return ''
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code
			if (code === 'ESRCH' && target === pid) return ''
			failures.push(`kill(${target}): ${error instanceof Error ? error.message : String(error)}`)
		}
	}
	return failures.join('; ')
}

/**
 * @description Present a puppeteer `Browser` as the registry's
 * {@link SessionBrowser}: a CDP close for a Chrome that is running, and a reap
 * for one that has disconnected.
 * @param browser - a browser puppeteer launched, so it owns a process
 * @param options - how a reap waits and kills; defaults suit a dev server
 */
export function toSessionBrowser(browser: Browser, options: ReapOptions = {}): SessionBrowser {
	const chrome = browser.process()

	return {
		close: () => browser.close(),
		reap: async () => {
			await reapExitingChrome(chrome, options)
		},
		// BrowserEvent is an ambient const enum, so its member is named by type
		// only; at runtime it is the same 'disconnected' string the registry passes.
		on: (event, handler) => browser.on(event as BrowserEvent.Disconnected, handler)
	}
}

/** What one Chrome launch needs. */
export interface ChromeLaunchOptions {
	/** The chrome-headless-shell to run. */
	executablePath: string
	/** Command-line flags; see `resolveChromeFlags()` in ./server. */
	args: string[]
	/** How a disconnected Chrome is seen out. */
	reap?: ReapOptions
}

/**
 * @description Start one headless Chrome with remote debugging, as a session's
 * browser. The registry's only route to a real browser.
 * @param options - the executable, its flags, and the reap policy
 * @returns the browser, already wrapped for the registry, and the DevTools
 * endpoint a client connects to
 */
export async function launchChromeSession(options: ChromeLaunchOptions): Promise<LaunchedBrowser> {
	const browser = await puppeteerCore.launch({
		executablePath: options.executablePath,
		headless: true,
		// Increase protocol timeout for complex pages
		protocolTimeout: 120000,
		args: options.args
	})

	return { browser: toSessionBrowser(browser, options.reap), wsEndpoint: browser.wsEndpoint() }
}
