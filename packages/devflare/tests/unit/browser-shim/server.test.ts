import { describe, test, expect } from 'bun:test'
import {
	DEFAULT_CHROME_FLAGS,
	NO_SANDBOX_FLAGS,
	resolveChromeFlags,
	createDownloadProgressLogger
} from '../../../src/browser-shim/server'

describe('browser-shim chrome flags', () => {
	test('defaults do not include --no-sandbox', () => {
		expect(DEFAULT_CHROME_FLAGS).not.toContain('--no-sandbox')
		expect(DEFAULT_CHROME_FLAGS).not.toContain('--disable-setuid-sandbox')
	})

	test('resolveChromeFlags() returns defaults without sandbox disabling flags', () => {
		const flags = resolveChromeFlags()
		expect(flags).not.toContain('--no-sandbox')
		expect(flags).not.toContain('--disable-setuid-sandbox')
	})

	test('resolveChromeFlags({ allowNoSandbox: false }) omits sandbox disabling flags', () => {
		const flags = resolveChromeFlags({ allowNoSandbox: false })
		expect(flags).not.toContain('--no-sandbox')
		expect(flags).not.toContain('--disable-setuid-sandbox')
	})

	test('resolveChromeFlags({ allowNoSandbox: true }) adds the opt-in flags', () => {
		const flags = resolveChromeFlags({ allowNoSandbox: true })
		for (const flag of NO_SANDBOX_FLAGS) {
			expect(flags).toContain(flag)
		}
		for (const flag of DEFAULT_CHROME_FLAGS) {
			expect(flags).toContain(flag)
		}
	})

	test('core stability flags remain in defaults', () => {
		expect(DEFAULT_CHROME_FLAGS).toContain('--disable-dev-shm-usage')
		expect(DEFAULT_CHROME_FLAGS).toContain('--disable-gpu')
		expect(DEFAULT_CHROME_FLAGS).toContain('--mute-audio')
	})
})

describe('browser-shim download progress logger', () => {
	function makeLogger() {
		const lines: Array<{ level: string; msg: string }> = []
		const record = (level: string) => (msg: unknown) => {
			lines.push({ level, msg: String(msg) })
		}
		const logger = {
			info: record('info'),
			warn: record('warn'),
			error: record('error'),
			debug: record('debug'),
			success: record('success')
		} as unknown as Parameters<typeof createDownloadProgressLogger>[0]
		return { logger, lines }
	}

	test('emits exactly one "download complete" line for a full progress stream', () => {
		const { logger, lines } = makeLogger()
		const tracker = createDownloadProgressLogger(logger, 'Chrome')

		tracker.onProgress(0, 100)
		tracker.onProgress(25, 100)
		tracker.onProgress(50, 100)
		tracker.onProgress(100, 100)
		// Extra post-complete call should be ignored.
		tracker.onProgress(100, 100)

		const completeLines = lines.filter((l) => l.msg.includes('download complete'))
		expect(completeLines.length).toBe(1)
		expect(tracker.completed).toBe(true)
		expect(tracker.progress).toEqual({ bytesReceived: 100, totalBytes: 100 })
	})

	test('emits exactly one start line regardless of tick count', () => {
		const { logger, lines } = makeLogger()
		const tracker = createDownloadProgressLogger(logger, 'Chrome')

		for (let i = 0; i <= 100; i += 1) {
			tracker.onProgress(i, 100)
		}

		const startLines = lines.filter((l) => l.msg.includes('Downloading Chrome'))
		const completeLines = lines.filter((l) => l.msg.includes('download complete'))
		expect(startLines.length).toBe(1)
		expect(completeLines.length).toBe(1)
	})

	test('finalize() completes a dangling in-progress download exactly once', () => {
		const { logger, lines } = makeLogger()
		const tracker = createDownloadProgressLogger(logger, 'Chrome')

		tracker.onProgress(10, 0) // totalBytes unknown
		tracker.finalize()
		tracker.finalize() // second call is a no-op

		const completeLines = lines.filter((l) => l.msg.includes('download complete'))
		expect(completeLines.length).toBe(1)
	})

	test('finalize() is a no-op when nothing was downloaded', () => {
		const { logger, lines } = makeLogger()
		const tracker = createDownloadProgressLogger(logger, 'Chrome')

		tracker.finalize()

		expect(lines.length).toBe(0)
		expect(tracker.started).toBe(false)
		expect(tracker.completed).toBe(false)
	})
})
