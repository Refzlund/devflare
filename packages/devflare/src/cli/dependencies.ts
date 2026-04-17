// =============================================================================
// CLI Dependencies — Injectable filesystem and process utilities
// =============================================================================

import type { PathLike, MakeDirectoryOptions, Stats } from 'node:fs'
import type { Result, Options as ExecaOptions } from 'execa'

/**
 * Filesystem abstraction for CLI commands
 */
export interface FileSystem {
	readFile(path: PathLike, encoding: BufferEncoding): Promise<string>
	readFile(path: PathLike, options?: { encoding?: BufferEncoding }): Promise<string | Buffer>
	writeFile(path: PathLike, data: string | Buffer, encoding?: BufferEncoding): Promise<void>
	mkdir(path: PathLike, options?: MakeDirectoryOptions): Promise<string | undefined>
	access(path: PathLike, mode?: number): Promise<void>
	stat(path: PathLike): Promise<Stats>
	readdir(path: PathLike, options?: { withFileTypes?: boolean }): Promise<string[] | Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>>
	rm(path: PathLike, options?: { recursive?: boolean; force?: boolean }): Promise<void>
	unlink(path: PathLike): Promise<void>
}

/**
 * Exec result type (compatible with execa Result)
 */
export interface ExecResult {
	exitCode: number
	stdout: string
	stderr: string
	failed: boolean
	killed: boolean
	signal?: string
}

/**
 * Spawned process handle
 */
export interface SpawnedProcess {
	pid?: number
	stdout: NodeJS.ReadableStream | null
	stderr: NodeJS.ReadableStream | null
	/** Whether the process has been killed */
	readonly killed: boolean
	kill(signal?: NodeJS.Signals): boolean
	on(event: 'exit', handler: (code: number | null) => void): SpawnedProcess
	on(event: 'error', handler: (err: Error) => void): SpawnedProcess
}

/**
 * Process execution abstraction for CLI commands
 */
export interface ProcessRunner {
	exec(
		command: string,
		args?: string[],
		options?: ExecaOptions
	): Promise<ExecResult>
	spawn(
		command: string,
		args?: string[],
		options?: { cwd?: string; stdio?: any; env?: NodeJS.ProcessEnv; shell?: boolean }
	): SpawnedProcess
}

/**
 * CLI dependencies container
 */
export interface CliDependencies {
	fs: FileSystem
	exec: ProcessRunner
}

/**
 * Create real dependencies using actual fs and execa
 */
export async function createRealDependencies(): Promise<CliDependencies> {
	const fs = await import('node:fs/promises')
	const { execa, execaCommand } = await import('execa')
	const { spawn } = await import('node:child_process')

	return {
		fs: fs as unknown as FileSystem,
		exec: {
			exec: async (command, args = [], options = {}) => {
				const result = await execa(command, args, options)
				return {
					exitCode: result.exitCode ?? 0,
					stdout: String(result.stdout ?? ''),
					stderr: String(result.stderr ?? ''),
					failed: result.failed,
					killed: false,
					signal: result.signal as string | undefined
				}
			},
			spawn: (command, args = [], options = {}) => {
				// Note: `shell` defaults to false. Callers that legitimately need shell
				// interpretation (rare) must opt in by passing `shell: true` explicitly.
				// Passing shell:true with untrusted input is a command-injection risk.
				const child = spawn(command, args, {
					cwd: options.cwd,
					stdio: options.stdio ?? 'pipe',
					env: options.env,
					shell: options.shell ?? false
				})
				// Create wrapper with getter for killed property
				const wrapper: SpawnedProcess = {
					pid: child.pid,
					stdout: child.stdout,
					stderr: child.stderr,
					get killed() {
						return child.killed
					},
					kill: (signal?: NodeJS.Signals) => child.kill(signal),
					on: (event: string, handler: any) => {
						child.on(event, handler)
						return wrapper
					}
				}
				return wrapper
			}
		}
	}
}

// Global dependencies instance (can be overridden for testing)
let _deps: CliDependencies | null = null

/**
 * Get CLI dependencies (lazy initialization)
 */
export async function getDependencies(): Promise<CliDependencies> {
	if (!_deps) {
		_deps = await createRealDependencies()
	}
	return _deps
}

/**
 * Set CLI dependencies (for testing)
 */
export function setDependencies(deps: CliDependencies): void {
	_deps = deps
}

/**
 * Reset CLI dependencies to real implementations
 */
export async function resetDependencies(): Promise<void> {
	_deps = await createRealDependencies()
}

/**
 * Clear dependencies (force re-initialization)
 */
export function clearDependencies(): void {
	_deps = null
}
