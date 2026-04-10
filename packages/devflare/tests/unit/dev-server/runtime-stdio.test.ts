import { describe, expect, mock, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import { createRuntimeStdioForwarder } from '../../../src/dev-server/runtime-stdio'

async function waitForForwarding(): Promise<void> {
	await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
}

describe('createRuntimeStdioForwarder', () => {
	test('forwards stdout lines to logger.log when available', async () => {
		const stdout = new PassThrough()
		const stderr = new PassThrough()
		const log = mock((message: string) => message)
		const error = mock((message: string) => message)

		const forward = createRuntimeStdioForwarder({ log, error })
		forward(stdout, stderr)

		stdout.write('fetch log\nqueue log\n')
		stdout.end()
		stderr.end()

		await waitForForwarding()

		expect(log.mock.calls.map(([message]) => message)).toEqual([
			'fetch log',
			'queue log'
		])
		expect(error).not.toHaveBeenCalled()
	})

	test('falls back to logger.info for stdout when logger.log is unavailable', async () => {
		const stdout = new PassThrough()
		const stderr = new PassThrough()
		const info = mock((message: string) => message)

		const forward = createRuntimeStdioForwarder({ info })
		forward(stdout, stderr)

		stdout.write('worker-only log\n')
		stdout.end()
		stderr.end()

		await waitForForwarding()

		expect(info).toHaveBeenCalledTimes(1)
		expect(info).toHaveBeenCalledWith('worker-only log')
	})

	test('forwards stderr lines to logger.error', async () => {
		const stdout = new PassThrough()
		const stderr = new PassThrough()
		const error = mock((message: string) => message)

		const forward = createRuntimeStdioForwarder({ error })
		forward(stdout, stderr)

		stderr.write('runtime failure\n')
		stdout.end()
		stderr.end()

		await waitForForwarding()

		expect(error).toHaveBeenCalledTimes(1)
		expect(error).toHaveBeenCalledWith('runtime failure')
	})
})