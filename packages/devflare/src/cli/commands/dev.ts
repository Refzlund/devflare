// =============================================================================
// Dev Command — Development Server
// =============================================================================
//
// Starts a worker-only dev server by default and enables Vite when the current
// package provides a local vite.config.*.
//
// How it works:
// 1. Vite runs in dev mode (full HMR for frontend)
// 2. Miniflare runs with Gateway Worker + DO Workers
// 3. Rolldown watches DO files and rebuilds on change
// 4. When DO files change: Rolldown rebuilds → Miniflare hot reloads via setOptions()
// 5. Bridge connects Node.js/Vite to Miniflare via WebSocket RPC
//
// All bindings work: KV, D1, R2, DOs (including WebSockets), Queues, AI, Browser
//
// Logging Flags:
// - `--log` → Log all output to `.log-{datetime}` file AND terminal
// - `--log-temp` → Log all output to `.log` file (overwritten) AND terminal
// =============================================================================

import { createConsola, type ConsolaInstance } from 'consola'
import { relative, resolve } from 'pathe'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { loadConfig } from '../../config/loader'
import { createDevServer } from '../../dev-server'
import { detectViteProject } from '../../dev-server/vite-utils'
import { resolveEffectiveViteProject } from '../../vite'
import { createCliTheme, cyanBold, dim, logLine, yellow } from '../ui'

// =============================================================================
// Logging System
// =============================================================================

interface LogWriter {
	path: string
	write: (data: string | Buffer, source?: 'vite' | 'miniflare' | 'rolldown') => void
	close: () => void
}

/**
 * Create a log writer that writes to both terminal and file
 */
async function createLogWriter(
	cwd: string,
	options: { log?: boolean; logTemp?: boolean }
): Promise<LogWriter | null> {
	if (!options.log && !options.logTemp) {
		return null
	}

	const fs = await import('node:fs')

	// Determine log file path
	let logPath: string
	if (options.logTemp) {
		logPath = resolve(cwd, '.log')
	} else {
		const now = new Date()
		const timestamp = now.toISOString()
			.replace(/[:.]/g, '-')
			.replace('T', '_')
			.slice(0, 19)
		logPath = resolve(cwd, `.log-${timestamp}`)
	}

	// Open file stream
	const fileStream = fs.createWriteStream(logPath, { flags: 'w' })

	// ANSI escape code regex for stripping colors from file output
	const ansiRegex = /\x1b\[[0-9;]*m/g

	return {
		path: logPath,
		write(data: string | Buffer, source?: 'vite' | 'miniflare' | 'rolldown') {
			const str = typeof data === 'string' ? data : data.toString()
			if (!str.trim()) return

			// Format with source prefix for file
			const timestamp = new Date().toISOString().slice(11, 23)
			const prefix = source ? `[${timestamp}][${source.toUpperCase()}] ` : `[${timestamp}] `

			// Write to file (strip ANSI colors)
			const cleanStr = str.replace(ansiRegex, '')
			fileStream.write(prefix + cleanStr + (cleanStr.endsWith('\n') ? '' : '\n'))
		},
		close() {
			fileStream.end()
		}
	}
}

export async function runDevCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const cwd = options.cwd || (parsed.options.cwd as string) || process.cwd()
	const configPath = parsed.options.config as string | undefined
	const port = parsed.options.port as string | undefined
	const logEnabled = parsed.options.log === true
	const logTempEnabled = parsed.options['log-temp'] === true
	const persistEnabled = parsed.options.persist === true
	const debugEnabled = parsed.options.debug === true || process.env.DEVFLARE_DEBUG === 'true'
	const verbose = parsed.options.verbose === true || debugEnabled
	const theme = createCliTheme(parsed.options)
	const config = await loadConfig({ cwd, configFile: configPath })
	const viteProject = resolveEffectiveViteProject(
		await detectViteProject(cwd),
		config
	)

	// Create log writer if logging is enabled
	const logWriter = await createLogWriter(cwd, {
		log: logEnabled,
		logTemp: logTempEnabled
	})

	if (logWriter) {
		const logFile = relative(cwd, logWriter.path) || '.log'
		logLine(logger, `${dim('logging', theme)} ${logFile}`)
	}

	// Create a custom logger that also writes to file
	const devLogger = createConsola({
		level: verbose ? 4 : 3
	})

	// Wrap logger to also write to file
	if (logWriter) {
		const wrapLog = (original: typeof devLogger.info, prefix = '') => {
			return (message: unknown, ...args: unknown[]) => {
				original(message, ...args)
				const formatted = prefix
					? `${prefix} ${[message, ...args].join(' ')}`
					: [message, ...args].join(' ')
				logWriter.write(formatted)
			}
		}

		// Override methods using Object.assign to preserve 'raw' and other properties
		Object.assign(devLogger.log, wrapLog(devLogger.log.bind(devLogger)))
		Object.assign(devLogger.info, wrapLog(devLogger.info.bind(devLogger)))
		Object.assign(devLogger.error, wrapLog(devLogger.error.bind(devLogger), '[ERROR]'))
		Object.assign(devLogger.warn, wrapLog(devLogger.warn.bind(devLogger), '[WARN]'))
		Object.assign(devLogger.success, wrapLog(devLogger.success.bind(devLogger), '[OK]'))
		Object.assign(devLogger.debug, wrapLog(devLogger.debug.bind(devLogger), '[DEBUG]'))
	}

	try {
		logLine(logger)
		if (viteProject.shouldStartVite) {
			logLine(logger, `${cyanBold('dev', theme)} ${dim('Unified Dev Server', theme)}`)
			logLine(logger, '   ├─ Vite: Full HMR for frontend')
			logLine(logger, '   ├─ Miniflare: All Cloudflare bindings')
			logLine(logger, '   ├─ Rolldown: Worker + DO bundling with watch')
			logLine(logger, '   └─ Bridge: WebSocket RPC connection')
		} else {
			logLine(logger, `${cyanBold('dev', theme)} ${dim('Worker Dev Server', theme)}`)
			logLine(logger, '   ├─ Miniflare: All Cloudflare bindings')
			logLine(logger, '   ├─ Rolldown: Worker + DO bundling with watch')
			logLine(logger, '   └─ Vite: Disabled (no effective Vite config found)')

			if (viteProject.wantsViteIntegration) {
				logger.warn('Vite-related settings were detected, but no effective Vite config was available')
				logger.warn('Skipping Vite startup and running in worker-only mode')
			}
		}
		logLine(logger)

		// Create unified dev server
		const devServer = createDevServer({
			cwd,
			configPath,
			vitePort: port ? parseInt(port, 10) : 5173,
			miniflarePort: 8787,
			enableVite: viteProject.shouldStartVite,
			persist: persistEnabled,
			logger: devLogger,
			verbose,
			debug: debugEnabled
		})

		// Handle graceful shutdown
		let isCleaningUp = false
		const cleanupHandlers = new Map<string, (...args: any[]) => void>()

		const removeCleanupHandlers = () => {
			for (const [event, handler] of cleanupHandlers) {
				process.off(event, handler)
			}
			cleanupHandlers.clear()
		}

		const cleanup = async (exitCode: number, reason?: unknown) => {
			if (isCleaningUp) {
				return
			}

			isCleaningUp = true
			removeCleanupHandlers()

			if (reason) {
				const message = reason instanceof Error
					? reason.stack ?? reason.message
					: String(reason)
				logger.error(message)
			}

			logLine(logger)
			logLine(logger, `${yellow('dev', theme)} ${dim('Shutting down…', theme)}`)

			try {
				await devServer.stop()
			} finally {
				logWriter?.close()
				process.exit(exitCode)
			}
		}

		const registerCleanupHandler = (event: string, handler: (...args: any[]) => void) => {
			cleanupHandlers.set(event, handler)
			process.on(event, handler)
		}

		registerCleanupHandler('SIGINT', () => {
			void cleanup(0)
		})
		registerCleanupHandler('SIGTERM', () => {
			void cleanup(0)
		})
		registerCleanupHandler('SIGHUP', () => {
			void cleanup(0)
		})
		registerCleanupHandler('uncaughtException', (error: unknown) => {
			void cleanup(1, error)
		})
		registerCleanupHandler('unhandledRejection', (reason: unknown) => {
			void cleanup(1, reason)
		})

		// Start the server
		await devServer.start()

		// Keep process running
		await new Promise(() => { })

		return { exitCode: 0 }
	} catch (error) {
		logWriter?.close()
		if (error instanceof Error) {
			logger.error('Dev server failed:', error.message)
			if (verbose) {
				logger.error(error.stack)
			}
		}
		return { exitCode: 1 }
	}
}
