import type { ConfigEnv, Plugin, PluginOption, UserConfig } from 'vite'
import { type DevflareConfig, loadConfig } from '../config'
import { resolveConfigForEnvironment } from '../config/resolve'
import type { ViteProjectDetection } from '../dev-server/vite-utils'
import { type DevflarePluginOptions, devflarePlugin } from './plugin'

const CONFIG_DIR = '.devflare'
const GENERATED_VITE_CONFIG_FILENAME = 'vite.config.mjs'

export interface EffectiveViteProjectDetection extends ViteProjectDetection {
	hasDevflareViteConfig: boolean
	shouldStartVite: boolean
	wantsViteIntegration: boolean
}

export function hasInlineViteConfig(viteConfig: DevflareConfig['vite'] | undefined): boolean {
	return Boolean(viteConfig && Object.keys(viteConfig).length > 0)
}

export function resolveEffectiveViteProject(
	detection: ViteProjectDetection,
	config: DevflareConfig,
	environment?: string
): EffectiveViteProjectDetection {
	const resolvedConfig = resolveConfigForEnvironment(config, environment)
	const hasDevflareConfig = hasInlineViteConfig(resolvedConfig.vite)

	return {
		...detection,
		hasDevflareViteConfig: hasDevflareConfig,
		shouldStartVite: detection.shouldStartVite || hasDevflareConfig,
		wantsViteIntegration: detection.wantsViteIntegration || hasDevflareConfig
	}
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	)
}

function normalizePluginOptions(
	pluginOption: PluginOption | PluginOption[] | undefined
): PluginOption[] {
	if (typeof pluginOption === 'undefined') {
		return []
	}

	return Array.isArray(pluginOption) ? pluginOption : [pluginOption]
}

function removePluginByName(
	pluginOption: PluginOption,
	pluginName: string
): PluginOption | undefined {
	if (Array.isArray(pluginOption)) {
		const filteredPlugins = pluginOption
			.map((nestedPlugin) => removePluginByName(nestedPlugin, pluginName))
			.filter((nestedPlugin): nestedPlugin is PluginOption => typeof nestedPlugin !== 'undefined')

		return filteredPlugins.length > 0 ? filteredPlugins : undefined
	}

	if (!pluginOption || typeof pluginOption === 'boolean' || isPromiseLike(pluginOption)) {
		return pluginOption
	}

	return (pluginOption as Plugin).name === pluginName ? undefined : pluginOption
}

function withInjectedDevflarePlugin(
	config: UserConfig,
	pluginOptions: DevflarePluginOptions
): UserConfig {
	const existingPlugins = normalizePluginOptions(config.plugins)
		.map((pluginOption) => removePluginByName(pluginOption, 'devflare'))
		.filter((pluginOption): pluginOption is PluginOption => typeof pluginOption !== 'undefined')

	return {
		...config,
		plugins: [devflarePlugin(pluginOptions), ...existingPlugins]
	}
}

export async function resolveViteUserConfig(
	configEnv: ConfigEnv,
	options: {
		cwd?: string
		configPath?: string
		environment?: string
		localConfigPath?: string | null
		bridgePort?: number
	} = {}
): Promise<UserConfig> {
	// Lazy-load Vite at call time so Bun-running CLI commands like `devflare deploy`
	// don't eagerly resolve the host app's Vite package during module initialization.
	// The generated Vite config executes this path inside the actual Vite process.
	const { loadConfigFromFile, mergeConfig } = await import('vite')
	const cwd = options.cwd ?? process.cwd()
	const devflareConfig = await loadConfig({
		cwd,
		configFile: options.configPath
	})
	const resolvedDevflareConfig = resolveConfigForEnvironment(devflareConfig, options.environment)
	const inlineViteConfig = (resolvedDevflareConfig.vite ?? {}) as UserConfig

	const localConfig = options.localConfigPath
		? ((await loadConfigFromFile(configEnv, options.localConfigPath, cwd))?.config ?? {})
		: {}

	const mergedConfig = mergeConfig(localConfig, inlineViteConfig)
	const normalizedConfig = mergedConfig.root
		? mergedConfig
		: {
				...mergedConfig,
				root: cwd
			}

	return withInjectedDevflarePlugin(normalizedConfig, {
		configPath: options.configPath,
		environment: options.environment,
		bridgePort: options.bridgePort
	})
}

async function ensureGeneratedConfigDir(cwd: string): Promise<string> {
	const fs = await import('node:fs/promises')
	const { resolve } = await import('pathe')
	const configDir = resolve(cwd, CONFIG_DIR)
	await fs.mkdir(configDir, { recursive: true })

	const gitignorePath = resolve(configDir, '.gitignore')
	try {
		await fs.access(gitignorePath)
	} catch {
		await fs.writeFile(gitignorePath, '*\n', 'utf-8')
	}

	return configDir
}

async function resolveDevflarePackageRoot(currentFilePath: string): Promise<string> {
	const fs = await import('node:fs/promises')
	const { dirname, resolve } = await import('pathe')
	let currentDir = dirname(currentFilePath)

	while (true) {
		const packageJsonPath = resolve(currentDir, 'package.json')

		try {
			const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as {
				name?: string
			}
			if (packageJson.name === 'devflare') {
				return currentDir
			}
		} catch {
			// Keep walking upward until we find the package root.
		}

		const parentDir = dirname(currentDir)
		if (parentDir === currentDir) {
			break
		}

		currentDir = parentDir
	}

	throw new Error('Could not resolve the devflare package root for generated Vite config imports.')
}

async function resolveGeneratedViteImportPath(configDir: string): Promise<string> {
	const { fileURLToPath } = await import('node:url')
	const { extname, normalize, relative, resolve } = await import('pathe')
	const currentFilePath = normalize(fileURLToPath(import.meta.url))
	const currentExtension = extname(currentFilePath)
	const packageRoot = await resolveDevflarePackageRoot(currentFilePath)
	const viteEntryPath = currentFilePath.includes('/dist/')
		? resolve(packageRoot, 'dist/vite/index.js')
		: resolve(packageRoot, `src/vite/index${currentExtension}`)
	const relativeImportPath = relative(configDir, viteEntryPath)

	return relativeImportPath.startsWith('.') ? relativeImportPath : `./${relativeImportPath}`
}

export async function writeGeneratedViteConfig(options: {
	cwd: string
	configPath?: string
	environment?: string
	localConfigPath?: string | null
	bridgePort?: number
}): Promise<string> {
	const fs = await import('node:fs/promises')
	const { resolve } = await import('pathe')
	const configDir = await ensureGeneratedConfigDir(options.cwd)
	const generatedConfigPath = resolve(configDir, GENERATED_VITE_CONFIG_FILENAME)
	const viteImportPath = await resolveGeneratedViteImportPath(configDir)
	const content = `import { defineConfig } from 'vite'
import { resolveViteUserConfig } from ${JSON.stringify(viteImportPath)}

export default defineConfig(async (env) => {
	return await resolveViteUserConfig(env, {
		cwd: ${JSON.stringify(options.cwd)},
		configPath: ${JSON.stringify(options.configPath)},
		environment: ${JSON.stringify(options.environment)},
		localConfigPath: ${JSON.stringify(options.localConfigPath)},
		bridgePort: ${JSON.stringify(options.bridgePort)}
	})
})
`

	await fs.writeFile(generatedConfigPath, content, 'utf-8')
	return generatedConfigPath
}
