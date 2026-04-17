import { resolve } from 'pathe'
import { spawn } from 'node:child_process'

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
	readonly killed: boolean
	kill(signal?: NodeJS.Signals): boolean
	on(event: 'exit', handler: (code: number | null, signal: NodeJS.Signals | null) => void): SpawnedLikeProcess
	on(event: 'error', handler: (error: Error) => void): SpawnedLikeProcess
}

export interface WaitForViteReadyOptions {
	timeoutMs?: number
	onStdout?: (chunk: string | Buffer) => void
	onStderr?: (chunk: string | Buffer) => void
}

export interface StopProcessTreeOptions {
	platform?: NodeJS.Platform
	timeoutMs?: number
	runCommand?: (command: string, args: string[]) => Promise<void>
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g
const LOCAL_VITE_URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?/i

async function getNodeFs(): Promise<ViteProjectFileSystem> {
	return await import('node:fs/promises') as unknown as ViteProjectFileSystem
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
	const fileSystem = fs ?? await getNodeFs()
	let viteConfigPath: string | null = null

	for (const configName of VITE_CONFIG_FILES) {
		const absolutePath = resolve(cwd, configName)
		try {
			await fileSystem.access(absolutePath)
			viteConfigPath = absolutePath
			break
		} catch {
			continue
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

export async function waitForViteReady(
	process: SpawnedLikeProcess,
	options: WaitForViteReadyOptions = {}
): Promise<string | null> {
	const {
		timeoutMs = 15000,
		onStdout,
		onStderr
	} = options

	let combinedOutput = ''

	return await new Promise<string | null>((resolvePromise, rejectPromise) => {
		let settled = false
		let timeout: ReturnType<typeof setTimeout>

		const settle = (resolver: () => void) => {
			if (settled) {
				return
			}
			settled = true
			clearTimeout(timeout)
			resolver()
		}

		const inspectChunk = (chunk: string | Buffer) => {
			combinedOutput += typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
			const readyUrl = extractViteReadyUrl(combinedOutput)
			if (readyUrl) {
				settle(() => resolvePromise(readyUrl))
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
			settle(() => rejectPromise(error))
		})

		process.on('exit', (code, signal) => {
			settle(() => {
				const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
				rejectPromise(new Error(`Vite exited before reporting a ready URL (${reason})`))
			})
		})

		timeout = setTimeout(() => {
			settle(() => resolvePromise(null))
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

function waitForProcessExit(
	process: Pick<SpawnedLikeProcess, 'killed' | 'on'>,
	timeoutMs: number
): Promise<boolean> {
	if (process.killed) {
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

export async function stopSpawnedProcessTree(
	process: Pick<SpawnedLikeProcess, 'pid' | 'kill' | 'killed' | 'on'>,
	options: StopProcessTreeOptions = {}
): Promise<void> {
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
				return
			}
		}

		await waitForProcessExit(process, timeoutMs)
		return
	}

	try {
		process.kill('SIGTERM')
	} catch {
		return
	}

	const exited = await waitForProcessExit(process, timeoutMs)
	if (exited) {
		return
	}

	try {
		process.kill('SIGKILL')
	} catch {
		return
	}

	await waitForProcessExit(process, timeoutMs)
}
