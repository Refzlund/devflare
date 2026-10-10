import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	type ContainerCommandResult,
	type ContainerCommandRunner,
	createContainerManager,
	detectContainerEngine,
	getContainerSkipReason
} from '../../../src/test/containers'

interface CommandCall {
	command: string
	args: string[]
}

const tempDirs: string[] = []

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function ok(stdout = ''): ContainerCommandResult {
	return {
		exitCode: 0,
		stdout,
		stderr: ''
	}
}

function fail(stderr = 'failed'): ContainerCommandResult {
	return {
		exitCode: 1,
		stdout: '',
		stderr
	}
}

function createRunner(
	handler: (
		command: string,
		args: string[]
	) => ContainerCommandResult | Promise<ContainerCommandResult>
): { runner: ContainerCommandRunner; calls: CommandCall[] } {
	const calls: CommandCall[] = []
	return {
		calls,
		runner: {
			async exec(command, args) {
				calls.push({ command, args })
				return await handler(command, args)
			}
		}
	}
}

function createContainerRunner() {
	const dockerResponses = new Map<string, () => ContainerCommandResult>([
		['info', () => ok('Docker is running')],
		['image inspect', () => ok('[]')],
		['build', () => ok('built')],
		['run', () => ok('container-id')],
		['logs', () => ok('hello logs')],
		[
			'inspect',
			() =>
				ok(
					JSON.stringify({
						Status: 'running',
						Running: true,
						ExitCode: 0
					})
				)
		],
		['stop', () => ok()],
		['rm', () => ok()]
	])

	return createRunner((command, args) => {
		const dockerCommand = args[0] === 'image' ? `${args[0]} ${args[1]}` : args[0]
		return command === 'docker'
			? (dockerResponses.get(dockerCommand)?.() ?? fail(`${command} ${args.join(' ')}`))
			: fail(`${command} ${args.join(' ')}`)
	})
}

describe('detectContainerEngine', () => {
	test('detects Docker when the CLI and engine are reachable', async () => {
		const { runner, calls } = createRunner((command, args) => {
			if (command === 'docker' && args[0] === 'info') {
				return ok('Docker is running')
			}
			return fail('unexpected command')
		})

		const status = await detectContainerEngine({ runner })

		expect(status.available).toBe(true)
		if (!status.available) {
			throw new Error(status.reason)
		}
		expect(status.engine).toBe('docker')
		expect(calls).toEqual([{ command: 'docker', args: ['info'] }])
	})

	test('falls back to Podman when Docker is not reachable', async () => {
		const { runner, calls } = createRunner((command, args) => {
			if (command === 'docker' && args[0] === 'info') {
				return fail('Cannot connect to the Docker daemon')
			}
			if (command === 'podman' && args[0] === 'info') {
				return ok('Podman is running')
			}
			return fail('unexpected command')
		})

		const status = await detectContainerEngine({ runner })

		expect(status.available).toBe(true)
		if (!status.available) {
			throw new Error(status.reason)
		}
		expect(status.engine).toBe('podman')
		expect(calls).toEqual([
			{ command: 'docker', args: ['info'] },
			{ command: 'podman', args: ['info'] }
		])
	})
})

describe('getContainerSkipReason', () => {
	test('skips unless real container tests are explicitly enabled', async () => {
		const { runner, calls } = createContainerRunner()

		const reason = await getContainerSkipReason({ env: {}, runner })

		expect(reason).toContain('DEVFLARE_CONTAINER_TESTS=1')
		expect(calls).toEqual([])
	})

	test('does not skip when tests are enabled and an engine is reachable', async () => {
		const { runner } = createContainerRunner()

		const reason = await getContainerSkipReason({
			env: { DEVFLARE_CONTAINER_TESTS: '1' },
			runner
		})

		expect(reason).toBeNull()
	})
})

describe('devflare/test public surface', () => {
	test('exports container helpers and the containers skip getter', async () => {
		const testApi = await import('../../../src/test')

		expect(testApi.containers).toBeDefined()
		expect(typeof testApi.createContainerManager).toBe('function')
		expect(typeof testApi.detectContainerEngine).toBe('function')
		expect('containers' in testApi.shouldSkip).toBe(true)
	})
})

describe('createContainerManager', () => {
	test('starts a pre-existing local image offline and exposes fetch/log/state/stop APIs', async () => {
		const { runner, calls } = createContainerRunner()
		const fetched: Request[] = []
		const manager = createContainerManager({
			runner,
			cwd: 'C:/project',
			allocatePort: async () => 49152,
			waitForPort: async () => {},
			fetch: (async (input, init) => {
				const request = input instanceof Request ? input : new Request(input, init)
				fetched.push(request)
				return new Response(request.url)
			}) as typeof fetch
		})

		const container = await manager.start('MyContainer', {
			image: 'ghcr.io/acme/app:local',
			port: 8080,
			instance: 'case-1',
			envVars: {
				TOKEN: 'offline'
			}
		})

		const runCall = calls.find((call) => call.args[0] === 'run')
		expect(
			calls.some((call) => call.args.join(' ') === 'image inspect ghcr.io/acme/app:local')
		).toBe(true)
		expect(calls.some((call) => call.args[0] === 'pull')).toBe(false)
		expect(runCall?.args).toContain('-d')
		expect(runCall?.args).toContain('127.0.0.1:49152:8080')
		expect(runCall?.args).toContain('TOKEN=offline')
		expect(runCall?.args.at(-1)).toBe('ghcr.io/acme/app:local')

		const response = await container.fetch('/health')
		await container.fetch('https://example.com/status?probe=1')
		await container.fetch(new URL('https://example.com/deep/path?ok=1'))
		const logs = await container.logs()
		const state = await container.getState()
		await container.stop()

		expect(await response.text()).toBe('http://127.0.0.1:49152/health')
		expect(fetched[0].url).toBe('http://127.0.0.1:49152/health')
		expect(fetched[1].url).toBe('http://127.0.0.1:49152/status?probe=1')
		expect(fetched[2].url).toBe('http://127.0.0.1:49152/deep/path?ok=1')
		expect(logs).toBe('hello logs')
		expect(state).toEqual({
			status: 'running',
			running: true,
			exitCode: 0
		})
		expect(calls.some((call) => call.args[0] === 'stop' && call.args[1] === container.name)).toBe(
			true
		)
		expect(
			calls.some(
				(call) => call.args[0] === 'rm' && call.args[1] === '-f' && call.args[2] === container.name
			)
		).toBe(true)
	})

	test('fails offline image-reference starts when the image is not present locally', async () => {
		const { runner, calls } = createRunner((command, args) => {
			if (command === 'docker' && args[0] === 'info') {
				return ok()
			}
			if (command === 'docker' && args[0] === 'image' && args[1] === 'inspect') {
				return fail('No such image')
			}
			return fail('unexpected command')
		})
		const manager = createContainerManager({
			runner,
			cwd: 'C:/project',
			allocatePort: async () => 49152,
			waitForPort: async () => {}
		})

		await expect(
			manager.start('MyContainer', {
				image: 'ghcr.io/acme/app:missing',
				port: 8080
			})
		).rejects.toThrow('is not present locally')

		expect(calls.some((call) => call.args[0] === 'pull')).toBe(false)
	})

	test('removes the container when readiness fails after run succeeds', async () => {
		const { runner, calls } = createContainerRunner()
		const manager = createContainerManager({
			runner,
			cwd: 'C:/project',
			allocatePort: async () => 49152,
			waitForPort: async () => {
				throw new Error('not ready')
			}
		})

		await expect(
			manager.start('MyContainer', {
				image: 'ghcr.io/acme/app:local',
				port: 8080
			})
		).rejects.toThrow('not ready')

		const runCall = calls.find((call) => call.args[0] === 'run')
		const nameIndex = runCall?.args.indexOf('--name') ?? -1
		const containerName = nameIndex >= 0 ? runCall?.args[nameIndex + 1] : undefined

		expect(containerName).toBeDefined()
		expect(
			calls.some(
				(call) => call.args[0] === 'rm' && call.args[1] === '-f' && call.args[2] === containerName
			)
		).toBe(true)
	})

	test('builds local Dockerfiles offline without pulling newer base layers', async () => {
		const tempDir = await mkdtemp(join(tmpdir(), 'devflare-container-'))
		tempDirs.push(tempDir)
		const dockerfile = join(tempDir, 'Dockerfile')
		await writeFile(dockerfile, 'FROM scratch\n')
		const { runner, calls } = createContainerRunner()
		const manager = createContainerManager({
			runner,
			cwd: tempDir,
			allocatePort: async () => 49152,
			waitForPort: async () => {}
		})

		await manager.start('MyContainer', {
			image: './Dockerfile',
			port: 8080
		})

		const buildCall = calls.find((call) => call.args[0] === 'build')
		expect(buildCall?.args).toContain('--pull=false')
		expect(buildCall?.args).toContain('-f')
		expect(buildCall?.args).toContain(dockerfile)
		expect(buildCall?.args).toContain(tempDir)
	})
})
