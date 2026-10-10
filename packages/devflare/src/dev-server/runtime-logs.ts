/**
 * The logger the dev servers hand workerd's output to. Every method is
 * optional; whatever is missing falls back to the console.
 */
export interface RuntimeLogLogger {
	log?(message: string): void
	info?(message: string): void
	error?(message: string): void
}

/**
 * One line of workerd output as Miniflare 5 reports it: workerd runs with
 * structured logging and Miniflare parses each JSON line into this shape.
 */
export interface RuntimeLogEntry {
	/** Milliseconds since the epoch. */
	timestamp: number
	/** `log`, `info`, `debug`, `warn` or `error`. */
	level: string
	/** The text the worker (or workerd) wrote. */
	message: string
}

/**
 * Levels that used to arrive on workerd's stderr (`console.warn`/`console.error`
 * and runtime failures); everything else came on stdout.
 */
const STDERR_LEVELS = new Set(['warn', 'error'])

function writeStdout(logger: RuntimeLogLogger | undefined, message: string): void {
	if (typeof logger?.log === 'function') {
		logger.log(message)
		return
	}

	if (typeof logger?.info === 'function') {
		logger.info(message)
		return
	}

	console.log(message)
}

function writeStderr(logger: RuntimeLogLogger | undefined, message: string): void {
	if (typeof logger?.error === 'function') {
		logger.error(message)
		return
	}

	console.error(message)
}

/**
 * @description Builds Miniflare's `handleStructuredLogs` callback, routing each
 * runtime log line into the dev logger: warnings and errors to `logger.error`,
 * everything else to `logger.log` (or `logger.info`).
 *
 * → Miniflare 4 handed over workerd's raw stdout/stderr streams
 *   (`handleRuntimeStdio`); Miniflare 5 removed that and reports parsed
 *   entries instead. The routing is the same split the two streams made.
 * → GOTCHA: a workerd line that is NOT JSON reaches here as level `log`
 *   whichever stream it came from (Miniflare's `parseStructuredLog` assigns
 *   it), so such a line on stderr now goes to `logger.log`. Nothing in the
 *   entry says which stream it was, so this cannot be undone here; Miniflare's
 *   own default handler routes the same way. Miniflare does lift workerd's
 *   fatal-crash banners and access violations to `error` before they arrive.
 *
 * @param logger - the dev server's logger; console when absent
 * @returns the handler to pass as `handleStructuredLogs`
 */
export function createRuntimeLogForwarder(logger?: RuntimeLogLogger) {
	return ({ level, message }: RuntimeLogEntry): void => {
		if (STDERR_LEVELS.has(level)) {
			writeStderr(logger, message)
			return
		}

		writeStdout(logger, message)
	}
}
