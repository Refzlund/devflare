import { describe, expect, test } from 'bun:test'
import {
	buildMergedWorkspaceConfig,
	namespaceAppWorkers
} from '../../../src/dev-server/workspace/merge-config'

/** A worker set shaped like `buildMiniflareDevConfig` output for one app. */
function makeAppWorkers() {
	return [
		{
			name: 'gateway',
			routes: ['*'],
			serviceBindings: {
				// intra-app: gateway → main worker (must be namespaced)
				__DEVFLARE_APP: { name: 'my-app' },
				// external service binding (must be left alone)
				EXTERNAL: { name: 'some-other-worker' }
			},
			durableObjects: {
				// intra-app DO reference (scriptName must be namespaced)
				DOC_ROOM: { className: 'DocRoom', scriptName: 'do-doc_room' }
			}
		},
		{ name: 'my-app', serviceBindings: { OUT: 'do-doc_room' } },
		// the DO's own worker: value is a class NAME (string), not a worker ref
		{ name: 'do-doc_room', durableObjects: { DOC_ROOM: 'DocRoom' } }
	]
}

describe('namespaceAppWorkers', () => {
	test('renames workers, rewrites intra-app refs, drops routes, attaches direct socket', () => {
		const workers = makeAppWorkers()
		const { gatewayWorkerName } = namespaceAppWorkers('api', workers, {
			host: '127.0.0.1',
			directSocketPort: 8789
		})

		expect(workers.map((worker) => worker.name)).toEqual([
			'api/gateway',
			'api/my-app',
			'api/do-doc_room'
		])

		const gateway = workers[0]
		// Entry routes dropped so the shared entry socket has no contention.
		expect('routes' in gateway).toBe(false)
		// Intra-app service binding namespaced; external one untouched.
		expect(gateway.serviceBindings.__DEVFLARE_APP).toEqual({ name: 'api/my-app' })
		expect(gateway.serviceBindings.EXTERNAL).toEqual({ name: 'some-other-worker' })
		// DO reference scriptName namespaced.
		expect(gateway.durableObjects.DOC_ROOM).toEqual({
			className: 'DocRoom',
			scriptName: 'api/do-doc_room'
		})
		// Direct socket on the gateway (the entry/browser origin).
		expect(gateway.unsafeDirectSockets).toEqual([
			{ host: '127.0.0.1', port: 8789, entrypoint: 'default' }
		])
		expect(gatewayWorkerName).toBe('api/gateway')

		// String-form service binding target that is a local worker is namespaced.
		expect(workers[1].serviceBindings.OUT).toBe('api/do-doc_room')
		// The DO worker's own `durableObjects` value is a class name, NOT a ref.
		expect(workers[2].durableObjects.DOC_ROOM).toBe('DocRoom')
	})
})

describe('buildMergedWorkspaceConfig', () => {
	test('unions two apps, one persist block, per-app direct sockets', () => {
		const { config, directSockets } = buildMergedWorkspaceConfig({
			apps: [
				{ appName: 'api', workers: makeAppWorkers(), directSocketPort: 8789 },
				{ appName: 'web', workers: makeAppWorkers(), directSocketPort: 8788 }
			],
			host: '127.0.0.1',
			persist: true,
			persistDir: '/tmp/ws-data'
		})

		// All workers from both apps, uniquely namespaced.
		expect(config.workers).toHaveLength(6)
		const names = config.workers.map((worker: any) => worker.name)
		expect(new Set(names).size).toBe(6)
		expect(names).toContain('api/gateway')
		expect(names).toContain('web/gateway')

		// Entry socket is ephemeral by default; browsers use the direct sockets.
		expect(config.port).toBe(0)
		// One persist block for the whole instance.
		expect(config.d1Persist).toContain('ws-data')
		expect(config.r2Persist).toContain('ws-data')

		expect(directSockets).toEqual([
			{ appName: 'api', gatewayWorkerName: 'api/gateway', port: 8789 },
			{ appName: 'web', gatewayWorkerName: 'web/gateway', port: 8788 }
		])
	})

	test('omits persist paths when persist is off', () => {
		const { config } = buildMergedWorkspaceConfig({
			apps: [{ appName: 'api', workers: makeAppWorkers(), directSocketPort: 8789 }],
			host: '127.0.0.1',
			persist: false,
			persistDir: '/tmp/ws-data'
		})
		expect(config.d1Persist).toBeUndefined()
		expect(config.durableObjectsPersist).toBeUndefined()
	})

	test('honors an explicit entry port', () => {
		const { config } = buildMergedWorkspaceConfig({
			apps: [{ appName: 'api', workers: makeAppWorkers(), directSocketPort: 8789 }],
			host: '127.0.0.1',
			persist: false,
			persistDir: '/tmp/ws-data',
			entryPort: 9999
		})
		expect(config.port).toBe(9999)
	})

	test('rejects a duplicate app namespace', () => {
		expect(() =>
			buildMergedWorkspaceConfig({
				apps: [
					{ appName: 'api', workers: makeAppWorkers(), directSocketPort: 8789 },
					{ appName: 'api', workers: makeAppWorkers(), directSocketPort: 8790 }
				],
				host: '127.0.0.1',
				persist: false,
				persistDir: '/tmp/ws-data'
			})
		).toThrow(/Duplicate workspace app namespace/)
	})

	test('rejects a shared direct-socket port', () => {
		expect(() =>
			buildMergedWorkspaceConfig({
				apps: [
					{ appName: 'api', workers: makeAppWorkers(), directSocketPort: 8789 },
					{ appName: 'web', workers: makeAppWorkers(), directSocketPort: 8789 }
				],
				host: '127.0.0.1',
				persist: false,
				persistDir: '/tmp/ws-data'
			})
		).toThrow(/both use port 8789/)
	})
})
