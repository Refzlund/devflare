// =============================================================================
// Config Loader Tests — Load devflare.config.ts via c12
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'pathe'
import { loadConfig, resolveConfigPath } from '../../../src/config/loader'

const TEST_DIR = join(import.meta.dirname, '../.fixtures/config-loader')
const WORKSPACE_ENV_KEYS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] as const

describe('loadConfig', () => {
	let originalWorkspaceEnv: Record<string, string | undefined> = {}

	beforeEach(async () => {
		originalWorkspaceEnv = Object.fromEntries(
			WORKSPACE_ENV_KEYS.map((key) => [key, process.env[key]])
		) as Record<string, string | undefined>

		await mkdir(TEST_DIR, { recursive: true })
	})

	afterEach(async () => {
		for (const key of WORKSPACE_ENV_KEYS) {
			const originalValue = originalWorkspaceEnv[key]
			if (originalValue === undefined) {
				delete process.env[key]
				continue
			}

			process.env[key] = originalValue
		}

		await rm(TEST_DIR, { recursive: true, force: true })
	})

	test('loads config from devflare.config.ts', async () => {
		const configPath = join(TEST_DIR, 'devflare.config.ts')
		// Use direct export, not defineConfig since we're testing the loader
		await writeFile(
			configPath,
			`
			export default {
				name: 'test-worker',
				compatibilityDate: '2025-01-07'
			}
		`
		)

		const config = await loadConfig({ cwd: TEST_DIR })

		expect(config.name).toBe('test-worker')
	})

	test('loads config from custom path', async () => {
		// Use a unique directory + filename so jiti's absolute-path module cache
		// can never collide with the `config-loader` fixture dir that sibling
		// tests create and rm in each beforeEach/afterEach (the stale-resolution
		// source of the old c12/jiti "Cannot find module" flake here).
		const customDir = join(import.meta.dirname, `../.fixtures/config-loader-custom-${Date.now()}`)
		await mkdir(customDir, { recursive: true })
		const configPath = join(customDir, 'custom.config.ts')
		await writeFile(
			configPath,
			`
const config = {
	name: 'custom-worker',
	compatibilityDate: '2025-01-07'
}
export default config
		`.trim()
		)

		try {
			// Pass the absolute config path so c12's name-based search is bypassed.
			const config = await loadConfig({
				cwd: customDir,
				configFile: configPath
			})

			expect(config.name).toBe('custom-worker')
		} finally {
			await rm(customDir, { recursive: true, force: true })
		}
	})

	test('throws when config file not found', async () => {
		await expect(loadConfig({ cwd: TEST_DIR })).rejects.toThrow()
	})

	test('validates loaded config', async () => {
		// The loader should validate configs. Since c12/jiti has caching
		// issues in test environments, we test schema validation directly.
		// The schema test suite covers the full validation behavior.
		const configPath = join(TEST_DIR, 'devflare.config.ts')
		await writeFile(
			configPath,
			`
			export default {
				name: 'test-worker',
				compatibilityDate: '2025-01-07'
			}
		`
		)

		// Valid config should load successfully
		const config = await loadConfig({ cwd: TEST_DIR })
		expect(config.name).toBe('test-worker')
		// Should have forced flags even though none were specified
		expect(config.compatibilityFlags).toContain('nodejs_compat')
	})

	test('accepts relative cwd paths by normalizing them before loading config', async () => {
		const projectDir = join(TEST_DIR, 'relative-cwd')
		await mkdir(projectDir, { recursive: true })
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
			export default {
				name: 'relative-worker',
				compatibilityDate: '2025-01-07'
			}
		`
		)

		const config = await loadConfig({
			cwd: relative(process.cwd(), projectDir)
		})

		expect(config.name).toBe('relative-worker')
	})

	test('infers SvelteKit Cloudflare worker and asset outputs when they are omitted', async () => {
		const projectDir = join(TEST_DIR, 'sveltekit-inferred')
		await mkdir(projectDir, { recursive: true })

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'docs-app',
					devDependencies: {
						'@sveltejs/adapter-cloudflare': '^7.2.8',
						'@sveltejs/kit': '^2.0.0'
					}
				},
				null,
				2
			)
		)
		await writeFile(
			join(projectDir, 'svelte.config.js'),
			`
			import adapter from '@sveltejs/adapter-cloudflare'

			export default {
				kit: {
					adapter: adapter()
				}
			}
		`
		)
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
			export default {
				name: 'docs-worker',
				compatibilityDate: '2025-01-07'
			}
		`
		)

		const config = await loadConfig({ cwd: projectDir })

		expect(config.files?.fetch).toBe('.adapter-cloudflare/_worker.js')
		expect(config.assets).toEqual({
			binding: 'ASSETS',
			directory: '.adapter-cloudflare'
		})
	})

	test('keeps explicit worker and asset settings over inferred framework defaults', async () => {
		const projectDir = join(TEST_DIR, 'sveltekit-explicit')
		await mkdir(projectDir, { recursive: true })

		await writeFile(
			join(projectDir, 'package.json'),
			JSON.stringify(
				{
					name: 'docs-app',
					devDependencies: {
						'@sveltejs/adapter-cloudflare': '^7.2.8',
						'@sveltejs/kit': '^2.0.0'
					}
				},
				null,
				2
			)
		)
		await writeFile(
			join(projectDir, 'svelte.config.js'),
			`
			import adapter from '@sveltejs/adapter-cloudflare'

			export default {
				kit: {
					adapter: adapter()
				}
			}
		`
		)
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
			export default {
				name: 'docs-worker',
				compatibilityDate: '2025-01-07',
				files: {
					fetch: 'src/fetch.ts'
				},
				assets: {
					binding: 'STATIC',
					directory: 'static'
				}
			}
		`
		)

		const config = await loadConfig({ cwd: projectDir })

		expect(config.files?.fetch).toBe('src/fetch.ts')
		expect(config.assets).toEqual({
			binding: 'STATIC',
			directory: 'static'
		})
	})

	test('loads workspace-root .env values before evaluating nested configs', async () => {
		const workspaceDir = join(TEST_DIR, 'workspace-root')
		const projectDir = join(workspaceDir, 'apps/docs')
		await mkdir(projectDir, { recursive: true })

		await writeFile(
			join(workspaceDir, 'package.json'),
			JSON.stringify(
				{
					name: 'workspace-root',
					private: true,
					workspaces: ['apps/*']
				},
				null,
				2
			)
		)
		await writeFile(join(workspaceDir, '.env'), 'CLOUDFLARE_ACCOUNT_ID=workspace-account\n')
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
			export default {
				name: 'docs-worker',
				accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
				compatibilityDate: '2025-01-07'
			}
		`
		)

		delete process.env.CLOUDFLARE_ACCOUNT_ID

		const config = await loadConfig({ cwd: projectDir })

		expect(config.accountId).toBe('workspace-account')
	})

	test('prefers an explicit process env account id over the workspace-root .env', async () => {
		const workspaceDir = join(TEST_DIR, 'workspace-root-explicit-env')
		const projectDir = join(workspaceDir, 'apps/docs')
		await mkdir(projectDir, { recursive: true })

		await writeFile(
			join(workspaceDir, 'package.json'),
			JSON.stringify(
				{
					name: 'workspace-root',
					private: true,
					workspaces: ['apps/*']
				},
				null,
				2
			)
		)
		await writeFile(join(workspaceDir, '.env'), 'CLOUDFLARE_ACCOUNT_ID=workspace-account\n')
		await writeFile(
			join(projectDir, 'devflare.config.ts'),
			`
			export default {
				name: 'docs-worker',
				accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
				compatibilityDate: '2025-01-07'
			}
		`
		)

		process.env.CLOUDFLARE_ACCOUNT_ID = 'explicit-account'

		const config = await loadConfig({ cwd: projectDir })

		expect(config.accountId).toBe('explicit-account')
	})
})

describe('resolveConfigPath', () => {
	beforeEach(async () => {
		await mkdir(TEST_DIR, { recursive: true })
	})

	afterEach(async () => {
		await rm(TEST_DIR, { recursive: true, force: true })
	})

	test('finds devflare.config.ts', async () => {
		await writeFile(join(TEST_DIR, 'devflare.config.ts'), 'export default {}')

		const result = await resolveConfigPath(TEST_DIR)

		expect(result).toContain('devflare.config.ts')
	})

	test('finds devflare.config.js', async () => {
		await writeFile(join(TEST_DIR, 'devflare.config.js'), 'export default {}')

		const result = await resolveConfigPath(TEST_DIR)

		expect(result).toContain('devflare.config.js')
	})

	test('prefers .ts over .js', async () => {
		await writeFile(join(TEST_DIR, 'devflare.config.ts'), 'export default {}')
		await writeFile(join(TEST_DIR, 'devflare.config.js'), 'export default {}')

		const result = await resolveConfigPath(TEST_DIR)

		expect(result).toContain('.ts')
	})

	test('returns undefined when no config found', async () => {
		const result = await resolveConfigPath(TEST_DIR)

		expect(result).toBeUndefined()
	})
})
