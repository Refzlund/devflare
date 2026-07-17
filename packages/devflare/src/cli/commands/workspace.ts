// =============================================================================
// Workspace Command — shared multi-app dev runtime
// =============================================================================
//
// `devflare workspace dev` co-hosts every app in a `devflare.workspace.ts`
// manifest inside ONE Miniflare instance so they share live binding state
// (D1/KV/R2/DO) in dev, while each app keeps its own browser origin via a
// direct socket. Opt-in; the per-app `devflare dev` path is unchanged.
// =============================================================================

import { type ConsolaInstance, createConsola } from 'consola'
import { loadWorkspaceManifest } from '../../config/workspace'
import { createWorkspaceDevServer } from '../../dev-server/workspace/server'
import type { CliOptions, CliResult, ParsedArgs } from '../index'
import { createCliTheme, cyanBold, dim, logLine, yellow } from '../ui'

/**
 * Run the `workspace` command. Only the `dev` subcommand exists today; any
 * other (or missing) subcommand prints guidance and exits non-zero.
 */
export async function runWorkspaceCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const subcommand = parsed.args[0] ?? 'dev'
	if (subcommand !== 'dev') {
		logger.error(`Unknown workspace subcommand: ${subcommand}`)
		logger.info('Usage: devflare workspace dev')
		return { exitCode: 1 }
	}

	const cwd = options.cwd || (parsed.options.cwd as string) || process.cwd()
	const configFile = parsed.options.config as string | undefined
	// `--persist` is the default here (migrations + shared state want durability);
	// `--no-persist` opts out. `parseArgs` maps `--no-persist` to `{ 'no-persist': true }`.
	const persist = parsed.options['no-persist'] !== true
	const debugEnabled = parsed.options.debug === true || process.env.DEVFLARE_DEBUG === 'true'
	const verbose = parsed.options.verbose === true || debugEnabled
	const theme = createCliTheme(parsed.options)

	const devLogger = createConsola({ level: verbose ? 4 : 3 })

	let loaded: Awaited<ReturnType<typeof loadWorkspaceManifest>>
	try {
		loaded = await loadWorkspaceManifest({ cwd, configFile })
	} catch (error) {
		logger.error(error instanceof Error ? error.message : String(error))
		return { exitCode: 1 }
	}

	logLine(logger)
	logLine(logger, `${cyanBold('workspace', theme)} ${dim('Shared Dev Runtime', theme)}`)
	logLine(logger, '   ├─ One Miniflare: live-shared D1/KV/R2/Durable Objects')
	logLine(logger, '   ├─ Per-app direct sockets: cross-origin preserved')
	logLine(logger, `   └─ ${loaded.manifest.apps.length} app(s) from the workspace manifest`)
	logLine(logger)

	const devServer = createWorkspaceDevServer({
		manifest: loaded.manifest,
		manifestDir: loaded.manifestDir,
		persist,
		logger: devLogger,
		verbose,
		debug: debugEnabled
	})

	// --- graceful shutdown (mirrors the single-app dev command) ---------------
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
			const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
			logger.error(message)
		}

		logLine(logger)
		logLine(logger, `${yellow('workspace', theme)} ${dim('Shutting down…', theme)}`)

		try {
			await devServer.stop()
		} finally {
			process.exit(exitCode)
		}
	}

	const registerCleanupHandler = (event: string, handler: (...args: any[]) => void) => {
		cleanupHandlers.set(event, handler)
		process.on(event, handler)
	}

	registerCleanupHandler('SIGINT', () => void cleanup(0))
	registerCleanupHandler('SIGTERM', () => void cleanup(0))
	registerCleanupHandler('SIGHUP', () => void cleanup(0))
	registerCleanupHandler('uncaughtException', (error: unknown) => void cleanup(1, error))
	registerCleanupHandler('unhandledRejection', (reason: unknown) => void cleanup(1, reason))

	try {
		await devServer.start()

		// Keep the process alive until a signal arrives.
		await new Promise(() => {})
		return { exitCode: 0 }
	} catch (error) {
		if (error instanceof Error) {
			logger.error('Workspace dev server failed:', error.message)
			if (verbose) {
				logger.error(error.stack)
			}
		}
		await devServer.stop().catch(() => {})
		return { exitCode: 1 }
	}
}
