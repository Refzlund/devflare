import { spawn } from 'node:child_process'
import { resolve } from 'pathe'

export const VITE_CONFIG_FILES = [
	'vite.config.ts',
	'vite.config.js',
	'vite.config.mts',
	'vite.config.mjs',
	'vite.config.cts',
	'vite.config.cjs'
] as const

export interface ViteProjectFileSystem {
	access(path: string): Promise<void>
	readFile(path: string, encoding: BufferEncoding): Promise<string>
}

export interface ViteProjectDetection {
	viteConfigPath: string | null
	hasLocalViteDependency: boolean
	hasLocalCloudflareVitePluginDependency: boolean
	shouldStartVite: boolean
	wantsViteIntegration: boolean
}

export interface SpawnedLikeProcess {
	pid?: number
	stdout: NodeJS.ReadableStream | null
	stderr: NodeJS.ReadableStream | null
	/** True once a signal has been SENT (`ChildProcess.killed`); it says nothing about an exit. */
	readonly killed: boolean
	/** Set once the process has exited with a code (`ChildProcess.exitCode`); null before. */
	readonly exitCode?: number | null
	/** Set once the process has exited on a signal (`ChildProcess.signalCode`); null before. */
	readonly signalCode?: NodeJS.Signals | null
	kill(signal?: NodeJS.Signals): boolean
	on(
		event: 'exit',
		handler: (code: number | null, signal: NodeJS.Signals | null) => void
	): SpawnedLikeProcess
	on(event: 'error', handler: (error: Error) => void): SpawnedLikeProcess
}

/** How a Vite child's startup ended: it reported the local URL it serves, or it failed first. */
export type ViteReadyOutcome =
	| {
			status: 'ready'
			/** The local URL Vite reported, e.g. `http://localhost:5173/`. */
			url: string
	  }
	| {
			status: 'failed'
			/** Why: the child exited (code or signal named) or could not be spawned. */
			error: Error
	  }

/** Options for {@link waitForViteReady}. */
export interface WaitForViteReadyOptions {
	/** How long the returned promise waits before resolving `null` (default 15 s). */
	timeoutMs?: number
	/** Receives every stdout chunk, for the whole life of the child. */
	onStdout?: (chunk: string | Buffer) => void
	/** Receives every stderr chunk, for the whole life of the child. */
	onStderr?: (chunk: string | Buffer) => void
	/**
	 * Called once, with how startup ended, when that happens AFTER the returned
	 * promise already resolved `null` at `timeoutMs`. Never called when the promise
	 * itself settled with the outcome, and never while Vite neither reports a URL
	 * nor exits. Without it, a URL that arrives after the bound is lost.
	 */
	onLateOutcome?: (outcome: ViteReadyOutcome) => void
}

export interface StopProcessTreeOptions {
	platform?: NodeJS.Platform
	timeoutMs?: number
	runCommand?: (command: string, args: string[]) => Promise<void>
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g
const LOCAL_VITE_URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?/i

async function getNodeFs(): Promise<ViteProjectFileSystem> {
	return (await import('node:fs/promises')) as unknown as ViteProjectFileSystem
}

function safeParsePackageJson(content: string): Record<string, unknown> {
	try {
		return JSON.parse(content) as Record<string, unknown>
	} catch {
		return {}
	}
}

function readDependencyFlag(pkg: Record<string, unknown>, name: string): boolean {
	const dependencies = pkg.dependencies as Record<string, unknown> | undefined
	const devDependencies = pkg.devDependencies as Record<string, unknown> | undefined

	return Boolean(dependencies?.[name] ?? devDependencies?.[name])
}

export async function detectViteProject(
	cwd: string,
	fs?: ViteProjectFileSystem
): Promise<ViteProjectDetection> {
	const fileSystem = fs ?? (await getNodeFs())
	let viteConfigPath: string | null = null

	for (const configName of VITE_CONFIG_FILES) {
		const absolutePath = resolve(cwd, configName)
		try {
			await fileSystem.access(absolutePath)
			viteConfigPath = absolutePath
			break
		} catch {
			// Config file not present — try the next candidate.
		}
	}

	let pkg: Record<string, unknown> = {}
	try {
		const packageJson = await fileSystem.readFile(resolve(cwd, 'package.json'), 'utf-8')
		pkg = safeParsePackageJson(packageJson)
	} catch {
		pkg = {}
	}

	const hasLocalViteDependency = readDependencyFlag(pkg, 'vite')
	const hasLocalCloudflareVitePluginDependency = readDependencyFlag(pkg, '@cloudflare/vite-plugin')
	const wantsViteIntegration = Boolean(
		viteConfigPath || hasLocalViteDependency || hasLocalCloudflareVitePluginDependency
	)

	return {
		viteConfigPath,
		hasLocalViteDependency,
		hasLocalCloudflareVitePluginDependency,
		shouldStartVite: Boolean(viteConfigPath),
		wantsViteIntegration
	}
}

export interface ResolvedViteMode {
	/** Whether the dev server should actually start Vite for this cwd. */
	enableVite: boolean
	/** Resolved Vite config path, or null if none was found. */
	viteConfigPath: string | null
	/** The raw detection outcome for callers that want details. */
	detection: ViteProjectDetection
}

/**
 * Resolve the effective Vite mode for a project. Combines the caller's
 * `requested` preference with the filesystem detection so that callers who ask
 * for Vite but lack a local config are downgraded to worker-only mode rather
 * than silently having the detection result ignored.
 */
export async function resolveViteMode(
	cwd: string,
	options: { requested?: boolean; fs?: ViteProjectFileSystem } = {}
): Promise<ResolvedViteMode> {
	const detection = await detectViteProject(cwd, options.fs)
	const requested = options.requested ?? true
	return {
		enableVite: requested && detection.shouldStartVite,
		viteConfigPath: detection.viteConfigPath,
		detection
	}
}

export function stripAnsi(value: string): string {
	return value.replace(ANSI_REGEX, '')
}

export function extractViteReadyUrl(output: string): string | null {
	const cleaned = stripAnsi(output)
	const lines = cleaned
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)

	for (const line of lines) {
		if (!line.toLowerCase().includes('local:')) {
			continue
		}

		const match = line.match(LOCAL_VITE_URL_REGEX)
		if (match) {
			return match[0]
		}
	}

	const fallbackMatch = cleaned.match(LOCAL_VITE_URL_REGEX)
	return fallbackMatch?.[0] ?? null
}

/**
 * @description Waits for a Vite child to report the local URL it serves, for at
 * most `timeoutMs`, and keeps watching past that bound: an outcome that arrives
 * later goes to `onLateOutcome`. The child's output is forwarded for its whole
 * life either way.
 * @param process - the spawned Vite child
 * @param options - the bound, output forwarders and the late-outcome hook
 * @returns the ready URL, or `null` when `timeoutMs` passed first (Vite is
 *   still starting, or stuck — `onLateOutcome` tells which, if either ever happens)
 * @throws {Error} when the child errors or exits before reporting a URL within the bound
 */
export async function waitForViteReady(
	process: SpawnedLikeProcess,
	options: WaitForViteReadyOptions = {}
): Promise<string | null> {
	const { timeoutMs = 15000, onStdout, onStderr, onLateOutcome } = options

	let combinedOutput = ''

	return await new Promise<string | null>((resolvePromise, rejectPromise) => {
		// `waiting` until the URL, a failure or the bound; `late` after the bound
		// resolved null; `decided` once the outcome is known to someone.
		let phase: 'waiting' | 'late' | 'decided' = 'waiting'
		let timeout: ReturnType<typeof setTimeout>

		const decide = (outcome: ViteReadyOutcome) => {
			if (phase === 'decided') {
				return
			}
			const wasLate = phase === 'late'
			phase = 'decided'
			clearTimeout(timeout)
			if (wasLate) {
				onLateOutcome?.(outcome)
			} else if (outcome.status === 'ready') {
				resolvePromise(outcome.url)
			} else {
				rejectPromise(outcome.error)
			}
		}

		// Decoded through `TextDecoder`, as `Buffer#toString('utf-8')` did. Workers-types 5.x declares
		// its own global `Buffer`, beside which the checker types `Buffer#toString` as `() => string`.
		const utf8 = new TextDecoder()
		const inspectChunk = (chunk: string | Uint8Array) => {
			// Once decided, stop buffering: the output keeps flowing for the life of the
			// dev server, and re-scanning all of it on every chunk would only grow.
			if (phase === 'decided') {
				return
			}
			combinedOutput += typeof chunk === 'string' ? chunk : utf8.decode(chunk)
			const readyUrl = extractViteReadyUrl(combinedOutput)
			if (readyUrl) {
				decide({ status: 'ready', url: readyUrl })
			}
		}

		process.stdout?.on('data', (chunk: string | Buffer) => {
			onStdout?.(chunk)
			inspectChunk(chunk)
		})

		process.stderr?.on('data', (chunk: string | Buffer) => {
			onStderr?.(chunk)
			inspectChunk(chunk)
		})

		process.on('error', (error) => {
			decide({ status: 'failed', error })
		})

		process.on('exit', (code, signal) => {
			const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
			decide({
				status: 'failed',
				error: new Error(`Vite exited before reporting a ready URL (${reason})`)
			})
		})

		timeout = setTimeout(() => {
			if (phase === 'waiting') {
				phase = 'late'
				resolvePromise(null)
			}
		}, timeoutMs)
	})
}

async function defaultRunCommand(command: string, args: string[]): Promise<void> {
	await new Promise<void>((resolvePromise, rejectPromise) => {
		const child = spawn(command, args, {
			stdio: 'ignore',
			windowsHide: true
		})

		child.on('error', rejectPromise)
		child.on('exit', () => resolvePromise())
	})
}

/** A process whose exit is already recorded, whether or not anyone heard the event. */
type ExitRecordingProcess = Pick<SpawnedLikeProcess, 'exitCode' | 'signalCode'>

/**
 * @description Whether the process has already exited, read from its recorded
 * exit status rather than from an `exit` event a late listener can miss.
 * @param process - the spawned child
 * @returns true once it has an exit code or an exit signal
 */
function hasExited(process: ExitRecordingProcess): boolean {
	return (process.exitCode ?? null) !== null || (process.signalCode ?? null) !== null
}

/**
 * @description Waits for the child to actually exit.
 * → GOTCHA: never read `killed` here. Node and Bun set it the moment `kill()`
 *   SENDS a signal, so a child that ignores SIGTERM reads as already gone.
 * → The recorded status is checked first because `exit` fires once: a child that
 *   exited before this call (on Windows, during `taskkill`; on macOS and Linux, to
 *   the `SIGINT` a Ctrl+C sends its whole process group) never emits it again.
 *   Both runtimes record the status before emitting, so checking and then
 *   listening in the same tick leaves no gap.
 * @param process - the spawned child
 * @param timeoutMs - how long to wait for an exit not yet recorded
 * @returns true once the child has exited; false if it is still running after `timeoutMs`
 */
function waitForProcessExit(
	process: ExitRecordingProcess & Pick<SpawnedLikeProcess, 'on'>,
	timeoutMs: number
): Promise<boolean> {
	if (hasExited(process)) {
		return Promise.resolve(true)
	}

	return new Promise<boolean>((resolvePromise) => {
		let settled = false
		let timeout: ReturnType<typeof setTimeout>

		const settle = (value: boolean) => {
			if (settled) {
				return
			}
			settled = true
			clearTimeout(timeout)
			resolvePromise(value)
		}

		process.on('exit', () => settle(true))

		timeout = setTimeout(() => {
			settle(false)
		}, timeoutMs)
	})
}

/**
 * @description Stops a spawned child. On Windows it ends the whole tree with
 * `taskkill /t /f`, since the child is often a shim (`bunx`) whose own exit
 * leaves its grandchildren running. Elsewhere it signals the child alone:
 * `SIGTERM`, then `SIGKILL` if the child is still running `timeoutMs` later.
 * @param process - the spawned child
 * @param options - platform, wait budget and command runner, for tests
 * @returns true once the child has exited; false when it is still running after
 *   the last step's `timeoutMs` — the kill failed or missed it, and it may still
 *   hold its port.
 *   → GOTCHA: outside Windows, true is about the child alone. A `bunx` shim
 *   forwards `SIGTERM` to the program it runs, but `SIGKILL` ends only the shim,
 *   so a program that ignored the `SIGTERM` outlives a stop that returned true.
 *   Signalling the process group would reach it.
 */
export async function stopSpawnedProcessTree(
	process: Pick<SpawnedLikeProcess, 'pid' | 'kill' | 'on' | 'exitCode' | 'signalCode'>,
	options: StopProcessTreeOptions = {}
): Promise<boolean> {
	const {
		platform = globalThis.process?.platform ?? 'linux',
		timeoutMs = 3000,
		runCommand = defaultRunCommand
	} = options

	if (platform === 'win32' && process.pid) {
		try {
			await runCommand('taskkill', ['/pid', String(process.pid), '/t', '/f'])
		} catch {
			try {
				process.kill('SIGTERM')
			} catch {
				return hasExited(process)
			}
		}

		// The child can exit while taskkill is still running, before anything listens
		// for its `exit`; waitForProcessExit reads that from its recorded status.
		return await waitForProcessExit(process, timeoutMs)
	}

	try {
		process.kill('SIGTERM')
	} catch {
		return hasExited(process)
	}

	const exited = await waitForProcessExit(process, timeoutMs)
	if (exited) {
		return true
	}

	try {
		process.kill('SIGKILL')
	} catch {
		return hasExited(process)
	}

	return await waitForProcessExit(process, timeoutMs)
}
