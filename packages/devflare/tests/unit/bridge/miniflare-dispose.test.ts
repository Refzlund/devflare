import { describe, expect, test } from 'bun:test'
import {
	createMiniflareInstanceHandle,
	isIgnorableMiniflareDisposeError
} from '../../../src/bridge/miniflare'

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

	test('allows startup when optional direct-access helpers are missing', async () => {
		const handle = createMiniflareInstanceHandle({
			async dispose() { },
			async getBindings() {
				return { API_TOKEN: 'secret' }
			},
			dispatchFetch() {
				return Promise.resolve(new Response('ok'))
			}
		} as never)

		await expect(handle.getBindings()).resolves.toEqual({ API_TOKEN: 'secret' })
		await expect(handle.getKVNamespace('CACHE')).rejects.toThrow(
			'Miniflare runtime does not expose getKVNamespace'
		)
	})
})
