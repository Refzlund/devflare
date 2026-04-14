import { existsSync } from 'fs'
import { createServer } from 'net'
import { dirname, join } from 'path'
import { resolveConfigPath } from '../config'

export const DEFAULT_TRANSPORT_ENTRY_FILES = [
	'src/transport.ts',
	'src/transport.js',
	'src/transport.mts',
	'src/transport.mjs'
] as const

/**
 * Access Bun global via globalThis to avoid shadowing richer @types/bun
 * when available. Returns undefined if not running in Bun.
 */
export function getBunRuntime(): {
	main: string
	build: (options: {
		entrypoints: string[]
		target: string
		format: string
		minify: boolean
		external?: string[]
	}) => Promise<{
		success: boolean
		logs: string[]
		outputs: Array<{ path: string; text: () => Promise<string> }>
	}>
} | undefined {
	const g = globalThis as { Bun?: unknown }
	if (typeof g.Bun === 'object' && g.Bun !== null) {
		return g.Bun as ReturnType<typeof getBunRuntime>
	}

	return undefined
}

/**
 * Get the directory of the test file.
 * Uses Bun.main for bun test, falls back to stack trace parsing.
 */
export function getCallerDirectory(): string {
	const bun = getBunRuntime()
	if (bun?.main) {
		const mainPath = bun.main
		if (!mainPath.includes('[') && existsSync(mainPath)) {
			return dirname(mainPath)
		}
	}

	const originalPrepare = Error.prepareStackTrace
	Error.prepareStackTrace = (_, stack) => stack
	const err = new Error()
	const stack = err.stack as unknown as NodeJS.CallSite[]
	Error.prepareStackTrace = originalPrepare

	for (const site of stack) {
		const filename = site.getFileName?.()
		if (
			filename
			&& !filename.includes('simple-context')
			&& !filename.includes('node_modules')
			&& !filename.includes('[')
			&& existsSync(filename)
		) {
			return dirname(filename)
		}
	}

	return process.cwd()
}

/**
 * Find the nearest supported devflare config by searching upward from startDir.
 */
export async function findNearestConfig(startDir: string): Promise<string | null> {
	let currentDir = startDir

	while (true) {
		const configPath = await resolveConfigPath(currentDir)
		if (configPath) {
			return configPath
		}

		const parentDir = dirname(currentDir)
		if (parentDir === currentDir) {
			return null
		}

		currentDir = parentDir
	}
}

export async function getAvailablePort(): Promise<number> {
	return await new Promise((resolvePort, reject) => {
		const server = createServer()

		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (!address || typeof address === 'string') {
				server.close(() => reject(new Error('Could not determine an available port')))
				return
			}

			const { port } = address
			server.close((error) => {
				if (error) {
					reject(error)
					return
				}

				resolvePort(port)
			})
		})
	})
}

export function resolveTransportFile(configDir: string, configuredPath: string | null | undefined): string | null {
	if (typeof configuredPath === 'string') {
		return configuredPath
	}

	if (configuredPath === null) {
		return null
	}

	for (const defaultEntry of DEFAULT_TRANSPORT_ENTRY_FILES) {
		if (existsSync(join(configDir, defaultEntry))) {
			return defaultEntry
		}
	}

	return null
}
