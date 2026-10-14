// =============================================================================
// watchViteStartup — the log tells the truth about a Vite child's startup
// =============================================================================
// Reported from a workspace `bun dev`: a SvelteKit app's Vite printed its banner
// at 25.9 s, devflare had already given up at 15 s with a warning that read as a
// fault, and the URL that then arrived was never reported. These cases drive the
// watcher with a fake child and a recording logger, on millisecond timings.
// =============================================================================

import { describe, expect, test } from 'bun:test'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ConsolaInstance } from 'consola'
import { watchViteStartup } from '../../../src/dev-server/vite-process'

/** A child that only prints and exits when the test says so. */
class FakeViteChild extends EventEmitter {
	pid = 4242
	stdout = new PassThrough()
	stderr = new PassThrough()
	killed = false
	exitCode: number | null = null
	signalCode: NodeJS.Signals | null = null

	kill(): boolean {
		return true
	}

	/** Prints Vite's ready banner. */
	banner(url = 'http://127.0.0.1:5173/'): void {
		this.stdout.write(`  VITE v8.3.0  ready in 25950 ms\n  ➜  Local:   ${url}\n`)
	}

	/** Records the exit status, then emits `exit`, as both runtimes do. */
	exit(code: number | null, signal: NodeJS.Signals | null = null): void {
		this.exitCode = code
		this.signalCode = signal
		this.emit('exit', code, signal)
	}
}

/** One logged line. */
interface Logged {
	/** The consola method that was called. */
	level: 'success' | 'info' | 'warn' | 'error' | 'debug'
	/** The message it was called with. */
	message: string
}

/** A logger that records each line instead of printing it. */
function recordingLogger(): { logger: ConsolaInstance; lines: Logged[] } {
	const lines: Logged[] = []
	const at = (level: Logged['level']) => (message: string) => {
		lines.push({ level, message })
	}
	const logger = {
		success: at('success'),
		info: at('info'),
		warn: at('warn'),
		error: at('error'),
		debug: at('debug')
	} as unknown as ConsolaInstance
	return { logger, lines }
}

/** The fake as the type the watcher takes; it reads only what the fake has. */
function asChild(child: FakeViteChild): ChildProcess {
	return child as unknown as ChildProcess
}

const quiet = { onStdout: () => {}, onStderr: () => {} }

describe('watchViteStartup', () => {
	test('a Vite ready within the startup wait is reported once, as before', async () => {
		const child = new FakeViteChild()
		const { logger, lines } = recordingLogger()

		const watching = watchViteStartup(asChild(child), { logger, startupWaitMs: 1000, ...quiet })
		child.banner()
		const handle = await watching

		expect(handle.outcome).toEqual({ status: 'ready', url: 'http://127.0.0.1:5173/' })
		expect(await handle.ready).toEqual({ status: 'ready', url: 'http://127.0.0.1:5173/' })
		expect(lines).toEqual([
			{ level: 'success', message: 'Vite dev server started on http://127.0.0.1:5173/' }
		])
	})

	// Kills: the old warn-level "could not be confirmed" line at the bound, and a
	// watch that stops listening there so the late URL is never reported.
	test('a slow Vite: "still starting" at the bound, then its URL when it arrives', async () => {
		const child = new FakeViteChild()
		const { logger, lines } = recordingLogger()

		const handle = await watchViteStartup(asChild(child), {
			appName: 'uidini-web',
			logger,
			startupWaitMs: 10,
			stallWarningMs: 5000,
			...quiet
		})

		expect(handle.outcome).toBeNull()
		expect(lines).toHaveLength(1)
		expect(lines[0]?.level).toBe('info')
		expect(lines[0]?.message).toContain('Vite for app "uidini-web" is still starting after')

		child.banner()

		expect(await handle.ready).toEqual({ status: 'ready', url: 'http://127.0.0.1:5173/' })
		expect(handle.outcome?.status).toBe('ready')
		expect(lines).toHaveLength(2)
		expect(lines[1]?.level).toBe('success')
		expect(lines[1]?.message).toMatch(
			/^Vite for app "uidini-web" started on http:\/\/127\.0\.0\.1:5173\/ \(after \d+\.\ds\)$/
		)
		expect(lines.some((line) => line.level === 'warn' || line.level === 'error')).toBe(false)
	})

	// Kills: dropping the stall timer, which would leave a Vite that never serves
	// reported only as "still starting".
	test('a Vite that never serves and never exits is reported as possibly stuck', async () => {
		const child = new FakeViteChild()
		const { logger, lines } = recordingLogger()

		const handle = await watchViteStartup(asChild(child), {
			logger,
			startupWaitMs: 10,
			stallWarningMs: 40,
			...quiet
		})
		await Bun.sleep(80)

		expect(handle.outcome).toBeNull()
		expect(lines.map((line) => line.level)).toEqual(['info', 'warn'])
		expect(lines[1]?.message).toContain('Vite dev server has not reported a local URL after')
		expect(lines[1]?.message).toContain('may be stuck')
	})

	// Kills: a watcher that catches the in-bound failure and hands back a handle,
	// which would let `devflare dev` carry on past a Vite that crashed at startup.
	test('a Vite that exits within the startup wait still rejects', async () => {
		const child = new FakeViteChild()
		const { logger, lines } = recordingLogger()

		const watching = watchViteStartup(asChild(child), { logger, startupWaitMs: 1000, ...quiet })
		child.exit(1)

		await expect(watching).rejects.toThrow('Vite exited before reporting a ready URL (exit code 1)')
		expect(lines).toEqual([])
	})

	// Kills: ignoring an exit after the bound, which today leaves the "could not
	// be confirmed" warning as the last word on a Vite that is gone.
	test('a Vite that exits after the startup wait is reported as an error, and not as stuck', async () => {
		const child = new FakeViteChild()
		const { logger, lines } = recordingLogger()

		const handle = await watchViteStartup(asChild(child), {
			logger,
			startupWaitMs: 10,
			stallWarningMs: 40,
			...quiet
		})
		child.exit(1)

		const outcome = await handle.ready
		expect(outcome.status).toBe('failed')
		await Bun.sleep(60)
		expect(lines.map((line) => line.level)).toEqual(['info', 'error'])
		expect(lines[1]?.message).toBe(
			'Vite dev server stopped before it became ready: Vite exited before reporting a ready URL (exit code 1)'
		)
	})

	// Kills: logging the late failure (or the stall) unconditionally, which would
	// report every Ctrl+C during a slow start as a Vite fault.
	test('an exit while the caller is stopping is not reported', async () => {
		const child = new FakeViteChild()
		const { logger, lines } = recordingLogger()
		let stopping = false

		const handle = await watchViteStartup(asChild(child), {
			logger,
			isStopping: () => stopping,
			startupWaitMs: 10,
			stallWarningMs: 40,
			...quiet
		})
		stopping = true
		child.exit(null, 'SIGTERM')

		expect((await handle.ready).status).toBe('failed')
		await Bun.sleep(60)
		expect(lines.map((line) => line.level)).toEqual(['info'])
	})
})
