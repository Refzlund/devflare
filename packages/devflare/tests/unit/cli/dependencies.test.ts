import { afterEach, describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'

interface SpawnCall {
	command: string
	args: string[]
	options: Record<string, unknown>
}

/** The real module's exports, taken before any test here replaces them. */
const realChildProcess = { ...require('node:child_process') }

/**
 * @description The exports `mock.module` installs for `node:child_process`.
 * → GOTCHA: a loaded module's exports are overwritten in place, and `default` is
 *   one of them. A mock without it fails every later
 *   `import childProcess from 'node:child_process'` ("Missing 'default' export");
 *   a restore without it leaves the MOCK's `default` behind, so such an import
 *   silently gets the fake `spawn` while named imports get the real one.
 * @param exports - the named exports
 */
function childProcessModule(exports: Record<string, unknown>): Record<string, unknown> {
	return { ...exports, default: exports }
}

function installChildProcessMock(calls: SpawnCall[]): void {
	mock.module('node:child_process', () =>
		childProcessModule({
			...realChildProcess,
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
		})
	)
}

afterEach(() => {
	mock.restore()
	// → GOTCHA: `mock.restore()` does not undo `mock.module()` (bun 1.4.2), and
	//   `test:unit` runs every file in one process. Left in place, this fake
	//   `spawn` reached every later file, and its child never exits.
	mock.module('node:child_process', () => childProcessModule(realChildProcess))
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
