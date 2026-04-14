import { existsSync } from 'node:fs'
import { resolve } from 'pathe'
import type {
	ExternalOption,
	InputOptions,
	OutputOptions,
	RolldownPluginOption
} from 'rolldown'
import type { DevflareRolldownOptions } from '../config/schema'
import {
	assertWorkerBundleHasNoDynamicImports,
	createWorkerDynamicImportPlugin
} from './worker-compat'

type ExternalPattern = string | RegExp

type SanitizedRolldownOptions = DevflareRolldownOptions &
	Partial<Pick<InputOptions, 'cwd' | 'input' | 'platform' | 'watch'>> & {
		target?: unknown
	}

type SanitizedRolldownOutputOptions = NonNullable<DevflareRolldownOptions['output']> &
	Partial<Pick<OutputOptions, 'codeSplitting' | 'dir' | 'file' | 'format' | 'inlineDynamicImports'>>

const DEFAULT_EXTERNAL_MODULES: ExternalPattern[] = [
	/^cloudflare:/,
	/^node:/,
	'buffer', 'crypto', 'events', 'http', 'https', 'net', 'os', 'path',
	'stream', 'tls', 'url', 'util', 'zlib', 'fs', 'child_process',
	'async_hooks', 'querystring', 'string_decoder', 'assert', 'dns'
]

function toArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value]
}

function matchesExternalPattern(pattern: ExternalPattern, id: string): boolean {
	if (pattern instanceof RegExp) {
		pattern.lastIndex = 0
		return pattern.test(id)
	}

	return pattern === id
}

function matchesExternalOption(
	option: ExternalOption | undefined,
	id: string,
	parentId: string | undefined,
	isResolved: boolean
): boolean {
	if (!option) {
		return false
	}

	if (typeof option === 'function') {
		return option(id, parentId, isResolved) ?? false
	}

	return toArray(option).some((pattern) => matchesExternalPattern(pattern, id))
}

function mergeExternalOptions(
	base: ExternalOption | undefined,
	user: ExternalOption | undefined
): ExternalOption | undefined {
	if (!base) {
		return user
	}

	if (!user) {
		return base
	}

	if (typeof base !== 'function' && typeof user !== 'function') {
		return [...toArray(base), ...toArray(user)]
	}

	return (id, parentId, isResolved) => {
		return matchesExternalOption(base, id, parentId, isResolved)
			|| matchesExternalOption(user, id, parentId, isResolved)
			|| false
	}
}

function mergePluginOptions(
	base: RolldownPluginOption | undefined,
	user: RolldownPluginOption | undefined
): RolldownPluginOption | undefined {
	if (!base) {
		return user
	}

	if (!user) {
		return base
	}

	return [base, user]
}

function mergeResolveOptions(
	base: InputOptions['resolve'] | undefined,
	user: InputOptions['resolve'] | undefined
): InputOptions['resolve'] | undefined {
	if (!base) {
		return user
	}

	if (!user) {
		return base
	}

	return {
		...user,
		...base,
		alias: {
			...(user.alias ?? {}),
			...(base.alias ?? {})
		}
	}
}

function resolveTsconfigOption(options: {
	cwd: string
	userTsconfig: InputOptions['tsconfig']
	defaultMode: 'always' | 'if-present'
}): Pick<InputOptions, 'tsconfig'> | {} {
	if (options.userTsconfig) {
		return { tsconfig: options.userTsconfig }
	}

	const defaultTsconfigPath = resolve(options.cwd, 'tsconfig.json')
	if (options.defaultMode === 'always' || existsSync(defaultTsconfigPath)) {
		return { tsconfig: defaultTsconfigPath }
	}

	return {}
}

export async function ensureDebugShim(outDir: string): Promise<string> {
	const fs = await import('node:fs/promises')
	const debugShimCode = `
// Debug module shim for local development
const createDebug = (namespace) => {
	const logger = (...args) => {
		if (createDebug.enabled) console.debug(\`[\${namespace}]\`, ...args)
	}
	logger.enabled = false
	logger.namespace = namespace
	logger.extend = (sub) => createDebug(\`\${namespace}:\${sub}\`)
	return logger
}
createDebug.enabled = false
createDebug.formatters = {}
export default createDebug
`
	const debugShimPath = resolve(outDir, '_debug_shim.js')
	await fs.writeFile(debugShimPath, debugShimCode, 'utf-8')
	return debugShimPath
}

export function resolveWorkerCompatibleRolldownConfig(options: {
	cwd: string
	inputFile: string
	outFile: string
	platform: InputOptions['platform']
	alias?: Record<string, string>
	rolldownOptions?: DevflareRolldownOptions
	sourcemap?: boolean
	minify?: boolean
	inlineDynamicImports?: boolean
	defaultTsconfigMode: 'always' | 'if-present'
}): {
	inputOptions: InputOptions
	outputOptions: OutputOptions
} {
	const {
		output: userOutputOptions,
		input: _ignoredInput,
		cwd: _ignoredCwd,
		platform: _ignoredPlatform,
		target: _ignoredTarget,
		watch: _ignoredWatch,
		external: userExternal,
		plugins: userPlugins,
		resolve: userResolve,
		tsconfig: userTsconfig,
		...userInputOptions
	} = (options.rolldownOptions ?? {}) as SanitizedRolldownOptions

	const {
		codeSplitting: _ignoredCodeSplitting,
		dir: _ignoredDir,
		file: _ignoredFile,
		format: _ignoredFormat,
		inlineDynamicImports: _ignoredInlineDynamicImports,
		...safeUserOutputOptions
	} = (userOutputOptions ?? {}) as SanitizedRolldownOutputOptions

	return {
		inputOptions: {
			...userInputOptions,
			input: options.inputFile,
			cwd: options.cwd,
			platform: options.platform,
			...resolveTsconfigOption({
				cwd: options.cwd,
				userTsconfig,
				defaultMode: options.defaultTsconfigMode
			}),
			external: mergeExternalOptions(DEFAULT_EXTERNAL_MODULES, userExternal),
			plugins: mergePluginOptions(createWorkerDynamicImportPlugin(), userPlugins),
			resolve: mergeResolveOptions(
				options.alias
					? {
						alias: options.alias
					}
					: undefined,
				userResolve
			)
		},
		outputOptions: {
			...safeUserOutputOptions,
			file: options.outFile,
			format: 'esm',
			sourcemap: safeUserOutputOptions.sourcemap ?? options.sourcemap ?? false,
			minify: safeUserOutputOptions.minify ?? options.minify,
			codeSplitting: false,
			...(options.inlineDynamicImports !== undefined
				? { inlineDynamicImports: options.inlineDynamicImports }
				: {})
		}
	}
}

export async function writeWorkerCompatibleBundle(options: {
	inputOptions: InputOptions
	outputOptions: OutputOptions
	outFile: string
}): Promise<void> {
	const { rolldown } = await import('rolldown')
	const bundle = await rolldown(options.inputOptions)

	try {
		await bundle.write(options.outputOptions)
		await assertWorkerBundleHasNoDynamicImports(options.outFile)
	} finally {
		await bundle.close()
	}
}