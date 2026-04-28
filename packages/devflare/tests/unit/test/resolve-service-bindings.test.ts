import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RefResult } from '../../../src/config/ref'
import type { DevflareConfig } from '../../../src/config/schema'
import { clearBundleCache, resolveServiceBindings } from '../../../src/test/resolve-service-bindings'

const tempDirs: string[] = []

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

beforeEach(() => {
	clearBundleCache()
})

function createResolvedRef(config: DevflareConfig, configPath: string): RefResult {
	const resolved = {
		name: config.name,
		config,
		configPath
	}

	return {
		get name() {
			return resolved.name
		},
		get config() {
			return resolved.config
		},
		get configPath() {
			return resolved.configPath
		},
		__import: async () => ({ default: config }),
		async resolve() {
			return resolved
		}
	} as unknown as RefResult
}

describe('resolveServiceBindings', () => {
	test('discovers named entrypoints from files.entrypoints without bundling files.fetch', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-service-bindings-entrypoints-'))
		tempDirs.push(projectDir)

		const workerDir = join(projectDir, 'workers', 'math')
		await mkdir(join(workerDir, 'src'), { recursive: true })
		await mkdir(join(workerDir, 'rpc', 'admin'), { recursive: true })

		await writeFile(join(workerDir, 'src', 'worker.ts'), `
export async function defaultPing(): Promise<string> {
	return 'DEFAULT_RPC_SENTINEL'
}
`.trim())

		await writeFile(join(workerDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('FETCH_FILE_SHOULD_NOT_BE_BUNDLED')
}
`.trim())

		await writeFile(join(workerDir, 'rpc', 'admin', 'ep.admin.ts'), `
import { WorkerEntrypoint } from 'cloudflare:workers'

export class AdminEntrypoint extends WorkerEntrypoint {
	async ping(): Promise<string> {
		return 'ENTRYPOINT_RPC_SENTINEL'
	}
}
`.trim())

		const referencedConfig = {
			name: 'math-worker',
			compatibilityDate: '2026-03-17',
			compatibilityFlags: ['nodejs_compat', 'nodejs_als'],
			files: {
				fetch: 'src/fetch.ts',
				entrypoints: 'rpc/**/ep.*.ts'
			}
		} as DevflareConfig

		const ref = createResolvedRef(referencedConfig, './workers/math/devflare.config.ts')
		const primaryConfig = {
			name: 'gateway-worker',
			compatibilityDate: '2026-03-17',
			compatibilityFlags: ['nodejs_compat', 'nodejs_als'],
			bindings: {
				services: {
					DEFAULT: {
						service: 'math-worker',
						__ref: ref
					},
					ADMIN: {
						service: 'math-worker',
						entrypoint: 'AdminEntrypoint',
						__ref: ref
					}
				}
			}
		} as DevflareConfig

		const result = await resolveServiceBindings(primaryConfig, projectDir)

		expect(result.primaryServiceBindings.ADMIN).toEqual({
			name: 'math-worker',
			entrypoint: 'AdminEntrypoint'
		})
		expect(result.primaryServiceBindings.DEFAULT).toEqual({
			name: 'math-worker'
		})
		expect(result.workers).toHaveLength(1)
		expect(result.workers[0]?.script).toContain('DEFAULT_RPC_SENTINEL')
		expect(result.workers[0]?.script).toContain('ENTRYPOINT_RPC_SENTINEL')
		expect(result.workers[0]?.script).not.toContain('FETCH_FILE_SHOULD_NOT_BE_BUNDLED')
	})

	test('keeps default service bindings on src/worker.ts even when files.fetch points elsewhere', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-service-bindings-worker-'))
		tempDirs.push(projectDir)

		const workerDir = join(projectDir, 'workers', 'rpc-worker')
		await mkdir(join(workerDir, 'src'), { recursive: true })

		await writeFile(join(workerDir, 'src', 'worker.ts'), `
export async function serviceAnswer(): Promise<string> {
	return 'WORKER_RPC_SENTINEL'
}
`.trim())

		await writeFile(join(workerDir, 'src', 'fetch.ts'), `
export async function fetch(): Promise<Response> {
	return new Response('FETCH_FILE_SHOULD_NOT_BE_BUNDLED')
}
`.trim())

		const referencedConfig = {
			name: 'rpc-worker',
			compatibilityDate: '2026-03-17',
			compatibilityFlags: ['nodejs_compat', 'nodejs_als'],
			files: {
				fetch: 'src/fetch.ts'
			}
		} as DevflareConfig

		const ref = createResolvedRef(referencedConfig, './workers/rpc-worker/devflare.config.ts')
		const primaryConfig = {
			name: 'gateway-worker',
			compatibilityDate: '2026-03-17',
			compatibilityFlags: ['nodejs_compat', 'nodejs_als'],
			bindings: {
				services: {
					RPC: {
						service: 'rpc-worker',
						__ref: ref
					}
				}
			}
		} as DevflareConfig

		const result = await resolveServiceBindings(primaryConfig, projectDir)

		expect(result.primaryServiceBindings.RPC).toEqual({ name: 'rpc-worker' })
		expect(result.workers).toHaveLength(1)
		expect(result.workers[0]?.script).toContain('WORKER_RPC_SENTINEL')
		expect(result.workers[0]?.script).not.toContain('FETCH_FILE_SHOULD_NOT_BE_BUNDLED')
	})

	test('carries local runtime bindings onto referenced service workers', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-service-bindings-runtime-'))
		tempDirs.push(projectDir)

		const workerDir = join(projectDir, 'workers', 'api')
		await mkdir(join(workerDir, 'src'), { recursive: true })

		await writeFile(join(workerDir, 'src', 'worker.ts'), `
export async function ping(): Promise<string> {
	return 'PONG'
}
`.trim())

		const referencedConfig = {
			name: 'api-worker',
			compatibilityDate: '2026-04-28',
			compatibilityFlags: ['nodejs_compat'],
			vars: {
				FEATURE_FLAG: 'enabled'
			},
			bindings: {
				kv: {
					CACHE: { name: 'api-cache' }
				},
				d1: {
					DB: { name: 'api-db' }
				},
				r2: {
					ASSETS: 'api-assets'
				},
				queues: {
					producers: {
						JOBS: 'api-jobs'
					}
				}
			}
		} as DevflareConfig

		const ref = createResolvedRef(referencedConfig, './workers/api/devflare.config.ts')
		const primaryConfig = {
			name: 'site-worker',
			compatibilityDate: '2026-04-28',
			bindings: {
				services: {
					API: {
						service: 'api-worker',
						__ref: ref
					}
				}
			}
		} as DevflareConfig

		const result = await resolveServiceBindings(primaryConfig, projectDir)
		const worker = result.workers[0] as any

		expect(worker.kvNamespaces).toEqual({ CACHE: 'api-cache' })
		expect(worker.d1Databases).toEqual({ DB: 'api-db' })
		expect(worker.r2Buckets).toEqual({ ASSETS: 'api-assets' })
		expect(worker.queueProducers).toEqual({ JOBS: { queueName: 'api-jobs' } })
		expect(worker.bindings).toEqual({ FEATURE_FLAG: 'enabled' })
	})

	test('wires local Durable Objects owned by referenced service workers', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-service-bindings-do-'))
		tempDirs.push(projectDir)

		const workerDir = join(projectDir, 'workers', 'api')
		await mkdir(join(workerDir, 'src'), { recursive: true })

		await writeFile(join(workerDir, 'src', 'ep.api.ts'), `
import { WorkerEntrypoint } from 'cloudflare:workers'

export class ApiEntrypoint extends WorkerEntrypoint {
	async ping(): Promise<string> {
		return 'PONG'
	}
}
`.trim())

		await writeFile(join(workerDir, 'src', 'do.counter.ts'), `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
	async ping(): Promise<string> {
		return 'DO_PONG'
	}
}
`.trim())

		const referencedConfig = {
			name: 'api-worker',
			compatibilityDate: '2026-04-28',
			compatibilityFlags: ['nodejs_compat'],
			files: {
				entrypoints: 'src/ep.*.ts',
				durableObjects: 'src/do.*.ts'
			},
			bindings: {
				durableObjects: {
					COUNTER: 'Counter'
				}
			}
		} as DevflareConfig

		const ref = createResolvedRef(referencedConfig, './workers/api/devflare.config.ts')
		const primaryConfig = {
			name: 'site-worker',
			compatibilityDate: '2026-04-28',
			bindings: {
				services: {
					API: {
						service: 'api-worker',
						entrypoint: 'ApiEntrypoint',
						__ref: ref
					}
				}
			}
		} as DevflareConfig

		const result = await resolveServiceBindings(primaryConfig, projectDir)
		const apiWorker = result.workers.find((worker) => worker.name === 'api-worker')
		const doWorker = result.workers.find((worker) => worker.name === 'api-worker-durable-objects')

		expect(apiWorker?.durableObjects).toEqual({
			COUNTER: {
				className: 'Counter',
				scriptName: 'api-worker-durable-objects'
			}
		})
		expect(doWorker?.durableObjects).toEqual({ COUNTER: 'Counter' })
		expect(doWorker?.script).toContain('DO_PONG')
	})

	test('does not duplicate queue consumers onto auxiliary durable object workers', async () => {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-service-bindings-surfaces-'))
		tempDirs.push(projectDir)

		const workerDir = join(projectDir, 'workers', 'api')
		await mkdir(join(workerDir, 'src'), { recursive: true })

		await writeFile(join(workerDir, 'src', 'ep.api.ts'), `
import { WorkerEntrypoint } from 'cloudflare:workers'

export class ApiEntrypoint extends WorkerEntrypoint {
	async fetch(): Promise<Response> {
		return new Response('API_OK')
	}
}
`.trim())

		await writeFile(join(workerDir, 'src', 'do.counter.ts'), `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
	async fetch(): Promise<Response> {
		return new Response('DO_OK')
	}
}
`.trim())

		const referencedConfig = {
			name: 'api-worker',
			compatibilityDate: '2026-04-28',
			files: {
				entrypoints: 'src/ep.*.ts',
				durableObjects: 'src/do.*.ts'
			},
			bindings: {
				durableObjects: {
					COUNTER: 'Counter'
				},
				queues: {
					producers: {
						EMAIL_QUEUE: 'email-local',
						TTS_QUEUE: 'tts-local'
					},
					consumers: [
						{ queue: 'email-local', deadLetterQueue: 'email-dlq-local' },
						{ queue: 'tts-local', deadLetterQueue: 'tts-dlq-local' }
					]
				}
			}
		} as DevflareConfig

		const ref = createResolvedRef(referencedConfig, './workers/api/devflare.config.ts')
		const primaryConfig = {
			name: 'site-worker',
			compatibilityDate: '2026-04-28',
			bindings: {
				services: {
					API: {
						service: 'api-worker',
						entrypoint: 'ApiEntrypoint',
						__ref: ref
					}
				}
			}
		} as DevflareConfig

		const result = await resolveServiceBindings(primaryConfig, projectDir)
		const apiWorker = result.workers.find((worker) => worker.name === 'api-worker')
		const doWorker = result.workers.find((worker) => worker.name === 'api-worker-durable-objects')
		const consumersByQueue = new Map<string, string[]>()

		for (const worker of result.workers) {
			for (const queue of Object.keys(worker.queueConsumers ?? {})) {
				const owners = consumersByQueue.get(queue) ?? []
				owners.push(worker.name)
				consumersByQueue.set(queue, owners)
			}
		}

		expect(apiWorker?.queueConsumers).toEqual({
			'email-local': { deadLetterQueue: 'email-dlq-local' },
			'tts-local': { deadLetterQueue: 'tts-dlq-local' }
		})
		expect(doWorker?.queueConsumers).toBeUndefined()
		expect([...consumersByQueue.values()].filter((owners) => owners.length > 1)).toEqual([])
	})
})
