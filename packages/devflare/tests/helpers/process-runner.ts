import * as fs from 'node:fs/promises'
import type { CliDependencies, ExecResult, ProcessRunner } from '../../src/cli/dependencies'

export interface ExecInvocation {
	command: string
	args: string[]
	options?: Record<string, unknown>
}

export function successResult(stdout: string = ''): ExecResult {
	return {
		exitCode: 0,
		stdout,
		stderr: '',
		failed: false,
		killed: false
	}
}

export function createProcessRunner(
	handler: (command: string, args: string[], options?: Record<string, unknown>) => Promise<ExecResult> | ExecResult,
	executions: ExecInvocation[],
	options: {
		spawnErrorMessage?: string
	} = {}
): ProcessRunner {
	const spawnErrorMessage = options.spawnErrorMessage ?? 'spawn() not implemented for this test'

	return {
		async exec(command, args = [], execOptions = {}) {
			const normalizedOptions = execOptions as Record<string, unknown>
			executions.push({
				command,
				args,
				options: normalizedOptions
			})
			return await handler(command, args, normalizedOptions)
		},
		spawn() {
			throw new Error(spawnErrorMessage)
		}
	}
}

export function createCliDependencies(exec: CliDependencies['exec']): CliDependencies {
	return {
		fs: fs as CliDependencies['fs'],
		exec
	}
}
