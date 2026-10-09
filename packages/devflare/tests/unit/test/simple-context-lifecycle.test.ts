import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BridgeClient } from '../../../src/bridge/client'
import {
	__resetTestContextConfigCache,
	createDisposeContext,
	resolveTestContextConfig
} from '../../../src/test/simple-context-lifecycle'
import { trackWaitUntil } from '../../../src/test/wait-until-tracker'
import { createTrackedTempDirectories } from '../../helpers/tracked-temp-directories'

const tempDirectories = createTrackedTempDirectories()

afterAll(() => {
	tempDirectories.cleanup()
})

beforeEach(() => {
	__resetTestContextConfigCache()
})

function createProject(name: string): string {
	const projectDir = tempDirectories.create('devflare-lifecycle-config-')
	mkdirSync(projectDir, { recursive: true })
	writeFileSync(
		join(projectDir, 'devflare.config.ts'),
		`export default { name: '${name}', compatibilityDate: '2026-03-17' }\n`
	)

	return projectDir
}

describe('resolveTestContextConfig', () => {
	test('hands back the same resolution for a repeated path', async () => {
		const projectDir = createProject('lifecycle-memo')

		const first = await resolveTestContextConfig('devflare.config.ts', projectDir)
		const second = await resolveTestContextConfig('devflare.config.ts', projectDir)

		expect(second).toBe(first)
		expect(second.config.name).toBe('lifecycle-memo')
	})

	test('reaches the same entry through autodiscovery and an explicit path', async () => {
		const projectDir = createProject('lifecycle-autodiscovered')
		mkdirSync(join(projectDir, 'tests'), { recursive: true })

		const explicit = await resolveTestContextConfig('devflare.config.ts', projectDir)
		const discovered = await resolveTestContextConfig(undefined, join(projectDir, 'tests'))

		expect(discovered).toBe(explicit)
	})

	test('keeps separate projects apart', async () => {
		const projectA = createProject('lifecycle-a')
		const projectB = createProject('lifecycle-b')

		const a = await resolveTestContextConfig('devflare.config.ts', projectA)
		const b = await resolveTestContextConfig('devflare.config.ts', projectB)

		expect(a.config.name).toBe('lifecycle-a')
		expect(b.config.name).toBe('lifecycle-b')
	})

	test('still fails loudly when no config exists', async () => {
		const emptyDir = tempDirectories.create('devflare-lifecycle-empty-')

		await expect(resolveTestContextConfig('devflare.config.ts', emptyDir)).rejects.toThrow()
	})
})

describe('createDisposeContext', () => {
	/** The order things happened in, shared by the fake client and the tracked work. */
	let events: string[]

	/**
	 * @description A dispose state whose only live handle is a bridge client
	 * that records its disconnect, optionally failing it.
	 * @param disconnectError - thrown from `disconnect()` when given
	 */
	function stateWithClient(disconnectError?: Error) {
		const client = {
			async disconnect() {
				events.push('disconnect')
				if (disconnectError) throw disconnectError
			}
		}
		return {
			client: client as unknown as BridgeClient | null,
			miniflare: null,
			envProxy: null,
			transportDecode: null,
			remoteBindings: null,
			miniflareBindings: null
		}
	}

	/** Registers work that rejects with `message` after a short delay, as cf.worker.fetch would. */
	function trackRejection(message: string): void {
		trackWaitUntil(
			(async () => {
				await new Promise((resolve) => setTimeout(resolve, 20))
				events.push('work settled')
				throw new Error(message)
			})(),
			{ helper: 'cf.worker.fetch', method: 'GET', url: 'http://localhost/sweep' }
		)
	}

	beforeEach(() => {
		events = []
	})

	test('drains waitUntil work before tearing down, and throws its failure after the teardown', async () => {
		trackRejection('sweep exploded')
		const state = stateWithClient()

		const error = await createDisposeContext(state)().then(
			() => null,
			(thrown: unknown) => thrown
		)

		expect(events).toEqual(['work settled', 'disconnect'])
		expect(state.client).toBeNull()
		expect((error as Error).name).toBe('WaitUntilError')
		expect(((error as Error).cause as Error).message).toBe('sweep exploded')
	})

	test('reports a teardown failure and a waitUntil failure together, so neither hides the other', async () => {
		trackRejection('sweep exploded')
		const teardownError = new Error('disconnect failed')

		const error = await createDisposeContext(stateWithClient(teardownError))().then(
			() => null,
			(thrown: unknown) => thrown
		)

		expect(error).toBeInstanceOf(AggregateError)
		const [first, second] = (error as AggregateError).errors as Error[]
		expect(first).toBe(teardownError)
		expect(second.name).toBe('WaitUntilError')
		expect((error as Error).message).toContain('Error: disconnect failed')
		expect((error as Error).message).toContain(
			'cf.worker.fetch(GET http://localhost/sweep) rejected: Error: sweep exploded'
		)
	})

	test('throws a teardown failure as it was when no waitUntil work failed', async () => {
		const teardownError = new Error('disconnect failed')

		await expect(createDisposeContext(stateWithClient(teardownError))()).rejects.toBe(teardownError)
	})
})
