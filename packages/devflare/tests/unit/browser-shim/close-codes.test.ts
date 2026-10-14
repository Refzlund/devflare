import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { relayedClose } from '../../../src/browser-shim/close-codes'
import { isWireValidCloseCode, workerdCloseRefusal } from '../../helpers/workerd-websocket-close'

// relayedClose() decides what a relay sends one end when the other end has
// closed. Its whole job is to never hand a socket a close it will throw on —
// workerd throws on 1006 and 1005, which are what every session reports (a
// Chrome that exits; @cloudflare/puppeteer's bare disconnect), so copying them
// was what left clients hanging for 180 seconds.

describe('relayedClose', () => {
	test.each([undefined, null, Number.NaN, 1000.5])(
		'relays %p — no usable code — as a close with no status',
		(code) => {
			expect(relayedClose(code, 'ignored')).toEqual({})
		}
	)

	// No status in, no status out: the far end reports 1005 just the same.
	test('relays 1005 — no status received — as no status', () => {
		expect(relayedClose(1005, '')).toEqual({})
	})

	test.each([1000, 1001, 1003, 1008, 1011, 1014, 3000, 4000, 4999])(
		'passes %p through with its reason',
		(code) => {
			expect(relayedClose(code, 'bye')).toEqual({ code, reason: 'bye' })
		}
	)

	// 1006 is a peer gone without a Close frame — a crash, a kill, Chrome
	// exiting under a live client. The relay cannot send it, and says the other
	// end failed instead, keeping the original code in the reason.
	test('relays 1006 as 1011, naming the code it replaces', () => {
		expect(relayedClose(1006, 'WebSocket disconnected without sending Close frame.')).toEqual({
			code: 1011,
			reason: 'peer closed with 1006: WebSocket disconnected without sending Close frame.'
		})
		expect(relayedClose(1006, '')).toEqual({ code: 1011, reason: 'peer closed with 1006' })
	})

	// Reserved, out of range, or sendable by workerd but fatal to an RFC 6455
	// peer like Chrome (1016–2999): none may be relayed as-is.
	test.each([0, 999, 1004, 1015, 1016, 2000, 2999, 5000, 65535])('relays %p as 1011', (code) => {
		expect(relayedClose(code, '').code).toBe(1011)
	})

	test('every integer code becomes a close workerd sends and Chrome accepts', () => {
		for (let code = 0; code <= 5001; code += 1) {
			const close = relayedClose(code, 'r')
			expect([code, workerdCloseRefusal(close.code, close.reason)]).toEqual([code, null])
			expect([code, isWireValidCloseCode(close.code)]).toEqual([code, true])
		}
	})

	test('drops a reason that is not a string', () => {
		expect(relayedClose(1000, { not: 'a string' })).toEqual({ code: 1000, reason: '' })
	})

	// 41 three-byte characters are exactly 123 bytes; the prefix pushes them
	// over, and the cut must land between characters, never inside one.
	test('cuts a reason to 123 UTF-8 bytes on a character boundary', () => {
		const close = relayedClose(1006, '€'.repeat(41))
		const bytes = new TextEncoder().encode(close.reason).length

		expect(bytes).toBeLessThanOrEqual(123)
		expect(bytes).toBeGreaterThan(120)
		expect(close.reason?.endsWith('€')).toBe(true)
	})

	test('keeps a reason of exactly 123 bytes whole', () => {
		const reason = 'x'.repeat(123)

		expect(relayedClose(1000, reason)).toEqual({ code: 1000, reason })
	})

	// The binding worker runs this function from its SOURCE, inside a workerd
	// script that can import nothing. Evaluated with no module scope around it,
	// it must still work — a reference to anything outside its body throws at
	// the first close of every relay.
	//
	// → GOTCHA: graded on the ROLLDOWN output, the code the package ships, and
	//   evaluated by the engine directly rather than imported. Bun's transpiler
	//   inlines a module-level `const` into every function that reads it — on
	//   any file it loads, .mjs included — so under Bun a constant hoisted out of
	//   the body still looks self-contained. Rolldown keeps the reference, and
	//   under node the injected copy throws `ReferenceError` in workerd.
	// → MUTANT: hoist the 123 into a module-level constant in close-codes.ts.
	test('runs from its source alone, as the published bundle injects it', async () => {
		const shipped = await bundleWithRolldown('../../../src/browser-shim/close-codes.ts')
		const injected = new Function(
			`return (${shipped.relayedClose.toString()})`
		)() as typeof relayedClose

		expect(injected(1006, 'gone')).toEqual(relayedClose(1006, 'gone'))
		expect(injected(1005, '')).toEqual({})
		expect(injected(1006, '€'.repeat(41))).toEqual(relayedClose(1006, '€'.repeat(41)))
	})
})

/**
 * Bundle one source module with rolldown, as `rolldown.config.ts` builds the
 * package, and evaluate the output WITHOUT importing it — `new Function` hands
 * the text to the engine untouched, where an import would let Bun's transpiler
 * rewrite it first.
 */
async function bundleWithRolldown(
	relativePath: string
): Promise<{ relayedClose: typeof relayedClose }> {
	const { rolldown } = await import('rolldown')
	const bundle = await rolldown({
		input: fileURLToPath(new URL(relativePath, import.meta.url).href),
		platform: 'node'
	})
	const { output } = await bundle.generate({ format: 'cjs' })
	await bundle.close()

	const module = { exports: {} as { relayedClose: typeof relayedClose } }
	new Function('module', 'exports', output[0].code)(module, module.exports)
	return module.exports
}
