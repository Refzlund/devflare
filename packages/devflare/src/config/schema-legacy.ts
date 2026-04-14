import {
	normalizeRolldownConfig,
	normalizeViteConfig,
	type LegacyBuildConfig,
	type RolldownConfig,
	type ViteConfig
} from './schema-build'

interface LegacyBuildViteFields {
	build?: LegacyBuildConfig
	plugins?: unknown[]
	vite?: ViteConfig
	rolldown?: RolldownConfig
}

export function normalizeLegacyBuildAndViteConfig<TConfig extends LegacyBuildViteFields>(
	config: TConfig
): Omit<TConfig, 'build' | 'plugins' | 'vite' | 'rolldown'> & {
	vite?: ReturnType<typeof normalizeViteConfig>
	rolldown?: ReturnType<typeof normalizeRolldownConfig>
} {
	const normalizedVite = normalizeViteConfig(config.vite, config.plugins)
	const normalizedRolldown = normalizeRolldownConfig(config.rolldown, config.build)
	const {
		build: _legacyBuild,
		plugins: _legacyPlugins,
		vite: _vite,
		rolldown: _rolldown,
		...rest
	} = config

	return {
		...rest,
		...(normalizedVite ? { vite: normalizedVite } : {}),
		...(normalizedRolldown ? { rolldown: normalizedRolldown } : {})
	}
}
