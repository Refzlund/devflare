/*
	────────────────────────────────────────
	   workerd's rule for WebSocket.close()
	────────────────────────────────────────
	What workerd's `WebSocket.close(code, reason)` throws, as a model a unit-test
	double can enforce. Measured on workerd 1.20261006.1 (Miniflare
	5.20261006.1-alpha), identically on a WebSocketPair end and on a socket an
	outgoing `fetch` upgraded, at compatibility dates 2024-01-01 and 2026-06-28.

	→ KEY: tests/integration/shims/browser-binding-close.test.ts sweeps real
	  workerd against this model, so a workerd upgrade that changes the rule fails
	  there by name rather than leaving every double here quietly permissive.
	  The binding worker's `relayedClose` is a SEPARATE statement of the rule on
	  purpose: a double derived from the code it grades could never disagree with it.
	→ GOTCHA: the double's predecessor accepted every code, which is how a relay
	  that copied a peer's 1005/1006 onto the other socket — refused by workerd,
	  so that socket was never closed — passed every unit test.
*/

/** Codes workerd will REPORT in a close event but refuses to SEND. */
const RESERVED_CLOSE_CODES = new Set([1004, 1005, 1006, 1015])

/** workerd's ceiling on a close reason, in UTF-8 bytes (RFC 6455 §5.5's 125 minus the code). */
const MAX_CLOSE_REASON_BYTES = 123

/**
 * @description The message workerd's `close(code, reason)` throws for these
 * arguments, or `null` when it accepts them.
 * @param code - the close code, or `undefined` for a close that sends no status
 * @param reason - the close reason; only its UTF-8 length matters
 * @returns workerd's error message verbatim, or `null`
 *
 * → NOTE: the reason ceiling is enforced from compatibility date 2026-06-28 at
 *   the latest; at 2024-01-01 workerd sent an over-long reason and the peer
 *   failed the connection instead. The stricter behaviour is what is modelled.
 */
export function workerdCloseRefusal(code?: number, reason?: string): string | null {
	if (code === undefined) return null

	if (code < 1000 || code > 4999 || RESERVED_CLOSE_CODES.has(code)) {
		return `Invalid WebSocket close code: ${code}.`
	}

	if (reason !== undefined && new TextEncoder().encode(reason).length > MAX_CLOSE_REASON_BYTES) {
		return 'WebSocket close reason must not be longer than 123 bytes when UTF-8 encoded.'
	}

	return null
}

/**
 * @description Whether an RFC 6455 peer — Chrome, or the `ws` library behind
 * puppeteer-core — accepts this code ON THE WIRE. Narrower than what workerd
 * will send: workerd sends 1016–2999, and such a peer fails the connection on
 * them (measured: the `ws` peer reported 1006, not the code).
 * @param code - a code the relay sent, or `undefined` for no status
 */
export function isWireValidCloseCode(code?: number): boolean {
	if (code === undefined) return true
	return (
		(code >= 1000 && code <= 1014 && !RESERVED_CLOSE_CODES.has(code)) ||
		(code >= 3000 && code <= 4999)
	)
}
