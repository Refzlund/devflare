import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/*
	devflare moved to Miniflare 5 for one fix: cloudflare/workers-sdk#15552.
	Miniflare's SynchronousFetcher (the synchronous host↔worker-thread channel
	behind the bridge's sync calls) signalled "a reply is ready" with a bare
	flag, so a late wake-up for one request could be read as the reply to the
	next and the wrong message was taken off the port. The fix publishes each
	request's GENERATION (`(id + 1) | 0`) and the host waits in receiveReply()
	until it sees its own.

	→ This reads the Miniflare devflare actually RESOLVES, not the range in
	  package.json, so a lockfile or hoisting change that lands an older
	  Miniflare fails here by name rather than as an intermittent wrong reply.
*/

/** The Miniflare entry file devflare resolves from its own package root. */
function readResolvedMiniflareSource(): string {
	const packageRoot = join(import.meta.dir, '..', '..', '..')
	const requireFromDevflare = createRequire(join(packageRoot, 'package.json'))
	return readFileSync(requireFromDevflare.resolve('miniflare'), 'utf8')
}

describe('resolved Miniflare', () => {
	test('carries the SynchronousFetcher generation handshake (cloudflare/workers-sdk#15552)', () => {
		const source = readResolvedMiniflareSource()

		expect(source).toContain('function receiveReply(')
		expect(source).toContain('(id + 1) | 0')
	})
})
