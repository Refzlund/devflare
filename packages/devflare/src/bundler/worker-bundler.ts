import { fileURLToPath } from 'node:url'
import type { ConsolaInstance } from 'consola'
import { dirname, resolve } from 'pathe'
import type { DevflareRolldownOptions } from '../config/schema'
import { createWorkerdBundlerDefaults } from './defaults'
import {
	ensureDebugShim,
	resolveWorkerCompatibleRolldownConfig,
	writeWorkerCompatibleBundle
} from './rolldown-shared'

export interface WorkerBundlerOptions {
	cwd: string
	inputFile: string
	outFile: string
	rolldownOptions?: DevflareRolldownOptions
	sourcemap?: boolean
	minify?: boolean
	logger?: ConsolaInstance
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

export async function bundleWorkerEntry(options: WorkerBundlerOptions): Promise<string> {
	const fs = await import('node:fs/promises')
	const outDir = dirname(options.outFile)

	await fs.mkdir(outDir, { recursive: true })
	await fs.rm(options.outFile, { force: true })
	await fs.rm(`${options.outFile}.map`, { force: true })

	const alias = await resolveInternalAliasMap(outDir)
	const defaults = createWorkerdBundlerDefaults()
	const { inputOptions, outputOptions } = resolveWorkerCompatibleRolldownConfig({
		cwd: options.cwd,
		inputFile: options.inputFile,
		outFile: options.outFile,
		alias,
		...defaults,
		platform: 'browser',
		rolldownOptions: options.rolldownOptions,
		sourcemap: options.sourcemap ?? defaults.sourcemap,
		minify: options.minify ?? defaults.minify,
		defaultTsconfigMode: 'if-present'
	})

	options.logger?.debug(`Bundling main worker → ${options.outFile}`)

	await writeWorkerCompatibleBundle({
		inputOptions,
		outputOptions,
		outFile: options.outFile
	})

	return options.outFile
}