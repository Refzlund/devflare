import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import {
	detectViteProject,
	extractViteReadyUrl,
	type SpawnedLikeProcess,
	stopSpawnedProcessTree,
	type ViteProjectFileSystem,
	waitForViteReady
} from '../../../src/dev-server/vite-utils'

function createMockFs(files: Record<string, string>): ViteProjectFileSystem {
	return {
		async access(path: string) {
			if (!(path in files)) {
				throw new Error(`ENOENT: ${path}`)
			}
		},
		async readFile(path: string) {
			if (!(path in files)) {
				throw new Error(`ENOENT: ${path}`)
			}
			return files[path]
		}
	}
}

/**
 * @description A child process as Node and Bun model one: `kill()` only SENDS a
 * signal, and sets `killed` the moment it does, while the child keeps running
 * until it exits on its own terms. It exits on a signal only when that signal
 * is in `diesOn`; otherwise the signal is ignored, as by a child that traps it.
 */
class FakeSpawnedProcess extends EventEmitter implements SpawnedLikeProcess {
	pid?: number
	stdout: PassThrough | null
	stderr: PassThrough | null
	/** True once any signal has been sent, exactly like `ChildProcess.killed`. */
	killed = false
	exitCode: number | null = null
	signalCode: NodeJS.Signals | null = null
	readonly killSignals: string[] = []

	/**
	 * @param pid - the pid the stop logic hands to `taskkill`
	 * @param diesOn - the signals this child exits on; any other is ignored
	 */
	constructor(
		pid = 1234,
		private readonly diesOn: ReadonlySet<NodeJS.Signals> = new Set()
	) {
		super()
		this.pid = pid
		this.stdout = new PassThrough()
		this.stderr = new PassThrough()
	}

	kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
		this.killed = true
		this.killSignals.push(signal)
		if (this.diesOn.has(signal)) {
			queueMicrotask(() => this.exit(null, signal))
		}
		return true
	}

	/**
	 * @description Ends the child: records its exit status, then emits `exit`, in
	 * that order, as both runtimes do — so a listener attached afterwards hears
	 * nothing and only the recorded status says it exited.
	 */
	exit(code: number | null, signal: NodeJS.Signals | null): void {
		this.exitCode = code
		this.signalCode = signal
		this.emit('exit', code, signal)
	}

	override on(event: 'exit' | 'error', handler: (...args: any[]) => void): this {
		return super.on(event, handler)
	}
}

describe('detectViteProject', () => {
	test('keeps worker-only packages in worker-only mode even when a sibling package uses Vite', async () => {
		const fs = createMockFs({
			'/repo/projects/worker/package.json': JSON.stringify({
				name: 'worker-only',
				devDependencies: {
					devflare: '^1.0.0'
				}
			}),
			'/repo/projects/extension/package.json': JSON.stringify({
				name: 'frontend',
				devDependencies: {
					vite: '^6.0.0',
					'@cloudflare/vite-plugin': '^1.0.0'
				}
			}),
			'/repo/projects/extension/vite.config.ts': 'export default {}'
		})

		const result = await detectViteProject('/repo/projects/worker', fs)

		expect(result.shouldStartVite).toBe(false)
		expect(result.wantsViteIntegration).toBe(false)
	})

	test('starts Vite only when the current package has a local vite.config file', async () => {
		const fs = createMockFs({
			'/repo/worker/package.json': JSON.stringify({
				name: 'worker',
				devDependencies: {
					vite: '^6.0.0',
					'@cloudflare/vite-plugin': '^1.0.0'
				}
			}),
			'/repo/worker/vite.config.ts': 'export default {}'
		})

		const result = await detectViteProject('/repo/worker', fs)

		expect(result.shouldStartVite).toBe(true)
		expect(result.wantsViteIntegration).toBe(true)
		expect(result.viteConfigPath).toBe('/repo/worker/vite.config.ts')
	})

	test('recognizes cts and cjs vite config filenames in the current package', async () => {
		for (const configName of ['vite.config.cts', 'vite.config.cjs']) {
			const fs = createMockFs({
				'/repo/worker/package.json': JSON.stringify({
					name: 'worker',
					devDependencies: {
						vite: '^6.0.0'
					}
				}),
				[`/repo/worker/${configName}`]: 'export default {}'
			})

			const result = await detectViteProject('/repo/worker', fs)

			expect(result.shouldStartVite).toBe(true)
			expect(result.viteConfigPath).toBe(`/repo/worker/${configName}`)
		}
	})

	test('detects Vite intent without starting Vite when dependencies exist but config is missing', async () => {
		const fs = createMockFs({
			'/repo/worker/package.json': JSON.stringify({
				name: 'worker',
				devDependencies: {
					vite: '^6.0.0',
					'@cloudflare/vite-plugin': '^1.0.0'
				}
			})
		})

		const result = await detectViteProject('/repo/worker', fs)

		expect(result.shouldStartVite).toBe(false)
		expect(result.wantsViteIntegration).toBe(true)
		expect(result.hasLocalViteDependency).toBe(true)
		expect(result.hasLocalCloudflareVitePluginDependency).toBe(true)
	})
})

describe('extractViteReadyUrl', () => {
	test('returns the actual local Vite URL after port retries', () => {
		const output = [
			'Port 5173 is in use, trying another one...',
			'Port 5174 is in use, trying another one...',
			'\u001b[32m  ➜  \u001b[39m\u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:5180/\u001b[39m'
		].join('\n')

		expect(extractViteReadyUrl(output)).toBe('http://localhost:5180/')
	})
})

describe('waitForViteReady', () => {
	test('waits for Vite to report the final bound port', async () => {
		const process = new FakeSpawnedProcess()
		const forwardedStdout: string[] = []

		const readyPromise = waitForViteReady(process, {
			timeoutMs: 100,
			onStdout(chunk) {
				forwardedStdout.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'))
			}
		})

		process.stdout?.write('Port 5173 is in use, trying another one...\n')
		process.stdout?.write('  ➜  Local:   http://localhost:5180/\n')

		expect(await readyPromise).toBe('http://localhost:5180/')
		expect(forwardedStdout.join('')).toContain('http://localhost:5180/')
	})
})

describe('stopSpawnedProcessTree', () => {
	test('uses taskkill to stop the full process tree on Windows', async () => {
		const process = new FakeSpawnedProcess(4242)
		const commands: Array<{ command: string; args: string[] }> = []

		const stopPromise = stopSpawnedProcessTree(process, {
			platform: 'win32',
			timeoutMs: 25,
			runCommand: async (command, args) => {
				commands.push({ command, args })
				// taskkill is a separate process, so it never sets the child's `killed`.
				// The exit lands after stop starts listening, so only the `exit` event
				// can report it; the case below covers the exit that lands before.
				setTimeout(() => process.exit(1, null), 5)
			}
		})

		expect(await stopPromise).toBe(true)

		expect(commands).toEqual([
			{
				command: 'taskkill',
				args: ['/pid', '4242', '/t', '/f']
			}
		])
	})

	test('on Windows, reports a child that never exits after the tree kill', async () => {
		const process = new FakeSpawnedProcess(4242)

		const exited = await stopSpawnedProcessTree(process, {
			platform: 'win32',
			timeoutMs: 25,
			// taskkill "succeeds" but the child neither exits nor records an exit.
			runCommand: async () => {}
		})

		expect(exited).toBe(false)
	})

	test('on Windows, counts an exit that happened before the listener was attached', async () => {
		const process = new FakeSpawnedProcess(4242)

		const exited = await stopSpawnedProcessTree(process, {
			platform: 'win32',
			timeoutMs: 25,
			// The child exits while taskkill runs, so its `exit` event fires before
			// stopSpawnedProcessTree listens for one; only its exit code records it.
			runCommand: async () => process.exit(1, null)
		})

		expect(exited).toBe(true)
	})

	test('outside Windows, stops a child that exits on SIGTERM without escalating', async () => {
		const process = new FakeSpawnedProcess(4242, new Set(['SIGTERM']))

		const exited = await stopSpawnedProcessTree(process, { platform: 'linux', timeoutMs: 25 })

		expect(exited).toBe(true)
		expect(process.killSignals).toEqual(['SIGTERM'])
	})

	test('outside Windows, escalates to SIGKILL when the child survives SIGTERM', async () => {
		const process = new FakeSpawnedProcess(4242, new Set(['SIGKILL']))

		const exited = await stopSpawnedProcessTree(process, { platform: 'linux', timeoutMs: 25 })

		// `killed` is true from the SIGTERM on, so a wait that read it as an exit
		// returned at once and the SIGKILL was never sent.
		expect(process.killSignals).toEqual(['SIGTERM', 'SIGKILL'])
		expect(process.signalCode).toBe('SIGKILL')
		expect(exited).toBe(true)
	})

	test('outside Windows, reports a child that survives SIGTERM and SIGKILL', async () => {
		const process = new FakeSpawnedProcess(4242)

		const exited = await stopSpawnedProcessTree(process, { platform: 'linux', timeoutMs: 25 })

		expect(process.killSignals).toEqual(['SIGTERM', 'SIGKILL'])
		expect(exited).toBe(false)
	})
})
