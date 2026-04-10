import { describe, expect, mock, test } from 'bun:test'
import {
	createCompatibilityAwareMiniflareLog,
	formatCompatibilityDateFallbackNotice
} from '../../../src/dev-server/miniflare-log'

const rawCompatibilityWarning = [
	'The latest compatibility date supported by the installed Cloudflare Workers Runtime is ',
	'\u001b[1m"2026-03-17"\u001b[22m',
	',\n',
	'but you\'ve requested ',
	'\u001b[1m"2026-03-28"\u001b[22m',
	'. Falling back to ',
	'\u001b[1m"2026-03-17"\u001b[22m',
	'...'
].join('')

const friendlyCompatibilityNotice =
	'Using latest supported Cloudflare Workers Runtime compatibility date 2026-03-17 (requested 2026-03-28)'

class FakeMiniflareLog {
	readonly warnings: string[] = []
	readonly infos: string[] = []

	constructor(readonly level?: number) { }

	warn(message: string): void {
		this.warnings.push(message)
	}

	info(message: string): void {
		this.infos.push(message)
	}
}

describe('formatCompatibilityDateFallbackNotice', () => {
	test('rewrites Miniflare compatibility fallbacks into a shorter notice', () => {
		expect(formatCompatibilityDateFallbackNotice(rawCompatibilityWarning)).toBe(friendlyCompatibilityNotice)
	})

	test('returns null for unrelated warnings', () => {
		expect(formatCompatibilityDateFallbackNotice('A different Miniflare warning')).toBeNull()
	})
})

describe('createCompatibilityAwareMiniflareLog', () => {
	test('routes compatibility fallbacks through the provided logger', () => {
		const info = mock((message: string) => message)
		const log = createCompatibilityAwareMiniflareLog(FakeMiniflareLog, 4, { info })

		log.warn(rawCompatibilityWarning)

		expect(info).toHaveBeenCalledTimes(1)
		expect(info).toHaveBeenCalledWith(friendlyCompatibilityNotice)
		expect(log.warnings).toEqual([])
		expect(log.infos).toEqual([])
	})

	test('falls back to info logging when no Devflare logger is provided', () => {
		const log = createCompatibilityAwareMiniflareLog(FakeMiniflareLog, 4)

		log.warn(rawCompatibilityWarning)

		expect(log.warnings).toEqual([])
		expect(log.infos).toEqual([friendlyCompatibilityNotice])
	})

	test('passes through unrelated warnings untouched', () => {
		const log = createCompatibilityAwareMiniflareLog(FakeMiniflareLog, 4)

		log.warn('A different Miniflare warning')

		expect(log.warnings).toEqual(['A different Miniflare warning'])
		expect(log.infos).toEqual([])
	})
})