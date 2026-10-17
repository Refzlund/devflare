import { describe, expect, mock, test } from 'bun:test'
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

	test('forwards warn and error entries to logger.error', () => {
		const log = mock((message: string) => message)
		const error = mock((message: string) => message)

		const forward = createRuntimeLogForwarder({ log, error })
		forward(entry('warn', 'deprecated call'))
		forward(entry('error', 'runtime failure'))

		expect(error.mock.calls.map(([message]) => message)).toEqual([
			'deprecated call',
			'runtime failure'
		])
		expect(log).not.toHaveBeenCalled()
	})
})
