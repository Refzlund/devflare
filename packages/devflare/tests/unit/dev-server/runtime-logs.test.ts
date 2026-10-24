import { describe, expect, mock, spyOn, test } from 'bun:test'
import { createRuntimeLogForwarder } from '../../../src/dev-server/runtime-logs'

function entry(level: string, message: string) {
	return { timestamp: Date.now(), level, message }
}

describe('createRuntimeLogForwarder', () => {
	test('forwards log and info entries to logger.log when available', () => {
		const log = mock((message: string) => message)
		const error = mock((message: string) => message)

		const forward = createRuntimeLogForwarder({ log, error })
		forward(entry('log', 'fetch log'))
		forward(entry('info', 'queue log'))

		expect(log.mock.calls.map(([message]) => message)).toEqual(['fetch log', 'queue log'])
		expect(error).not.toHaveBeenCalled()
	})

	test('falls back to logger.info when logger.log is unavailable', () => {
		const info = mock((message: string) => message)

		createRuntimeLogForwarder({ info })(entry('log', 'worker-only log'))

		expect(info).toHaveBeenCalledTimes(1)
		expect(info).toHaveBeenCalledWith('worker-only log')
	})

	// A worker's `console.warn` is a warning, and the dev log must say so: it
	// used to reach `logger.error` with the errors, so every warning printed as
	// ` ERROR `.
	//
	// → MUTANT: route `warn` to `logger.error` again. `error` receives
	//   'deprecated call' and `warn` receives nothing.
	test('forwards warn entries to logger.warn and error entries to logger.error', () => {
		const log = mock((message: string) => message)
		const warn = mock((message: string) => message)
		const error = mock((message: string) => message)

		const forward = createRuntimeLogForwarder({ log, warn, error })
		forward(entry('warn', 'deprecated call'))
		forward(entry('error', 'runtime failure'))

		expect(warn.mock.calls.map(([message]) => message)).toEqual(['deprecated call'])
		expect(error.mock.calls.map(([message]) => message)).toEqual(['runtime failure'])
		expect(log).not.toHaveBeenCalled()
	})

	// A logger without `warn` must not promote a warning to an error either.
	test('falls back to console.warn when the logger has no warn', () => {
		const error = mock((message: string) => message)
		const consoleWarn = spyOn(console, 'warn').mockImplementation(() => {})

		try {
			createRuntimeLogForwarder({ error })(entry('warn', 'deprecated call'))

			expect(consoleWarn).toHaveBeenCalledWith('deprecated call')
			expect(error).not.toHaveBeenCalled()
		} finally {
			consoleWarn.mockRestore()
		}
	})
})
