/**
 * The logger the dev servers hand workerd's output to. Every method is
 * optional; whatever is missing falls back to the console.
 */
export interface RuntimeLogLogger {
	log?(message: string): void
	info?(message: string): void
	warn?(message: string): void
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

/*
	One writer per severity: each sends the line to the logger's method for it,
	and to the console's when the logger has none. `log` and `info` share a
	writer, preferring `logger.log`.
*/

function writeInfo(logger: RuntimeLogLogger | undefined, message: string): void {
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

function writeWarn(logger: RuntimeLogLogger | undefined, message: string): void {
	if (typeof logger?.warn === 'function') {
		logger.warn(message)
		return
	}

	console.warn(message)
}

function writeError(logger: RuntimeLogLogger | undefined, message: string): void {
	if (typeof logger?.error === 'function') {
		logger.error(message)
		return
	}

	console.error(message)
}

/**
 * @description Builds Miniflare's `handleStructuredLogs` callback, routing each
 * runtime log line into the dev logger at its own level: `error` to
 * `logger.error`, `warn` to `logger.warn`, everything else to `logger.log`
 * (or `logger.info`).
 *
 * → Each level keeps its own severity. Warnings once arrived on workerd's
 *   stderr with the errors, and were routed to `logger.error` for that reason,
 *   so every `console.warn` a worker made printed as ` ERROR ` in the dev log.
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
		if (level === 'error') {
			writeError(logger, message)
			return
		}

		if (level === 'warn') {
			writeWarn(logger, message)
			return
		}

		writeInfo(logger, message)
	}
}
