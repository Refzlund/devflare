import { describe, expect, test } from 'bun:test'
import { dispatchFetchToRuntime } from '../../../src/utils/miniflare-dispatch'

/** One captured `dispatchFetch` call. */
interface CapturedDispatch {
	/** The URL Miniflare was asked to fetch. */
	url: string
	/** The init it received. */
	init: {
		method?: string
		headers?: Headers
		body?: ReadableStream | null
		signal?: AbortSignal
		cf?: unknown
	}
}

/** A stand-in Miniflare whose runtime listens on `runtimeUrl`, recording every dispatch. */
function createFakeMiniflare(runtimeUrl: string) {
	const calls: CapturedDispatch[] = []
	const target = {
		ready: Promise.resolve(new URL(runtimeUrl)),
		async dispatchFetch(input: unknown, init?: unknown) {
			calls.push({ url: String(input), init: (init ?? {}) as CapturedDispatch['init'] })
			return new Response('ok')
		}
	}
	return { calls, target: target as unknown as Parameters<typeof dispatchFetchToRuntime>[0] }
}

describe('dispatchFetchToRuntime under Bun', () => {
	test('points the request at the runtime origin, keeping path and query', async () => {
		const { calls, target } = createFakeMiniflare('http://127.0.0.1:61234')

		await dispatchFetchToRuntime(target, 'http://localhost/api/items?page=2')

		expect(calls).toHaveLength(1)
		expect(calls[0]?.url).toBe('http://127.0.0.1:61234/api/items?page=2')
	})

	test('carries the method, headers, body and cf override across the rewrite', async () => {
		const { calls, target } = createFakeMiniflare('http://127.0.0.1:61234')
		const cf = { country: 'DK' }

		await dispatchFetchToRuntime(target, 'https://example.com/upload', {
			method: 'POST',
			headers: { 'x-test': 'yes' },
			body: 'payload',
			cf
		} as unknown as Parameters<typeof dispatchFetchToRuntime>[2])

		const init = calls[0]?.init
		expect(calls[0]?.url).toBe('http://127.0.0.1:61234/upload')
		expect(init?.method).toBe('POST')
		expect(init?.headers?.get('x-test')).toBe('yes')
		expect(await new Response(init?.body ?? null).text()).toBe('payload')
		expect(init?.cf).toBe(cf)
	})

	test("forwards the caller's abort, so a cancelled request stops reaching the runtime", async () => {
		const { calls, target } = createFakeMiniflare('http://127.0.0.1:61234')
		const controller = new AbortController()

		await dispatchFetchToRuntime(target, 'http://localhost/slow', { signal: controller.signal })

		const forwarded = calls[0]?.init.signal
		expect(forwarded?.aborted).toBe(false)
		controller.abort()
		expect(forwarded?.aborted).toBe(true)
	})
})
