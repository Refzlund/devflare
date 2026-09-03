import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'

export interface RuntimeStdioLogger {
	log?(message: string): void
	info?(message: string): void
	error?(message: string): void
}

function writeStdout(logger: RuntimeStdioLogger | undefined, message: string): void {
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

function writeStderr(logger: RuntimeStdioLogger | undefined, message: string): void {
	if (typeof logger?.error === 'function') {
		logger.error(message)
		return
	}

	console.error(message)
}

export function createRuntimeStdioForwarder(logger?: RuntimeStdioLogger) {
	return (stdout: Readable, stderr: Readable): void => {
		createInterface({ input: stdout }).on('line', (data) => {
			writeStdout(logger, data)
		})

		createInterface({ input: stderr }).on('line', (data) => {
			writeStderr(logger, data)
		})
	}
}
