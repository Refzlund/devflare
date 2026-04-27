import { describe, expect, test } from 'bun:test'
import { isIgnorableMiniflareDisposeError } from '../../../src/bridge/miniflare'

describe('Miniflare instance disposal', () => {
	test('treats already-closed process handles as ignorable dispose errors', () => {
		const error = Object.assign(new Error('bad file descriptor, kill'), {
			code: 'EBADF',
			syscall: 'kill'
		})

		expect(isIgnorableMiniflareDisposeError(error)).toBe(true)
	})

	test('does not hide unrelated dispose errors', () => {
		const error = Object.assign(new Error('permission denied, kill'), {
			code: 'EACCES',
			syscall: 'kill'
		})

		expect(isIgnorableMiniflareDisposeError(error)).toBe(false)
	})
})
