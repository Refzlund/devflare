import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import {
	detectViteProject,
	extractViteReadyUrl,
	stopSpawnedProcessTree,
	waitForViteReady,
	type SpawnedLikeProcess,
	type ViteProjectFileSystem
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

class FakeSpawnedProcess extends EventEmitter implements SpawnedLikeProcess {
	pid?: number
	stdout: PassThrough | null
	stderr: PassThrough | null
	killed = false
	readonly killSignals: string[] = []

	constructor(pid = 1234) {
		super()
		this.pid = pid
		this.stdout = new PassThrough()
		this.stderr = new PassThrough()
	}

	kill(signal?: NodeJS.Signals): boolean {
		this.killed = true
		this.killSignals.push(signal ?? 'SIGTERM')
		return true
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
				queueMicrotask(() => {
					process.killed = true
					process.emit('exit', 0, null)
				})
			}
		})

		await stopPromise

		expect(commands).toEqual([
			{
				command: 'taskkill',
				args: ['/pid', '4242', '/t', '/f']
			}
		])
	})
})
