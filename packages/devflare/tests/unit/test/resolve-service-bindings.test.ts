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
		expect(result.workers).toHaveLength(1)
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
})
