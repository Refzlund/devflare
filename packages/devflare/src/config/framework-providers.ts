import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import type { DevflareConfig } from './schema'

type InferredConfigFragment = Pick<DevflareConfig, 'files' | 'assets'>

interface FrameworkProviderContext {
	cwd: string
	config: DevflareConfig
	configPath: string
}

interface FrameworkProviderResolution {
	id: string
	config: InferredConfigFragment
}

interface FrameworkProvider {
	id: string
	resolve(context: FrameworkProviderContext): Promise<FrameworkProviderResolution | null>
}

/** Where SvelteKit 2 reads its config, adapter included. */
const SVELTE_CONFIG_FILES = [
	'svelte.config.js',
	'svelte.config.mjs',
	'svelte.config.ts',
	'svelte.config.cjs'
] as const

/**
 * Where SvelteKit 3 reads its config: the options of `sveltekit()` in the Vite config. Kit 3
 * refuses a `svelte.config.*` outright, and Kit 2 since 2.62 accepts its config here too.
 */
const VITE_CONFIG_FILES = [
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.cts',
	'vite.config.js',
	'vite.config.mjs',
	'vite.config.cjs'
] as const

async function readTextIfExists(path: string): Promise<string | null> {
	try {
		return await readFile(path, 'utf-8')
	} catch {
		return null
	}
}

async function readPackageDependencies(cwd: string): Promise<Record<string, string> | null> {
	const packageJsonText = await readTextIfExists(join(cwd, 'package.json'))
	if (!packageJsonText) {
		return null
	}

	try {
		const packageJson = JSON.parse(packageJsonText) as {
			dependencies?: Record<string, string>
			devDependencies?: Record<string, string>
			peerDependencies?: Record<string, string>
		}

		return {
			...(packageJson.dependencies ?? {}),
			...(packageJson.devDependencies ?? {}),
			...(packageJson.peerDependencies ?? {})
		}
	} catch {
		return null
	}
}

async function findFirstExistingTextFile(
	cwd: string,
	candidates: readonly string[]
): Promise<string | null> {
	for (const candidate of candidates) {
		const fileText = await readTextIfExists(join(cwd, candidate))
		if (fileText !== null) {
			return fileText
		}
	}

	return null
}

const svelteKitCloudflareProvider: FrameworkProvider = {
	id: 'sveltekit-cloudflare',
	async resolve(context) {
		const dependencies = await readPackageDependencies(context.cwd)
		if (!dependencies?.['@sveltejs/kit'] || !dependencies['@sveltejs/adapter-cloudflare']) {
			return null
		}

		const configTexts = await Promise.all([
			findFirstExistingTextFile(context.cwd, SVELTE_CONFIG_FILES),
			findFirstExistingTextFile(context.cwd, VITE_CONFIG_FILES)
		])
		const configuresAdapter = configTexts.some(
			(text) => text !== null && /@sveltejs\/adapter-cloudflare|adapter-cloudflare/.test(text)
		)
		if (!configuresAdapter) {
			return null
		}

		return {
			id: this.id,
			config: {
				files: {
					fetch: '.adapter-cloudflare/_worker.js'
				},
				assets: {
					binding: 'ASSETS',
					directory: '.adapter-cloudflare'
				}
			}
		}
	}
}

const frameworkProviders: readonly FrameworkProvider[] = [svelteKitCloudflareProvider]

function hasFrameworkInferenceGap(config: DevflareConfig): boolean {
	return (
		config.files?.fetch === undefined ||
		config.assets?.directory === undefined ||
		config.assets?.binding === undefined
	)
}

function mergeInferredConfig(
	config: DevflareConfig,
	inferredConfig: InferredConfigFragment
): DevflareConfig {
	const mergedFiles = inferredConfig.files
		? {
				...inferredConfig.files,
				...(config.files ?? {})
			}
		: config.files

	const mergedAssets = inferredConfig.assets
		? {
				...inferredConfig.assets,
				...(config.assets ?? {})
			}
		: config.assets

	return {
		...config,
		...(mergedFiles && { files: mergedFiles }),
		...(mergedAssets && { assets: mergedAssets })
	}
}

export async function applyFrameworkConfigProviders(
	config: DevflareConfig,
	context: Omit<FrameworkProviderContext, 'config'>
): Promise<DevflareConfig> {
	if (!hasFrameworkInferenceGap(config)) {
		return config
	}

	for (const provider of frameworkProviders) {
		const resolution = await provider.resolve({
			...context,
			config
		})
		if (!resolution) {
			continue
		}

		return mergeInferredConfig(config, resolution.config)
	}

	return config
}
