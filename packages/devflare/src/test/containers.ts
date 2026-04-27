import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { execa } from 'execa'
import { type ContainerConfig, type DevflareConfig, loadConfig } from '../config'
import { applyLocalDevVarsToConfig } from '../config/local-dev-vars'
import { findNearestConfig, getAvailablePort, getCallerDirectory } from './simple-context-paths'

export type ContainerEngineName = 'docker' | 'podman'
export type ContainerEnginePreference = ContainerEngineName | 'auto'

export interface ContainerCommandResult {
	exitCode: number
	stdout: string
	stderr: string
}

export interface ContainerCommandRunner {
	exec(
		command: string,
		args: string[],
		options?: {
			cwd?: string
			env?: Record<string, string | undefined>
			timeoutMs?: number
		}
	): Promise<ContainerCommandResult>
}

export interface ContainerEngineCheck {
	engine: ContainerEngineName
	available: boolean
	reason?: string
}

export type ContainerEngineStatus =
	| {
			available: true
			engine: ContainerEngineName
			checked: ContainerEngineCheck[]
	  }
	| {
			available: false
			reason: string
			checked: ContainerEngineCheck[]
	  }

export interface DetectContainerEngineOptions {
	engine?: ContainerEnginePreference
	runner?: ContainerCommandRunner
}

export interface ContainerSkipReasonOptions extends DetectContainerEngineOptions {
	env?: Record<string, string | undefined>
}

export interface ContainerManagerOptions extends DetectContainerEngineOptions {
	cwd?: string
	env?: Record<string, string | undefined>
	allocatePort?: () => Promise<number>
	waitForPort?: (host: string, port: number, timeoutMs: number) => Promise<void>
	fetch?: typeof fetch
}

export interface StartContainerOptions {
	image?: string
	configPath?: string
	port: number
	hostPort?: number
	host?: string
	instance?: string
	envVars?: Record<string, string>
	entrypoint?: string[]
	command?: string[]
	offline?: boolean
	waitForReady?: boolean
	readyTimeoutMs?: number
}

export interface LocalContainerState {
	status: string
	running: boolean
	exitCode?: number
}

interface ResolvedContainerStart {
	configDir: string
	image: string
	config?: ContainerConfig
}

interface PreparedImage {
	image: string
}

export interface DevflareContainerInstance {
	readonly name: string
	readonly id: string
	readonly className: string
	readonly engine: ContainerEngineName
	readonly host: string
	readonly hostPort: number
	readonly port: number
	fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>
	logs(): Promise<string>
	getState(): Promise<LocalContainerState>
	stop(): Promise<void>
	destroy(): Promise<void>
}

export interface ContainerManager {
	detectEngine(options?: DetectContainerEngineOptions): Promise<ContainerEngineStatus>
	start(className: string, options: StartContainerOptions): Promise<DevflareContainerInstance>
	stopAll(): Promise<void>
}

export const realContainerCommandRunner: ContainerCommandRunner = {
	async exec(command, args, options = {}) {
		try {
			const result = await execa(command, args, {
				cwd: options.cwd,
				env: options.env,
				reject: false,
				timeout: options.timeoutMs ?? 15_000
			})

			return {
				exitCode: result.exitCode ?? 0,
				stdout: String(result.stdout ?? ''),
				stderr: String(result.stderr ?? '')
			}
		} catch (error) {
			const err = error as {
				exitCode?: number
				stdout?: unknown
				stderr?: unknown
				message?: string
			}
			return {
				exitCode: err.exitCode ?? 1,
				stdout: String(err.stdout ?? ''),
				stderr: String(err.stderr ?? err.message ?? 'Container command failed')
			}
		}
	}
}

export async function detectContainerEngine(
	options: DetectContainerEngineOptions = {}
): Promise<ContainerEngineStatus> {
	const runner = options.runner ?? realContainerCommandRunner
	const candidates: ContainerEngineName[] =
		options.engine && options.engine !== 'auto' ? [options.engine] : ['docker', 'podman']
	const checked: ContainerEngineCheck[] = []

	for (const engine of candidates) {
		let result: ContainerCommandResult
		try {
			result = await runner.exec(engine, ['info'], { timeoutMs: 10_000 })
		} catch (error) {
			result = {
				exitCode: 1,
				stdout: '',
				stderr: error instanceof Error ? error.message : String(error)
			}
		}

		if (result.exitCode === 0) {
			checked.push({ engine, available: true })
			return { available: true, engine, checked }
		}

		checked.push({
			engine,
			available: false,
			reason: formatCommandFailure(result)
		})
	}

	return {
		available: false,
		reason: checked
			.map((check) => `${check.engine}: ${check.reason ?? 'not available'}`)
			.join('; '),
		checked
	}
}

export async function getContainerSkipReason(
	options: ContainerSkipReasonOptions = {}
): Promise<string | null> {
	const env = options.env ?? process.env
	if (!isTruthyEnvFlag(env.DEVFLARE_CONTAINER_TESTS)) {
		return 'Container tests require DEVFLARE_CONTAINER_TESTS=1 because they launch local Docker/Podman containers.'
	}

	const status = await detectContainerEngine(options)
	if (!status.available) {
		return `No reachable Docker or Podman engine found: ${status.reason}`
	}

	return null
}

export function createContainerManager(options: ContainerManagerOptions = {}): ContainerManager {
	const active = new Set<LocalDevflareContainer>()

	const getRunner = () => options.runner ?? realContainerCommandRunner

	const manager: ContainerManager = {
		detectEngine(engineOptions = {}) {
			return detectContainerEngine({
				engine: engineOptions.engine ?? options.engine,
				runner: engineOptions.runner ?? getRunner()
			})
		},

		async start(className, startOptions) {
			const cwd = options.cwd ?? getCallerDirectory()
			const resolved = await resolveContainerStart(className, startOptions, cwd)
			const status = await manager.detectEngine()
			const engine = getAvailableContainerEngine(status, className)
			const runner = getRunner()
			const offline = startOptions.offline ?? true
			const prepared = await prepareImage({
				engine,
				runner,
				image: resolved.image,
				className,
				configDir: resolved.configDir,
				imageBuildContext: resolved.config?.imageBuildContext,
				offline
			})
			const host = startOptions.host ?? '127.0.0.1'
			const hostPort = startOptions.hostPort ?? (await (options.allocatePort ?? getAvailablePort)())
			const containerName = makeContainerName(className, startOptions.instance)
			const runArgs = buildRunArgs({
				name: containerName,
				className,
				image: prepared.image,
				host,
				hostPort,
				containerPort: startOptions.port,
				envVars: startOptions.envVars,
				entrypoint: startOptions.entrypoint,
				command: startOptions.command
			})
			const runResult = await runner.exec(engine, runArgs, {
				cwd: resolved.configDir,
				env: options.env ?? process.env
			})

			if (runResult.exitCode !== 0) {
				throw new Error(
					`Failed to start Devflare container "${className}": ${formatCommandFailure(runResult)}`
				)
			}

			const instance = new LocalDevflareContainer({
				id: runResult.stdout.trim() || containerName,
				name: containerName,
				className,
				engine,
				host,
				hostPort,
				port: startOptions.port,
				runner,
				fetchImpl: options.fetch ?? fetch,
				onDispose: (container) => active.delete(container)
			})
			active.add(instance)

			await waitForContainerReadiness(instance, startOptions, options.waitForPort ?? waitForTcpPort)

			return instance
		},

		async stopAll() {
			await Promise.all([...active].map((container) => container.stop()))
		}
	}

	return manager
}

const defaultContainerManager = createContainerManager()

export const containers = defaultContainerManager

export async function stopActiveContainers(): Promise<void> {
	await defaultContainerManager.stopAll()
}

function getAvailableContainerEngine(
	status: ContainerEngineStatus,
	className: string
): ContainerEngineName {
	if (!status.available) {
		throw new Error(`Cannot start Devflare container "${className}": ${status.reason}`)
	}
	return status.engine
}

async function waitForContainerReadiness(
	instance: LocalDevflareContainer,
	options: StartContainerOptions,
	waitForPort: (host: string, port: number, timeoutMs: number) => Promise<void>
): Promise<void> {
	if (!(options.waitForReady ?? true)) {
		return
	}

	try {
		await waitForPort(instance.host, instance.hostPort, options.readyTimeoutMs ?? 20_000)
	} catch (error) {
		await instance.destroy()
		throw error
	}
}

async function resolveContainerStart(
	className: string,
	options: StartContainerOptions,
	cwd: string
): Promise<ResolvedContainerStart> {
	if (options.image) {
		return {
			configDir: cwd,
			image: options.image
		}
	}

	const { config, configDir } = await loadContainerConfig(options.configPath, cwd)
	const container = config.containers?.find(
		(candidate) => candidate.className === className || candidate.name === className
	)

	if (!container) {
		throw new Error(`Container "${className}" was not found in devflare config.`)
	}

	return {
		configDir,
		image: container.image,
		config: container
	}
}

async function loadContainerConfig(
	configPath: string | undefined,
	cwd: string
): Promise<{ config: DevflareConfig; configDir: string }> {
	const absolutePath = configPath ? resolve(cwd, configPath) : await findNearestConfig(cwd)

	if (!absolutePath) {
		throw new Error(
			`Could not find a devflare config file for container lookup. Searched upward from: ${cwd}`
		)
	}

	const configDir = dirname(absolutePath)
	const loadedConfig = await loadConfig({
		cwd: configDir,
		configFile: basename(absolutePath)
	})
	const config = await applyLocalDevVarsToConfig(loadedConfig, {
		cwd: configDir,
		configPath: absolutePath
	})

	return { config, configDir }
}

async function prepareImage(options: {
	engine: ContainerEngineName
	runner: ContainerCommandRunner
	image: string
	className: string
	configDir: string
	imageBuildContext?: string
	offline: boolean
}): Promise<PreparedImage> {
	if (looksLikeLocalPath(options.image)) {
		return {
			image: await buildLocalImage(options)
		}
	}

	const inspect = await options.runner.exec(options.engine, ['image', 'inspect', options.image], {
		cwd: options.configDir
	})
	if (inspect.exitCode === 0) {
		return { image: options.image }
	}

	if (options.offline) {
		throw new Error(
			`Container image "${options.image}" is not present locally. Devflare container tests are offline-first; pull/build the image ahead of time or pass offline: false.`
		)
	}

	const pull = await options.runner.exec(options.engine, ['pull', options.image], {
		cwd: options.configDir
	})
	if (pull.exitCode !== 0) {
		throw new Error(
			`Failed to pull container image "${options.image}": ${formatCommandFailure(pull)}`
		)
	}

	return { image: options.image }
}

async function buildLocalImage(options: {
	engine: ContainerEngineName
	runner: ContainerCommandRunner
	image: string
	className: string
	configDir: string
	imageBuildContext?: string
	offline: boolean
}): Promise<string> {
	const imagePath = resolve(options.configDir, options.image)
	const imageStat = await stat(imagePath)
	const dockerfile = imageStat.isDirectory() ? join(imagePath, 'Dockerfile') : imagePath
	const context = resolve(
		options.configDir,
		options.imageBuildContext ?? (imageStat.isDirectory() ? options.image : dirname(options.image))
	)

	if (!existsSync(dockerfile)) {
		throw new Error(`Container Dockerfile does not exist: ${dockerfile}`)
	}

	const tag = makeLocalImageTag(options.className, options.configDir, options.image)
	const args = [
		'build',
		...(options.offline ? [getOfflineBuildPullArg(options.engine)] : []),
		'-t',
		tag,
		'-f',
		dockerfile,
		context
	]
	const result = await options.runner.exec(options.engine, args, {
		cwd: options.configDir
	})

	if (result.exitCode !== 0) {
		throw new Error(
			`Failed to build local container image "${options.image}": ${formatCommandFailure(result)}`
		)
	}

	return tag
}

function buildRunArgs(options: {
	name: string
	className: string
	image: string
	host: string
	hostPort: number
	containerPort: number
	envVars?: Record<string, string>
	entrypoint?: string[]
	command?: string[]
}): string[] {
	const args = [
		'run',
		'-d',
		'--name',
		options.name,
		'--label',
		'devflare.managed=true',
		'--label',
		`devflare.container.class=${options.className}`,
		'-p',
		`${options.host}:${options.hostPort}:${options.containerPort}`
	]

	for (const [key, value] of Object.entries(options.envVars ?? {})) {
		args.push('-e', `${key}=${value}`)
	}

	const command = [...(options.command ?? [])]
	if (options.entrypoint && options.entrypoint.length > 0) {
		args.push('--entrypoint', options.entrypoint[0])
		command.unshift(...options.entrypoint.slice(1))
	}

	args.push(options.image, ...command)
	return args
}

class LocalDevflareContainer implements DevflareContainerInstance {
	readonly id: string
	readonly name: string
	readonly className: string
	readonly engine: ContainerEngineName
	readonly host: string
	readonly hostPort: number
	readonly port: number
	private readonly runner: ContainerCommandRunner
	private readonly fetchImpl: typeof fetch
	private readonly onDispose: (container: LocalDevflareContainer) => void
	private disposed = false

	constructor(options: {
		id: string
		name: string
		className: string
		engine: ContainerEngineName
		host: string
		hostPort: number
		port: number
		runner: ContainerCommandRunner
		fetchImpl: typeof fetch
		onDispose: (container: LocalDevflareContainer) => void
	}) {
		this.id = options.id
		this.name = options.name
		this.className = options.className
		this.engine = options.engine
		this.host = options.host
		this.hostPort = options.hostPort
		this.port = options.port
		this.runner = options.runner
		this.fetchImpl = options.fetchImpl
		this.onDispose = options.onDispose
	}

	fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
		return fetchWithStartupRetries(this.fetchImpl, this.toLocalRequest(input, init))
	}

	async logs(): Promise<string> {
		const result = await this.runner.exec(this.engine, ['logs', this.name])
		if (result.exitCode !== 0) {
			throw new Error(
				`Failed to read logs for Devflare container "${this.name}": ${formatCommandFailure(result)}`
			)
		}

		return result.stdout
	}

	async getState(): Promise<LocalContainerState> {
		const result = await this.runner.exec(this.engine, [
			'inspect',
			'--format',
			'{{json .State}}',
			this.name
		])
		if (result.exitCode !== 0) {
			throw new Error(
				`Failed to inspect Devflare container "${this.name}": ${formatCommandFailure(result)}`
			)
		}

		const parsed = JSON.parse(result.stdout || '{}') as {
			Status?: string
			Running?: boolean
			ExitCode?: number
		}

		return {
			status: parsed.Status ?? (parsed.Running ? 'running' : 'stopped'),
			running: Boolean(parsed.Running),
			...(typeof parsed.ExitCode === 'number' && { exitCode: parsed.ExitCode })
		}
	}

	async stop(): Promise<void> {
		if (this.disposed) return
		try {
			await this.runner.exec(this.engine, ['stop', this.name])
		} finally {
			await this.runner.exec(this.engine, ['rm', '-f', this.name])
			this.disposed = true
			this.onDispose(this)
		}
	}

	async destroy(): Promise<void> {
		if (this.disposed) return
		await this.runner.exec(this.engine, ['rm', '-f', this.name])
		this.disposed = true
		this.onDispose(this)
	}

	private toLocalRequest(input: string | URL | Request, init?: RequestInit): Request {
		const base = `http://${this.host}:${this.hostPort}/`
		if (input instanceof Request) {
			const source = init ? new Request(input, init) : input
			const sourceUrl = new URL(source.url)
			const localUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, base)
			return new Request(localUrl, {
				method: source.method,
				headers: source.headers,
				body: source.body,
				redirect: source.redirect,
				signal: source.signal
			})
		}

		const sourceUrl = new URL(String(input), base)
		const localUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, base)
		return new Request(localUrl, init)
	}
}

async function fetchWithStartupRetries(
	fetchImpl: typeof fetch,
	request: Request
): Promise<Response> {
	if (!canRetryRequest(request)) {
		return fetchImpl(request)
	}

	const deadline = Date.now() + 5_000
	let lastError: unknown

	while (Date.now() < deadline) {
		try {
			return await fetchImpl(request.clone())
		} catch (error) {
			if (!isTransientContainerFetchError(error)) {
				throw error
			}
			lastError = error
			await delay(100)
		}
	}

	throw lastError
}

function canRetryRequest(request: Request): boolean {
	return (request.method === 'GET' || request.method === 'HEAD') && request.body === null
}

function isTransientContainerFetchError(error: unknown): boolean {
	const value = error as {
		code?: unknown
		errno?: unknown
		cause?: { code?: unknown }
		message?: string
	}
	const code = value.code ?? value.cause?.code
	if (
		code === 'ECONNRESET' ||
		code === 'ECONNREFUSED' ||
		code === 'EPIPE' ||
		code === 'UND_ERR_SOCKET'
	) {
		return true
	}

	return typeof value.message === 'string' && (
		value.message.includes('socket connection was closed') ||
		value.message.includes('fetch failed')
	)
}

async function waitForTcpPort(host: string, port: number, timeoutMs: number): Promise<void> {
	const start = Date.now()
	let lastError: unknown

	while (Date.now() - start < timeoutMs) {
		try {
			await connectOnce(host, port)
			return
		} catch (error) {
			lastError = error
			await delay(100)
		}
	}

	const message = lastError instanceof Error ? lastError.message : 'timed out'
	throw new Error(`Timed out waiting for container port ${host}:${port}: ${message}`)
}

function connectOnce(host: string, port: number): Promise<void> {
	return new Promise((resolveConnection, rejectConnection) => {
		const socket = createConnection({ host, port })
		socket.once('connect', () => {
			socket.destroy()
			resolveConnection()
		})
		socket.once('error', rejectConnection)
	})
}

function looksLikeLocalPath(image: string): boolean {
	return (
		image === 'Dockerfile' ||
		image.startsWith('.') ||
		image.startsWith('/') ||
		image.startsWith('\\') ||
		isAbsolute(image) ||
		image.endsWith('/Dockerfile') ||
		image.endsWith('\\Dockerfile')
	)
}

function getOfflineBuildPullArg(engine: ContainerEngineName): string {
	return engine === 'podman' ? '--pull=never' : '--pull=false'
}

function makeLocalImageTag(className: string, configDir: string, image: string): string {
	const hash = createHash('sha256').update(`${configDir}:${image}`).digest('hex').slice(0, 12)
	return `devflare-local-${sanitizeName(className)}:${hash}`
}

function makeContainerName(className: string, instance: string | undefined): string {
	return `devflare-${sanitizeName(className)}-${sanitizeName(instance ?? 'default')}-${randomUUID().slice(0, 8)}`
}

function sanitizeName(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9_.-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'container'
	)
}

function formatCommandFailure(result: ContainerCommandResult): string {
	return (result.stderr || result.stdout || `exit code ${result.exitCode}`).trim()
}

function isTruthyEnvFlag(value: string | undefined): boolean {
	return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes'
}
