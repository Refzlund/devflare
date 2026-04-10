import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ConsolaInstance } from 'consola'
import { dirname, resolve } from 'pathe'
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

export interface WorkerBundlerOptions {
	cwd: string
	inputFile: string
	outFile: string
	rolldownOptions?: DevflareRolldownOptions
	sourcemap?: boolean
	minify?: boolean
	logger?: ConsolaInstance
}

type ExternalPattern = string | RegExp

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

async function ensureDebugShim(outDir: string): Promise<string> {
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

async function resolveInternalModuleEntry(relativeCandidates: string[]): Promise<string | null> {
	const fs = await import('node:fs/promises')
	const currentFileDir = dirname(fileURLToPath(import.meta.url))

	for (const candidate of relativeCandidates) {
		const absolutePath = resolve(currentFileDir, candidate)
		try {
			await fs.access(absolutePath)
			return absolutePath
		} catch {
			continue
		}
	}

	return null
}

async function resolveInternalAliasMap(outDir: string): Promise<Record<string, string>> {
	const debugShimPath = await ensureDebugShim(outDir)
	const runtimeEntry = await resolveInternalModuleEntry([
		'../runtime/index.ts',
		'../runtime/index.js'
	])
	const packageEntry = await resolveInternalModuleEntry([
		'../browser.ts',
		'../browser.js'
	])

	return {
		debug: debugShimPath,
		...(runtimeEntry ? { 'devflare/runtime': runtimeEntry } : {}),
		...(packageEntry ? { devflare: packageEntry } : {})
	}
}

function resolveWorkerRolldownConfig(options: {
	cwd: string
	inputFile: string
	outFile: string
	alias: Record<string, string>
	rolldownOptions?: DevflareRolldownOptions
	sourcemap?: boolean
	minify?: boolean
}): {
	inputOptions: InputOptions
	outputOptions: OutputOptions
} {
	type SanitizedRolldownOptions = DevflareRolldownOptions &
		Partial<Pick<InputOptions, 'cwd' | 'input' | 'platform' | 'watch'>> & {
			target?: unknown
		}
	type SanitizedRolldownOutputOptions = NonNullable<DevflareRolldownOptions['output']> &
		Partial<Pick<OutputOptions, 'codeSplitting' | 'dir' | 'file' | 'format' | 'inlineDynamicImports'>>

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

	const defaultTsconfigPath = resolve(options.cwd, 'tsconfig.json')

	const defaultExternalModules: ExternalPattern[] = [
		/^cloudflare:/,
		/^node:/,
		'buffer', 'crypto', 'events', 'http', 'https', 'net', 'os', 'path',
		'stream', 'tls', 'url', 'util', 'zlib', 'fs', 'child_process',
		'async_hooks', 'querystring', 'string_decoder', 'assert', 'dns'
	]

	return {
		inputOptions: {
			...userInputOptions,
			input: options.inputFile,
			cwd: options.cwd,
			platform: 'browser',
			...(userTsconfig
				? { tsconfig: userTsconfig }
				: existsSync(defaultTsconfigPath)
					? { tsconfig: defaultTsconfigPath }
					: {}),
			external: mergeExternalOptions(defaultExternalModules, userExternal),
			plugins: mergePluginOptions(createWorkerDynamicImportPlugin(), userPlugins),
			resolve: mergeResolveOptions({
				alias: options.alias
			}, userResolve)
		},
		outputOptions: {
			...safeUserOutputOptions,
			file: options.outFile,
			format: 'esm',
			sourcemap: safeUserOutputOptions.sourcemap ?? options.sourcemap ?? false,
			minify: safeUserOutputOptions.minify ?? options.minify,
			codeSplitting: false
		}
	}
}

export async function bundleWorkerEntry(options: WorkerBundlerOptions): Promise<string> {
	const { rolldown } = await import('rolldown')
	const fs = await import('node:fs/promises')
	const outDir = dirname(options.outFile)

	await fs.mkdir(outDir, { recursive: true })
	await fs.rm(options.outFile, { force: true })
	await fs.rm(`${options.outFile}.map`, { force: true })

	const alias = await resolveInternalAliasMap(outDir)
	const { inputOptions, outputOptions } = resolveWorkerRolldownConfig({
		cwd: options.cwd,
		inputFile: options.inputFile,
		outFile: options.outFile,
		alias,
		rolldownOptions: options.rolldownOptions,
		sourcemap: options.sourcemap,
		minify: options.minify
	})

	options.logger?.debug(`Bundling main worker → ${options.outFile}`)

	const bundle = await rolldown(inputOptions)

	try {
		await bundle.write(outputOptions)
		await assertWorkerBundleHasNoDynamicImports(options.outFile)
	} finally {
		await bundle.close()
	}

	return options.outFile
}