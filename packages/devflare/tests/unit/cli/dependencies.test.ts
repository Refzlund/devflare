import { afterEach, describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'

interface SpawnCall {
	command: string
	args: string[]
	options: Record<string, unknown>
}

function installChildProcessMock(calls: SpawnCall[]): void {
	const actual = require('node:child_process')
	mock.module('node:child_process', () => ({
		...actual,
		spawn: (command: string, args: string[], options: Record<string, unknown>) => {
			calls.push({ command, args, options })
			const child = new EventEmitter() as EventEmitter & {
				pid: number
				stdout: null
				stderr: null
				killed: boolean
				kill: (signal?: NodeJS.Signals) => boolean
			}
			child.pid = 1234
			child.stdout = null
			child.stderr = null
			child.killed = false
			child.kill = () => true
			return child
		}
	}))
}

afterEach(() => {
	mock.restore()
})

describe('createRealDependencies().exec.spawn', () => {
	test('does not enable shell by default', async () => {
		const calls: SpawnCall[] = []
		installChildProcessMock(calls)

		const { createRealDependencies } = await import('../../../src/cli/dependencies')
		const deps = await createRealDependencies()
		deps.exec.spawn('bun', ['--version'])

		expect(calls).toHaveLength(1)
		expect(calls[0].command).toBe('bun')
		expect(calls[0].args).toEqual(['--version'])
		expect(calls[0].options.shell).toBe(false)
	})

	test('passes shell:true when caller explicitly opts in', async () => {
		const calls: SpawnCall[] = []
		installChildProcessMock(calls)

		const { createRealDependencies } = await import('../../../src/cli/dependencies')
		const deps = await createRealDependencies()
		deps.exec.spawn('echo hi', [], { shell: true })

		expect(calls).toHaveLength(1)
		expect(calls[0].options.shell).toBe(true)
	})
})
