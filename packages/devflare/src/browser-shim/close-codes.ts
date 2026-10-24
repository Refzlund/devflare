// =============================================================================
// Relay Close Codes — what one end of a DevTools relay may send the other
// =============================================================================
/*
	Both CDP relays — the binding worker inside workerd, and the shim's own
	websocket server — close one end when the other closes, and used to copy
	the code they were given. The codes a closed socket REPORTS are not all
	codes a socket may SEND, and the two every session produces are reserved:
	1006 (TCP gone with no Close frame) is what workerd reports when Chrome
	exits, and 1005 (a Close frame with no status) is what it reports for
	@cloudflare/puppeteer's disconnect, a bare `ws.close()`. workerd threw
	`Invalid WebSocket close code: 1006.`, the relay logged it, and the other
	end was never closed — so a client with a command in flight waited out
	puppeteer's 180-second protocolTimeout.

	Measured on workerd 1.20261006.1, on a WebSocketPair end and on a socket an
	outgoing fetch upgraded alike, at compatibility dates 2024-01-01 and
	2026-06-28 (tests/helpers/workerd-websocket-close.ts holds the full rule):

	  close()            → sent; the peer reports 1005
	  1000–1003, 1007–1014, 3000–4999 → sent as given
	  1004, 1005, 1006, 1015, < 1000, > 4999 → THROWS
	  1016–2999          → sent by workerd, but the `ws` library fails the
	                       connection on it, as RFC 6455 lets any peer do with
	                       an unassigned code; Chrome was not measured
	  reason > 123 UTF-8 bytes → THROWS at 2026-06-28; at 2024-01-01 it is sent
	                       and the peer fails the connection instead

	→ KEY: relayedClose() is injected into the binding worker's script BY ITS
	  SOURCE (`relayedClose.toString()`), because a workerd script string cannot
	  import. It must stay self-contained: no import, no module constant, no
	  helper outside its own body, or the injected copy throws a ReferenceError
	  at the first close.
	→ GOTCHA: Bun inlines a module-level `const` into the functions that read
	  it, so under Bun a hoisted constant still LOOKS self-contained; rolldown
	  keeps the reference and node then ships the broken copy. The unit test
	  evaluates rolldown's output for exactly that reason.
*/

/** The close one end of a relay sends after the other end reported its own. */
export interface RelayedClose {
	/** The code to send, or `undefined` for a Close frame that carries no status. */
	code?: number
	/** The reason to send, already within 123 UTF-8 bytes. Absent when `code` is. */
	reason?: string
}

/**
 * @description Translate the close one end of a relay reported into a close
 * the other end may send, so relaying it can never throw on a reserved code.
 *
 * - No code, a non-integer, or 1005 (no status received) → no code at all:
 *   the one faithful relay of "no status", since the far end then reports
 *   1005 in turn.
 * - A code RFC 6455's registry assigns for sending (what the `ws` library
 *   accepts on the wire) → itself, reason kept.
 * - Anything else — 1006 above all, a peer gone without a Close frame — →
 *   1011, "the other end failed", naming the original code in the reason.
 *   1011 rather than 1001 because the relay cannot tell an orderly exit from
 *   a crash or a kill, and claims neither.
 *
 * @param code - the code from the closed end's close event
 * @param reason - the reason from the same event; anything not a string is dropped
 * @returns the close to send; a reason is always cut to 123 UTF-8 bytes, on a
 * character boundary
 *
 * @example
 * relayedClose(1006, '') // { code: 1011, reason: 'peer closed with 1006' }
 * relayedClose(1005, '') // {} — send close() with no arguments
 */
export function relayedClose(code: unknown, reason: unknown): RelayedClose {
	if (typeof code !== 'number' || !Number.isInteger(code) || code === 1005) {
		return {}
	}

	const text = typeof reason === 'string' ? reason : ''
	const wireValid =
		(code >= 1000 && code <= 1014 && code !== 1004 && code !== 1006) ||
		(code >= 3000 && code <= 4999)
	const sendCode = wireValid ? code : 1011
	const sendReason = wireValid ? text : `peer closed with ${code}${text ? `: ${text}` : ''}`

	// RFC 6455 §5.5 leaves 123 bytes for a reason once the code is written,
	// and workerd enforces it. Cut per character so a multi-byte one is never split.
	const encoder = new TextEncoder()
	let fitted = ''
	let bytes = 0
	for (const character of sendReason) {
		const size = encoder.encode(character).length
		if (bytes + size > 123) break
		fitted += character
		bytes += size
	}

	return { code: sendCode, reason: fitted }
}
