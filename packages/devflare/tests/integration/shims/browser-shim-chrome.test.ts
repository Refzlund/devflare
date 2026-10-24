// =============================================================================
// Browser shim sessions against a REAL chrome-headless-shell
// =============================================================================
/*
	The shim's registry reacts to puppeteer's `disconnected` — which on the dev
	path almost always means the client's own `Browser.close` already reached
	Chrome — by tearing the session's Chrome down. It used to call
	`browser.close()`, whose fallback is @puppeteer/browsers' `Process.kill()`:
	`execSync('taskkill /pid X /T /F')` with stderr inherited. On Windows that
	printed taskkill's errors about the half-exited tree into the developer's
	dev log on every session close — measured 10 of 10.

	These drive the shim's real launch and real registry against a real Chrome,
	end each session the way a client does, and count the kills puppeteer
	attempts: `execSync('taskkill …')` on Windows, `process.kill(…, 'SIGKILL')`
	elsewhere.

	→ NOTE: needs chrome-headless-shell already on disk; a test must not
	  download 100 MB. It looks where `devflare dev` installs it,
	  ~/.devflare/chrome, or at DEVFLARE_TEST_CHROME_PATH, and SKIPS otherwise —
	  which is the case on CI, so this runs on a developer's machine.
*/

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import childProcess from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Browser, getInstalledBrowsers } from '@puppeteer/browsers'
import type { ConsolaInstance } from 'consola'
import {
	DEFAULT_EXIT_GRACE_MS,
	launchChromeSession
} from '../../../src/browser-shim/chrome-process'
import { resolveChromeFlags } from '../../../src/browser-shim/server'
import {
	type BrowserSessionRegistry,
	createSessionRegistry
} from '../../../src/browser-shim/sessions'
import { createLogger, renderMessages, type TestLogger } from '../../helpers/mock-logger'

/** Where `devflare dev` installs Chrome, and so where a developer already has one. */
const DEVFLARE_CHROME_CACHE = join(homedir(), '.devflare', 'chrome')

const executablePath = await findInstalledChrome()

const SKIP_REASON = executablePath
	? ''
	: ` — SKIPPED: no chrome-headless-shell in ${DEVFLARE_CHROME_CACHE} and DEVFLARE_TEST_CHROME_PATH is unset`

/** Sessions each test ends; enough to see a per-session kill that is not every time. */
const CYCLES = 3

/**
 * @description The chrome-headless-shell to drive, without downloading one.
 * @returns its path, or `null` when none is installed
 */
async function findInstalledChrome(): Promise<string | null> {
	if (process.env.DEVFLARE_TEST_CHROME_PATH) return process.env.DEVFLARE_TEST_CHROME_PATH

	const installed = await getInstalledBrowsers({ cacheDir: DEVFLARE_CHROME_CACHE }).catch(
		(error: NodeJS.ErrnoException) => {
			// A cache directory that does not exist means "nothing installed".
			if (error.code === 'ENOENT') return []
			throw error
		}
	)
	return (
		installed.find((browser) => browser.browser === Browser.CHROMEHEADLESSSHELL)?.executablePath ??
		null
	)
}

describe.skipIf(!executablePath)(`browser shim sessions with real Chrome${SKIP_REASON}`, () => {
	let logger: TestLogger
	let registry: BrowserSessionRegistry
	let execSync: ReturnType<typeof spyOn>
	let kill: ReturnType<typeof spyOn>

	beforeEach(() => {
		logger = createLogger()
		// Both pass straight through; they only count.
		execSync = spyOn(childProcess, 'execSync')
		kill = spyOn(process, 'kill')
	})

	afterEach(async () => {
		await registry?.closeAll()
		execSync.mockRestore()
		kill.mockRestore()
	})

	function createRegistry(keepAlive: number): BrowserSessionRegistry {
		registry = createSessionRegistry({
			keepAlive,
			logger: logger as unknown as ConsolaInstance,
			launch: () =>
				launchChromeSession({
					executablePath: executablePath as string,
					args: resolveChromeFlags()
				})
		})
		return registry
	}

	/** The kills of a Chrome that puppeteer's fallback attempted. */
	function chromeKills(): string[] {
		const taskkills = (execSync.mock.calls as unknown[][])
			.map((call) => String(call[0]))
			.filter((command) => command.startsWith('taskkill'))
		const sigkills = (kill.mock.calls as unknown[][])
			.filter((call) => call[1] === 'SIGKILL')
			.map((call) => `kill(${call[0]}, SIGKILL)`)
		return [...taskkills, ...sigkills]
	}

	/** Wait until `sessionId` reaches history, i.e. its teardown has finished. */
	async function ended(sessionId: string, budgetMs = 15000): Promise<string | undefined> {
		const deadline = Date.now() + budgetMs
		while (Date.now() < deadline) {
			const entry = registry.history().find((closed) => closed.sessionId === sessionId)
			if (entry) return entry.closeReasonText
			await new Promise((resolve) => setTimeout(resolve, 20))
		}
		return undefined
	}

	/**
	 * Whether Chrome's DevTools port still answers — false once the process is
	 * gone. A refused connection is the expected answer, not a failure.
	 *
	 * → A reap can now finish on the OS's word that Chrome exited, before
	 *   Windows has torn its sockets down. A connection accepted by a dying
	 *   process and never answered is "not answering" — bounded, so it can
	 *   never hang the test instead.
	 */
	async function answers(port: string): Promise<boolean> {
		return fetch(`http://127.0.0.1:${port}/json/version`, {
			signal: AbortSignal.timeout(2000)
		}).then(
			() => true,
			() => false
		)
	}

	/** Close Chrome the way @cloudflare/puppeteer does: CDP `Browser.close`. */
	async function closeOverCdp(wsEndpoint: string): Promise<void> {
		const socket = new WebSocket(wsEndpoint)
		await new Promise<void>((resolve, reject) => {
			socket.addEventListener('open', () =>
				socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
			)
			socket.addEventListener('close', () => resolve())
			socket.addEventListener('error', () => reject(new Error(`could not reach ${wsEndpoint}`)))
		})
	}

	// → MUTANT: in sessions.ts, hand the `disconnected` handler closeBrowser
	//   instead of reapBrowser — the pre-fix behaviour. On Windows each session
	//   then costs a `taskkill` whose errors reach the terminal.
	test('a session its client closed is seen out without a kill or a word', async () => {
		createRegistry(60000)

		for (let cycle = 0; cycle < CYCLES; cycle += 1) {
			const { sessionId } = await registry.acquire()
			const session = registry.attach(sessionId)
			await closeOverCdp(session?.wsEndpoint as string)
			const closedAt = Date.now()

			expect(await ended(sessionId)).toBe('ChromeDisconnected')
			// Chrome exited by itself, well inside the grace a reap allows: the
			// quiet path ran, not the kill.
			expect(Date.now() - closedAt).toBeLessThan(DEFAULT_EXIT_GRACE_MS)
			// Seen out means GONE: the DevTools port no longer answers.
			expect(await answers(new URL(session?.wsEndpoint as string).port)).toBe(false)
		}

		expect(chromeKills()).toEqual([])
		expect(renderMessages(logger).filter((line) => /error|fail/i.test(line))).toEqual([])
	}, 60000)

	// The kill path, on a Chrome that really is still running: nothing above
	// reaches it, because a Chrome that was asked to close exits by itself.
	//
	// → MUTANT: make toSessionBrowser()'s reap `async () => {}`, or hand
	//   reapExitingChrome() `null` for the process. Chrome stays up and its
	//   DevTools port still answers.
	test('a running Chrome that is reaped is killed, and nothing is printed', async () => {
		const launched = await launchChromeSession({
			executablePath: executablePath as string,
			args: resolveChromeFlags(),
			reap: { exitGraceMs: 100 }
		})
		const port = new URL(launched.wsEndpoint).port

		try {
			const started = Date.now()
			await launched.browser.reap()

			expect(await answers(port)).toBe(false)
			expect(Date.now() - started).toBeLessThan(DEFAULT_EXIT_GRACE_MS)
			// devflare's own kill captures its output; puppeteer's taskkill never ran.
			expect(chromeKills().filter((kill) => kill.startsWith('taskkill'))).toEqual([])
		} finally {
			// A Chrome a broken reap left running must not outlive the test.
			if (await answers(port)) await launched.browser.close()
		}
	}, 60000)

	// The other side of the change: endings the shim decides on meet a Chrome
	// that is still running, and must still close it — over CDP, cleanly.
	test("the shim's own endings still close a running Chrome cleanly", async () => {
		createRegistry(150)

		const idle = await registry.acquire()
		expect(await ended(idle.sessionId)).toBe('BrowserIdle')

		const shutdown = await registry.acquire()
		await registry.closeAll()
		expect(await ended(shutdown.sessionId)).toBe('ServerShutdown')

		expect(chromeKills()).toEqual([])
		expect(logger.error).not.toHaveBeenCalled()
	}, 60000)
})
