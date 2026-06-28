import { existsSync } from 'fs'
import { createServer } from 'net'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { resolveConfigPath } from '../config'

export const DEFAULT_TRANSPORT_ENTRY_FILES = [
	'src/transport.ts',
	'src/transport.js',
	'src/transport.mts',
	'src/transport.mjs'
] as const

const CURRENT_PACKAGE_ROOT = findPackageRoot(dirname(fileURLToPath(import.meta.url)))

/**
 * Access Bun global via globalThis to avoid shadowing richer @types/bun
 * when available. Returns undefined if not running in Bun.
 */
export function getBunRuntime():
	| {
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
	  }
	| undefined {
	const g = globalThis as { Bun?: unknown }
	if (typeof g.Bun === 'object' && g.Bun !== null) {
		return g.Bun as ReturnType<typeof getBunRuntime>
	}

	return undefined
}

/**
 * Get the directory of the test file.
 * Prefers stack trace parsing so bun test hooks resolve the actual test file,
 * then falls back to the current working directory.
 *
 * We intentionally do not use Bun.main here because workspace consumers often
 * import the built devflare package from `packages/devflare/dist`, which would
 * incorrectly anchor autodiscovery inside the devflare package instead of the
 * calling project under test.
 */
export function getCallerDirectory(): string {
	const stackCallerDirectory = getStackCallerDirectory()
	if (stackCallerDirectory) {
		return stackCallerDirectory
	}

	return process.cwd()
}

function getStackCallerDirectory(): string | null {
	const originalPrepare = Error.prepareStackTrace
	Error.prepareStackTrace = (_, stack) => stack

	try {
		const err = new Error()
		const stack = err.stack as unknown as NodeJS.CallSite[] | undefined

		for (const site of stack ?? []) {
			const filename = site.getFileName?.()
			if (
				filename &&
				!isInsideCurrentPackage(filename) &&
				!filename.includes('simple-context') &&
				!filename.includes('node_modules') &&
				!filename.includes('[') &&
				existsSync(filename)
			) {
				return dirname(filename)
			}
		}
	} finally {
		Error.prepareStackTrace = originalPrepare
	}

	return null
}

function findPackageRoot(startDir: string): string {
	let currentDir = startDir

	while (true) {
		if (existsSync(join(currentDir, 'package.json'))) {
			return currentDir
		}

		const parentDir = dirname(currentDir)
		if (parentDir === currentDir) {
			return startDir
		}

		currentDir = parentDir
	}
}

function isInsideCurrentPackage(filePath: string): boolean {
	const normalizedFilePath = filePath.replace(/\\/g, '/')
	const normalizedPackageRoot = CURRENT_PACKAGE_ROOT.replace(/\\/g, '/')

	return (
		normalizedFilePath === normalizedPackageRoot ||
		normalizedFilePath.startsWith(`${normalizedPackageRoot}/`)
	)
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

export function resolveTransportFile(
	configDir: string,
	configuredPath: string | null | undefined
): string | null {
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
