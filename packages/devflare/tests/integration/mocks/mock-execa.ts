// =============================================================================
// Mock Execa — Deep mock for subprocess simulation
// =============================================================================

import type { Options, Result } from 'execa'

/**
 * Command execution record for assertions
 */
export interface CommandExecution {
	command: string
	args: string[]
	options: Options
	result: MockExecResult
}

/**
 * Mock execution result
 */
export interface MockExecResult {
	exitCode: number
	stdout: string
	stderr: string
	failed: boolean
	killed: boolean
	signal?: string
}

/**
 * Command matcher - can be string, regex, or function
 */
export type CommandMatcher = string | RegExp | ((command: string, args: string[]) => boolean)

/**
 * Mock command handler
 */
export interface MockCommandHandler {
	matcher: CommandMatcher
	handler: (
		command: string,
		args: string[],
		options: Options
	) => MockExecResult | Promise<MockExecResult>
}

/**
 * Mock Execa implementation for testing CLI commands
 * that spawn subprocesses
 */
export class MockExeca {
	private handlers: MockCommandHandler[] = []
	public executions: CommandExecution[] = []

	private getBunxExecutableArgs(args: string[]): string[] {
		const firstExecutableIndex = args.findIndex((arg) => !arg.startsWith('-'))

		return firstExecutableIndex >= 0 ? args.slice(firstExecutableIndex) : args
	}

	/**
	 * Default result for unmatched commands
	 */
	private defaultResult: MockExecResult = {
		exitCode: 0,
		stdout: '',
		stderr: '',
		failed: false,
		killed: false
	}

	/**
	 * Register a command handler
	 */
	on(matcher: CommandMatcher, handler: MockCommandHandler['handler']): this {
		this.handlers.push({ matcher, handler })
		return this
	}

	/**
	 * Register a simple success response for a command
	 */
	onCommand(matcher: CommandMatcher, result: Partial<MockExecResult> = {}): this {
		return this.on(matcher, () => ({
			...this.defaultResult,
			...result
		}))
	}

	/**
	 * Register a failure response for a command
	 */
	onCommandFail(matcher: CommandMatcher, stderr = 'Command failed'): this {
		return this.on(matcher, () => ({
			exitCode: 1,
			stdout: '',
			stderr,
			failed: true,
			killed: false
		}))
	}

	/**
	 * Match a command against handlers
	 */
	private findHandler(command: string, args: string[]): MockCommandHandler | undefined {
		const fullCommand = `${command} ${args.join(' ')}`.trim()
		// For bunx commands, the actual tool is in args
		const executableArgs = command === 'bunx' ? this.getBunxExecutableArgs(args) : args
		const effectiveCommand =
			command === 'bunx' && executableArgs.length > 0 ? executableArgs.join(' ') : fullCommand

		return this.handlers.find((h) => {
			if (typeof h.matcher === 'string') {
				// Match: "vite build" against bunx-wrapped invocations by checking
				// effectiveCommand, while still allowing direct local CLI paths like
				// ".../node_modules/vite/bin/vite.js build" via fullCommand matching.
				// Or match exact full command
				return (
					effectiveCommand.startsWith(h.matcher) ||
					fullCommand.startsWith(h.matcher) ||
					effectiveCommand === h.matcher ||
					fullCommand === h.matcher ||
					command === h.matcher ||
					(command === 'bunx' && executableArgs[0] === h.matcher)
				)
			}
			if (h.matcher instanceof RegExp) {
				return h.matcher.test(fullCommand) || h.matcher.test(effectiveCommand)
			}
			return h.matcher(command, args)
		})
	}

	/**
	 * Execute a mock command
	 */
	async execa(
		command: string,
		args: string[] = [],
		options: Options = {}
	): Promise<Result<Options>> {
		const handler = this.findHandler(command, args)

		let result: MockExecResult

		if (handler) {
			result = await handler.handler(command, args, options)
		} else {
			// Return default success for unhandled commands
			result = { ...this.defaultResult }
		}

		// Record the execution
		this.executions.push({
			command,
			args,
			options,
			result
		})

		// Build execa-like response
		const response = {
			command: `${command} ${args.join(' ')}`,
			escapedCommand: `${command} ${args.map((a) => `"${a}"`).join(' ')}`,
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			all: result.stdout + result.stderr,
			failed: result.failed,
			timedOut: false,
			isCanceled: false,
			killed: result.killed,
			signal: result.signal,
			signalDescription: result.signal ? `Signal: ${result.signal}` : undefined,
			cwd: (options.cwd as string) || process.cwd(),
			durationMs: 0
		} as unknown as Result<Options>

		// For testing, we return the result even on failure
		// (unlike real execa which throws)
		// This allows tests to inspect the result without try/catch
		return response
	}

	/**
	 * Get executions of a specific command
	 */
	getExecutions(command?: string): CommandExecution[] {
		if (!command) return this.executions
		return this.executions.filter((e) => e.command === command || e.command.includes(command))
	}

	/**
	 * Check if a command was executed
	 */
	wasExecuted(matcher: CommandMatcher): boolean {
		return this.executions.some((e) => {
			const fullCommand = `${e.command} ${e.args.join(' ')}`.trim()
			if (typeof matcher === 'string') {
				return fullCommand.includes(matcher)
			}
			if (matcher instanceof RegExp) {
				return matcher.test(fullCommand)
			}
			return matcher(e.command, e.args)
		})
	}

	/**
	 * Get count of executions matching a pattern
	 */
	executionCount(matcher: CommandMatcher): number {
		return this.executions.filter((e) => {
			const fullCommand = `${e.command} ${e.args.join(' ')}`.trim()
			if (typeof matcher === 'string') {
				return fullCommand.includes(matcher)
			}
			if (matcher instanceof RegExp) {
				return matcher.test(fullCommand)
			}
			return matcher(e.command, e.args)
		}).length
	}

	/**
	 * Clear all executions
	 */
	clearExecutions(): void {
		this.executions = []
	}

	/**
	 * Clear handlers and executions
	 */
	reset(): void {
		this.handlers = []
		this.executions = []
	}

	/**
	 * Create the mock module that can replace 'execa'
	 */
	createMock() {
		return {
			execa: this.execa.bind(this),
			execaSync: () => {
				throw new Error('execaSync is not supported in mock')
			},
			$: this.execa.bind(this)
		}
	}
}

/**
 * Pre-configured mock execa for common devflare commands
 */
export function createMockExeca(): MockExeca {
	const mock = new MockExeca()

	// Default handlers for common commands
	mock.onCommand('vite', {
		exitCode: 0,
		stdout: 'vite dev server running at http://localhost:5173'
	})

	mock.onCommand('vite build', {
		exitCode: 0,
		stdout: 'Build successful'
	})

	mock.onCommand('wrangler', {
		exitCode: 0,
		stdout: 'wrangler v3.0.0'
	})

	mock.onCommand('wrangler deploy', {
		exitCode: 0,
		stdout: 'Deployed successfully to https://example.workers.dev'
	})

	return mock
}

/**
 * Create mock execa without default handlers
 */
export function createEmptyMockExeca(): MockExeca {
	return new MockExeca()
}

/**
 * Create a complete ProcessRunner mock from a MockExeca instance
 * This satisfies the ProcessRunner interface including spawn
 */
export function createMockProcessRunner(
	mockExeca: MockExeca
): import('../../../src/cli/dependencies').ProcessRunner {
	return {
		exec: async (command: string, args?: string[], options?: import('execa').Options) => {
			const result = (await mockExeca.execa(command, args ?? [], options ?? {})) as unknown as {
				exitCode: number
				stdout: string
				stderr: string
				failed: boolean
				killed: boolean
				signal?: string
			}
			return {
				exitCode: result.exitCode ?? 0,
				stdout: String(result.stdout ?? ''),
				stderr: String(result.stderr ?? ''),
				failed: result.failed ?? false,
				killed: result.killed ?? false,
				signal: result.signal as string | undefined
			}
		},
		spawn: (
			_command: string,
			_args?: string[],
			_options?: { cwd?: string; stdio?: unknown; env?: NodeJS.ProcessEnv }
		) => {
			// Return a mock spawned process that does nothing
			const events: Record<string, Array<(arg: unknown) => void>> = {}
			return {
				pid: 12345,
				stdout: null,
				stderr: null,
				killed: false,
				kill: () => true,
				on(event: string, handler: (arg: unknown) => void) {
					if (!events[event]) events[event] = []
					events[event].push(handler)
					return this
				}
			} as import('../../../src/cli/dependencies').SpawnedProcess
		}
	}
}
