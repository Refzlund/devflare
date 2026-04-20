// =============================================================================
// Vite Plugin Config Hook — Integration Tests
// =============================================================================

import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { compileConfig } from '../../../src/config/compiler'
import type { DevflareConfig, DevflareConfigInput } from '../../../src/config/schema'
import { configSchema } from '../../../src/config/schema'
import { resolveViteUserConfig } from '../../../src/vite'
import { devflarePlugin, getPluginContext } from '../../../src/vite/plugin'
import { createTestHarness, createMockProcessRunner, type TestHarness } from '../mocks'
import { setDependencies, clearDependencies } from '../../../src/cli/dependencies'

/**
 * Helper to parse and validate config from input
 */
function parseConfig(input: DevflareConfigInput): DevflareConfig {
	return configSchema.parse(input)
}

describe('vite plugin config generation', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			cwd: '/project',
			emptyExeca: true
		})

		setDependencies({
			fs: harness.fs.createMock(),
			exec: createMockProcessRunner(harness.execa)
		})
	})

	afterEach(() => {
		harness.reset()
		clearDependencies()
	})

	async function withResolvedPluginOutput(options: {
		configSource: string
		files: Record<string, string>
		assert(projectDir: string): Promise<void>
	}): Promise<void> {
		const projectDir = await mkdtemp(join(tmpdir(), 'devflare-vite-config-'))

		try {
			await mkdir(join(projectDir, 'src'), { recursive: true })
			await writeFile(join(projectDir, 'package.json'), JSON.stringify({
				name: 'vite-config-test',
				private: true,
				type: 'module'
			}, null, 2))
			await writeFile(join(projectDir, 'devflare.config.ts'), options.configSource.trim())

			for (const [relativePath, content] of Object.entries(options.files)) {
				await writeFile(join(projectDir, relativePath), content)
			}

			const plugin = devflarePlugin()
			if (!plugin.configResolved) {
				throw new Error('Expected devflare Vite plugin to expose configResolved()')
			}

			await (plugin.configResolved as any)({
				root: projectDir,
				command: 'build'
			} as any)

			await options.assert(projectDir)
		} finally {
			await rm(projectDir, { recursive: true, force: true })
		}
	}

	describe('compileConfig', () => {
		test('compiles minimal config', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01'
			}

			const result = compileConfig(parseConfig(config))

			expect(result.name).toBe('test-worker')
			expect(result.compatibility_date).toBe('2024-01-01')
		})

		test('compiles KV bindings configured with explicit ids', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				bindings: {
					kv: {
						CACHE: { id: 'cache-namespace-id' },
						STORE: { id: 'store-namespace-id' }
					}
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.kv_namespaces).toBeDefined()
			expect(result.kv_namespaces).toHaveLength(2)
		})

		test('compiles D1 bindings', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				bindings: {
					d1: {
						DB: { id: 'database-id' }
					}
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.d1_databases).toBeDefined()
			expect(result.d1_databases).toHaveLength(1)
			expect(result.d1_databases![0].binding).toBe('DB')
		})

		test('compiles R2 bindings', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				bindings: {
					r2: {
						BUCKET: 'bucket-name'
					}
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.r2_buckets).toBeDefined()
			expect(result.r2_buckets).toHaveLength(1)
		})

		test('compiles Durable Object bindings', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				bindings: {
					durableObjects: {
						COUNTER: { className: 'Counter' }
					}
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.durable_objects).toBeDefined()
			expect(result.durable_objects?.bindings).toHaveLength(1)
			expect(result.durable_objects?.bindings?.[0].name).toBe('COUNTER')
			expect(result.durable_objects?.bindings?.[0].class_name).toBe('Counter')
		})

		test('compiles vars', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				vars: {
					API_URL: 'https://api.example.com',
					DEBUG: 'true'
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.vars).toBeDefined()
			expect(result.vars?.API_URL).toBe('https://api.example.com')
			expect(result.vars?.DEBUG).toBe('true')
		})

		test('compiles cron triggers', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				triggers: {
					crons: ['0 * * * *', '0 0 * * *']
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.triggers).toBeDefined()
			expect(result.triggers?.crons).toEqual(['0 * * * *', '0 0 * * *'])
		})

		test('compiles with environment override', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				vars: {
					API_URL: 'https://api.dev.example.com'
				},
				env: {
					production: {
						vars: {
							API_URL: 'https://api.example.com'
						}
					}
				}
			}

			const result = compileConfig(parseConfig(config), 'production')

			expect(result.vars?.API_URL).toBe('https://api.example.com')
		})

		test('merges compatibility flags', () => {
			const config: DevflareConfigInput = {
				name: 'test-worker',
				compatibilityDate: '2024-01-01',
				compatibilityFlags: ['nodejs_compat']
			}

			const result = compileConfig(parseConfig(config))

			expect(result.compatibility_flags).toContain('nodejs_compat')
		})
	})

	describe('stringifyConfig', () => {
		test('produces valid JSON with header comment', () => {
			const { stringifyConfig } = require('../../../src/config/compiler')

			const wranglerConfig = {
				name: 'test-worker',
				compatibility_date: '2024-01-01'
			}

			const content = stringifyConfig(wranglerConfig)

			expect(content).toContain('// Generated by devflare')
			expect(content).toContain('test-worker')
		})

		test('formats output as JSON with tabs', () => {
			const { stringifyConfig } = require('../../../src/config/compiler')

			const wranglerConfig = {
				name: 'test-worker',
				compatibility_date: '2024-01-01',
				vars: { API_URL: 'https://api.example.com' }
			}

			const content = stringifyConfig(wranglerConfig)

			// Remove comment lines and parse
			const jsonContent = content
				.split('\n')
				.filter((line: string) => !line.trim().startsWith('//'))
				.join('\n')

			const parsed = JSON.parse(jsonContent)
			expect(parsed.name).toBe('test-worker')
			expect(parsed.vars.API_URL).toBe('https://api.example.com')
		})

		test('includes all bindings in output', () => {
			const { stringifyConfig } = require('../../../src/config/compiler')

			const wranglerConfig = {
				name: 'test-worker',
				compatibility_date: '2024-01-01',
				kv_namespaces: [{ binding: 'CACHE', id: 'cache-ns' }],
				d1_databases: [{ binding: 'DB', database_id: 'db-id' }]
			}

			const content = stringifyConfig(wranglerConfig)

			expect(content).toContain('kv_namespaces')
			expect(content).toContain('CACHE')
			expect(content).toContain('d1_databases')
			expect(content).toContain('DB')
		})
	})

	describe('config with all bindings', () => {
		test('compiles complex config with multiple bindings', () => {
			const config: DevflareConfigInput = {
				name: 'full-worker',
				compatibilityDate: '2024-01-01',
				compatibilityFlags: ['nodejs_compat'],
				bindings: {
					kv: { CACHE: { id: 'cache-ns' } },
					d1: { DB: { id: 'database-id' } },
					r2: { BUCKET: 'bucket-name' },
					durableObjects: { COUNTER: { className: 'Counter' } },
					services: { AUTH: { service: 'auth-worker' } }
				},
				vars: {
					API_URL: 'https://api.example.com'
				},
				triggers: {
					crons: ['0 * * * *']
				}
			}

			const result = compileConfig(parseConfig(config))

			expect(result.name).toBe('full-worker')
			expect(result.kv_namespaces).toHaveLength(1)
			expect(result.d1_databases).toHaveLength(1)
			expect(result.r2_buckets).toHaveLength(1)
			expect(result.durable_objects?.bindings).toHaveLength(1)
			expect(result.services).toHaveLength(1)
			expect(result.vars?.API_URL).toBe('https://api.example.com')
			expect(result.triggers?.crons).toHaveLength(1)
		})
	})

	describe('plugin configResolved output', () => {
		test('preserves a direct fetch entry for build-mode wrangler output', async () => {
			await withResolvedPluginOutput({
				configSource: [
					'export default {',
					"\tname: 'vite-config-test',",
					"\tcompatibilityDate: '2026-03-17',",
					'\tfiles: {',
					"\t\tfetch: 'src/fetch.ts'",
					'\t}',
					'}'
				].join('\n'),
				files: {
					'src/fetch.ts': `export async function fetch(): Promise<Response> { return new Response('ok') }`
				},
				assert: async (projectDir) => {
					const wranglerConfig = await readFile(join(projectDir, '.devflare', 'wrangler.jsonc'), 'utf8')
					expect(wranglerConfig).toContain('"main": "../src/fetch.ts"')
					await expect(access(join(projectDir, '.devflare', 'worker-entrypoints', 'main.ts'))).rejects.toThrow()
				}
			})
		})

		test('preserves a direct fetch entry while retaining auxiliary bindings in build mode', async () => {
			await withResolvedPluginOutput({
				configSource: [
					'export default {',
					"\tname: 'vite-config-test',",
					"\tcompatibilityDate: '2026-03-17',",
					'\tfiles: {',
					"\t\tfetch: 'src/fetch.ts',",
					"\t\tqueue: 'src/queue.ts',",
					"\t\tscheduled: 'src/scheduled.ts',",
					"\t\temail: 'src/email.ts'",
					'\t},',
					'\tbindings: {',
					'\t\tqueues: {',
					'\t\t\tproducers: {',
					"\t\t\t\tTASK_QUEUE: 'task-queue'",
					'\t\t\t},',
					'\t\t\tconsumers: [',
					'\t\t\t\t{',
					"\t\t\t\t\tqueue: 'task-queue'",
					'\t\t\t\t}',
					'\t\t\t]',
					'\t\t}',
					'\t},',
					'\ttriggers: {',
					"\t\tcrons: ['0 * * * *']",
					'\t}',
					'}'
				].join('\n'),
				files: {
					'src/fetch.ts': `export async function fetch(): Promise<Response> { return new Response('ok') }`,
					'src/queue.ts': `export async function queue(): Promise<void> { return undefined }`,
					'src/scheduled.ts': `export async function scheduled(): Promise<void> { return undefined }`,
					'src/email.ts': `export async function email() { return undefined }`
				},
				assert: async (projectDir) => {
					const wranglerConfig = await readFile(join(projectDir, '.devflare', 'wrangler.jsonc'), 'utf8')
					expect(wranglerConfig).toContain('"main": "../src/fetch.ts"')
					expect(wranglerConfig).toContain('"binding": "TASK_QUEUE"')
					expect(wranglerConfig).toContain('"queue": "task-queue"')
					expect(wranglerConfig).toContain('"crons": [')
					await expect(access(join(projectDir, '.devflare', 'worker-entrypoints', 'main.ts'))).rejects.toThrow()
				}
			})
		})

		test('preserves an explicit wrangler passthrough main instead of generating a composed entry', async () => {
			const projectDir = await mkdtemp(join(tmpdir(), 'devflare-vite-config-'))

			try {
				await mkdir(join(projectDir, 'src'), { recursive: true })
				await writeFile(join(projectDir, 'package.json'), JSON.stringify({
					name: 'vite-config-test',
					private: true,
					type: 'module'
				}, null, 2))
				await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'vite-config-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		queue: 'src/queue.ts',
		scheduled: 'src/scheduled.ts',
		email: 'src/email.ts'
	},
	wrangler: {
		passthrough: {
			main: 'src/custom-main.ts'
		}
	}
}
`.trim())
				await writeFile(join(projectDir, 'src', 'fetch.ts'), `export async function fetch(): Promise<Response> { return new Response('ok') }`)
				await writeFile(join(projectDir, 'src', 'queue.ts'), `export async function queue(): Promise<void> { return undefined }`)
				await writeFile(join(projectDir, 'src', 'scheduled.ts'), `export async function scheduled(): Promise<void> { return undefined }`)
				await writeFile(join(projectDir, 'src', 'email.ts'), `export async function email() { return undefined }`)
				await writeFile(join(projectDir, 'src', 'custom-main.ts'), `export async function fetch(): Promise<Response> { return new Response('custom') }`)

				const plugin = devflarePlugin()
				if (!plugin.configResolved) {
					throw new Error('Expected devflare Vite plugin to expose configResolved()')
				}

				await (plugin.configResolved as any)({
					root: projectDir,
					command: 'build'
				} as any)

				const wranglerConfig = await readFile(join(projectDir, '.devflare', 'wrangler.jsonc'), 'utf8')
				expect(wranglerConfig).toContain('"main": "../src/custom-main.ts"')
				await expect(access(join(projectDir, '.devflare', 'worker-entrypoints', 'main.ts'))).rejects.toThrow()
			} finally {
				await rm(projectDir, { recursive: true, force: true })
			}
		})

		test('clears stale Durable Object plugin context when a later config disables DO discovery', async () => {
			const firstProjectDir = await mkdtemp(join(tmpdir(), 'devflare-vite-config-'))
			const secondProjectDir = await mkdtemp(join(tmpdir(), 'devflare-vite-config-'))

			try {
				await mkdir(join(firstProjectDir, 'src'), { recursive: true })
				await writeFile(join(firstProjectDir, 'package.json'), JSON.stringify({
					name: 'vite-do-config-test',
					private: true,
					type: 'module'
				}, null, 2))
				await writeFile(join(firstProjectDir, 'devflare.config.ts'), `
export default {
	name: 'vite-do-config-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		durableObjects: {
			COUNTER: {
				className: 'Counter'
			}
		}
	}
}
`.trim())
				await writeFile(join(firstProjectDir, 'src', 'fetch.ts'), `export async function fetch(): Promise<Response> { return new Response('ok') }`)
				await writeFile(join(firstProjectDir, 'src', 'do.counter.ts'), `
import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {}
`.trim())

				const firstPlugin = devflarePlugin()
				if (!firstPlugin.configResolved) {
					throw new Error('Expected devflare Vite plugin to expose configResolved()')
				}

				await (firstPlugin.configResolved as any)({
					root: firstProjectDir,
					command: 'build'
				} as any)

				expect(getPluginContext().auxiliaryWorkerConfig).not.toBeNull()
				expect(getPluginContext().durableObjects?.files.size).toBe(1)

				await mkdir(join(secondProjectDir, 'src'), { recursive: true })
				await writeFile(join(secondProjectDir, 'package.json'), JSON.stringify({
					name: 'vite-no-do-config-test',
					private: true,
					type: 'module'
				}, null, 2))
				await writeFile(join(secondProjectDir, 'devflare.config.ts'), `
export default {
	name: 'vite-no-do-config-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts',
		durableObjects: false
	}
}
`.trim())
				await writeFile(join(secondProjectDir, 'src', 'fetch.ts'), `export async function fetch(): Promise<Response> { return new Response('ok') }`)

				const secondPlugin = devflarePlugin()
				if (!secondPlugin.configResolved) {
					throw new Error('Expected devflare Vite plugin to expose configResolved()')
				}

				await (secondPlugin.configResolved as any)({
					root: secondProjectDir,
					command: 'build'
				} as any)

				const pluginContext = getPluginContext()
				expect(pluginContext.auxiliaryWorkerConfig).toBeNull()
				expect(pluginContext.durableObjects).toBeNull()
			} finally {
				await rm(firstProjectDir, { recursive: true, force: true })
				await rm(secondProjectDir, { recursive: true, force: true })
			}
		})
	})

	describe('plugin configureServer config watching', () => {
		test('watches the resolved devflare.config.mts path in serve mode', async () => {
			const projectDir = await mkdtemp(join(tmpdir(), 'devflare-vite-config-watch-'))

			try {
				await mkdir(join(projectDir, 'src'), { recursive: true })
				await writeFile(join(projectDir, 'package.json'), JSON.stringify({
					name: 'vite-config-watch-test',
					private: true,
					type: 'module'
				}, null, 2))
				await writeFile(join(projectDir, 'devflare.config.mts'), `
export default {
	name: 'vite-config-watch-test',
	compatibilityDate: '2026-03-17',
	files: {
		fetch: 'src/fetch.ts'
	}
}
`.trim())
				await writeFile(join(projectDir, 'src', 'fetch.ts'), `export async function fetch(): Promise<Response> { return new Response('ok') }`)

				const addedPaths: string[] = []
				const changeHandlers: Array<(changedPath: string) => unknown> = []
				const plugin = devflarePlugin()

				if (!plugin.configResolved || !plugin.configureServer) {
					throw new Error('Expected devflare Vite plugin to expose configResolved() and configureServer()')
				}

				await (plugin.configResolved as any)({
					root: projectDir,
					command: 'serve'
				} as any)

				;(plugin.configureServer as any)({
					watcher: {
						add(path: string) {
							addedPaths.push(path)
						},
						on(event: string, handler: (changedPath: string) => unknown) {
							if (event === 'change') {
								changeHandlers.push(handler)
							}
						}
					},
					ws: {
						send: mock(() => { })
					}
				} as any)

				expect(changeHandlers).toHaveLength(1)
				expect(addedPaths).toContain(join(projectDir, 'devflare.config.mts'))
			} finally {
				await rm(projectDir, { recursive: true, force: true })
			}
		})
	})

	describe('resolveViteUserConfig', () => {
		test('merges local vite.config with devflare vite config and injects devflarePlugin', async () => {
			const projectDir = await mkdtemp(join(tmpdir(), 'devflare-vite-resolve-'))

			try {
				await mkdir(join(projectDir, 'src'), { recursive: true })
				await writeFile(join(projectDir, 'package.json'), JSON.stringify({
					name: 'vite-resolve-test',
					private: true,
					type: 'module'
				}, null, 2))
				await writeFile(join(projectDir, 'devflare.config.ts'), `
const inlinePlugin = {
	name: 'inline-plugin'
}

export default {
	name: 'vite-resolve-test',
	compatibilityDate: '2026-03-17',
	vite: {
		define: {
			__INLINE__: ${JSON.stringify(JSON.stringify('yes'))}
		},
		resolve: {
			alias: {
				inline: '/inline'
			}
		},
		plugins: [inlinePlugin]
	}
}
`.trim())
				await writeFile(join(projectDir, 'vite.config.ts'), `
const localPlugin = {
	name: 'local-plugin'
}

export default {
	resolve: {
		alias: {
			local: '/local'
		}
	},
	plugins: [localPlugin]
}
`.trim())

				const resolvedConfig = await resolveViteUserConfig({
					command: 'build',
					mode: 'production'
				} as any, {
					cwd: projectDir,
					localConfigPath: join(projectDir, 'vite.config.ts')
				})

				expect(resolvedConfig.root).toBe(projectDir)
				expect((resolvedConfig.resolve as Record<string, unknown>)?.alias).toMatchObject({
					local: '/local',
					inline: '/inline'
				})
				expect((resolvedConfig.define as Record<string, unknown>)?.__INLINE__).toBe(JSON.stringify('yes'))

				const pluginNames = (resolvedConfig.plugins as Array<{ name?: string }> | undefined)?.map((plugin) => plugin.name)
				expect(pluginNames).toContain('devflare')
				expect(pluginNames).toContain('local-plugin')
				expect(pluginNames).toContain('inline-plugin')
			} finally {
				await rm(projectDir, { recursive: true, force: true })
			}
		})

		test('preserves promise-like plugin entries when injecting devflarePlugin', async () => {
			const projectDir = await mkdtemp(join(tmpdir(), 'devflare-vite-resolve-async-'))

			try {
				await mkdir(join(projectDir, 'src'), { recursive: true })
				await writeFile(join(projectDir, 'package.json'), JSON.stringify({
					name: 'vite-resolve-async-test',
					private: true,
					type: 'module'
				}, null, 2))
				await writeFile(join(projectDir, 'devflare.config.ts'), `
export default {
	name: 'vite-resolve-async-test',
	compatibilityDate: '2026-03-17'
}
`.trim())
				await writeFile(join(projectDir, 'vite.config.ts'), `
const localPlugin = {
	name: 'local-plugin'
}

const asyncPlugin = Promise.resolve({
	name: 'async-plugin'
})

export default {
	plugins: [localPlugin, asyncPlugin]
}
`.trim())

				const resolvedConfig = await resolveViteUserConfig({
					command: 'build',
					mode: 'production'
				} as any, {
					cwd: projectDir,
					localConfigPath: join(projectDir, 'vite.config.ts')
				})

				const pluginEntries = (resolvedConfig.plugins ?? []) as Array<unknown>
				expect(pluginEntries.some((plugin) => typeof (plugin as PromiseLike<unknown>)?.then === 'function')).toBe(true)

				const resolvedPlugins = await Promise.all(pluginEntries.map(async (plugin) => {
					if (typeof (plugin as PromiseLike<unknown>)?.then === 'function') {
						return await plugin as unknown
					}

					return plugin
				}))

				const pluginNames = resolvedPlugins
					.flatMap((plugin) => Array.isArray(plugin) ? plugin : [plugin])
					.filter((plugin): plugin is { name?: string } => typeof plugin === 'object' && plugin !== null)
					.map((plugin) => plugin.name)

				expect(pluginNames).toContain('devflare')
				expect(pluginNames).toContain('local-plugin')
				expect(pluginNames).toContain('async-plugin')
			} finally {
				await rm(projectDir, { recursive: true, force: true })
			}
		})
	})
})
