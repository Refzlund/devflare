import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
	createDnsRecord,
	createEmailRoutingRule,
	enableEmailRouting,
	getEmailRoutingCatchAll,
	getEmailRoutingSettings,
	listDnsRecords,
	listEmailRoutingRules,
	resolveZone,
	setEmailRoutingCatchAll,
	updateDnsRecord
} from '../../../src/cloudflare/zone-resources'
import { jsonResponse } from '../../helpers/cloudflare-api'

/*
	The HTTP layer only: which URL each call reaches and what body it sends. The reconciler's logic
	is tested with injected mocks in `tests/unit/config/deploy-zones.test.ts` — the split matters,
	because a zone path that goes to the wrong URL and a reconciler that decides the wrong thing look
	identical from the outside and are fixed in different files.
*/

const originalFetch = globalThis.fetch
const originalToken = process.env.CLOUDFLARE_API_TOKEN

/** Every request this test saw, so a body or a URL can be asserted after the fact. */
let seen: { url: string; method: string; body: unknown }[]

beforeEach(() => {
	seen = []
	process.env.CLOUDFLARE_API_TOKEN = 'test-token'
})

afterEach(() => {
	globalThis.fetch = originalFetch
	if (originalToken === undefined) {
		delete process.env.CLOUDFLARE_API_TOKEN
	} else {
		process.env.CLOUDFLARE_API_TOKEN = originalToken
	}
})

/** Answer every request with `result`, recording what was asked. `result` may vary by URL. */
function respond(result: unknown | ((url: string) => unknown)) {
	globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		seen.push({
			url,
			method: init?.method ?? 'GET',
			body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
		})
		return jsonResponse(
			typeof result === 'function' ? (result as (u: string) => unknown)(url) : result
		)
	}) as unknown as typeof fetch
}

describe('resolveZone — finding the zone that governs a domain', () => {
	test('an apex domain resolves to its own zone, and is not a subdomain', async () => {
		respond([{ id: 'zone_1', name: 'example.com' }])

		const zone = await resolveZone('example.com', 'acct_1')

		expect(zone).toEqual({
			id: 'zone_1',
			name: 'example.com',
			domain: 'example.com',
			isSubdomain: false
		})
		expect(seen[0]?.url).toContain('/zones?name=example.com&account.id=acct_1')
	})

	test('a SUBDOMAIN walks up to its parent zone and is flagged as one', async () => {
		// The load-bearing behaviour. Cloudflare returns nothing for `mail.example.com` even when mail
		// for it is fully configured, because the zone is `example.com`. Without the walk this reads as
		// "the domain does not exist", which sends the reader to their DNS provider instead of here.
		respond((url) =>
			url.includes('name=example.com&') ? [{ id: 'zone_1', name: 'example.com' }] : []
		)

		const zone = await resolveZone('mail.example.com', 'acct_1')

		expect(zone).toEqual({
			id: 'zone_1',
			name: 'example.com',
			domain: 'mail.example.com',
			isSubdomain: true
		})
		// Longest first: it asked about the subdomain before falling back to the apex.
		expect(seen[0]?.url).toContain('name=mail.example.com')
		expect(seen[1]?.url).toContain('name=example.com')
	})

	test('an exact zone for the subdomain WINS over its parent', async () => {
		// A customer who really does have a zone for `mail.example.com` must land on it rather than
		// silently writing their records into the parent.
		respond([{ id: 'zone_sub', name: 'mail.example.com' }])

		const zone = await resolveZone('mail.example.com', 'acct_1')

		expect(zone.id).toBe('zone_sub')
		expect(zone.isSubdomain).toBe(false)
		expect(seen).toHaveLength(1)
	})

	test('no zone anywhere up the chain throws, naming the domain and the fix', async () => {
		respond([])

		const failure = resolveZone('mail.example.com', 'acct_1')

		await expect(failure).rejects.toThrow(/No Cloudflare zone found for "mail\.example\.com"/)
		// It stopped at the two-label parent rather than asking about the bare TLD.
		expect(seen.map((request) => request.url).join(' ')).not.toContain('name=com&')
	})

	test('a domain is URL-encoded rather than pasted into the query', async () => {
		respond([{ id: 'zone_1', name: 'exa mple.com' }])

		await resolveZone('exa mple.com', 'acct/1')

		expect(seen[0]?.url).toContain('name=exa%20mple.com')
		expect(seen[0]?.url).toContain('account.id=acct%2F1')
	})
})

describe('email routing and DNS reach the right zone-scoped paths', () => {
	test('a rule is POSTed to the zone rules collection, body intact', async () => {
		respond({ tag: 'rule_1' })

		await createEmailRoutingRule('zone_1', {
			name: 'devflare: support@example.com',
			enabled: true,
			priority: 1,
			matchers: [{ type: 'literal', field: 'to', value: 'support@example.com' }],
			actions: [{ type: 'worker', value: ['api'] }]
		})

		expect(seen[0]?.method).toBe('POST')
		expect(seen[0]?.url).toContain('/zones/zone_1/email/routing/rules')
		expect(seen[0]?.body).toEqual({
			name: 'devflare: support@example.com',
			enabled: true,
			priority: 1,
			matchers: [{ type: 'literal', field: 'to', value: 'support@example.com' }],
			actions: [{ type: 'worker', value: ['api'] }]
		})
	})

	test('the catch-all is a PUT to its OWN path, not a rule in the collection', async () => {
		// There is exactly one per zone and it cannot be created or deleted, only changed — so posting
		// it to the rules collection would add a second all-matcher rule rather than set the catch-all.
		respond({ tag: 'catch_all' })

		await setEmailRoutingCatchAll('zone_1', {
			matchers: [{ type: 'all' }],
			actions: [{ type: 'drop' }]
		})

		expect(seen[0]?.method).toBe('PUT')
		expect(seen[0]?.url).toEndWith('/zones/zone_1/email/routing/rules/catch_all')
	})

	test('a DNS lookup filters by type AND name, both encoded', async () => {
		respond([])

		await listDnsRecords('zone_1', { type: 'TXT', name: '_dmarc.example.com' })

		expect(seen[0]?.url).toContain('/zones/zone_1/dns_records?')
		expect(seen[0]?.url).toContain('type=TXT')
		expect(seen[0]?.url).toContain('name=_dmarc.example.com')
	})

	test('a DNS create POSTs the record to the zone', async () => {
		respond({ id: 'rec_1' })

		await createDnsRecord('zone_1', {
			type: 'TXT',
			name: '_dmarc.example.com',
			content: 'v=DMARC1; p=none',
			ttl: 1
		})

		expect(seen[0]?.method).toBe('POST')
		expect(seen[0]?.url).toEndWith('/zones/zone_1/dns_records')
		expect(seen[0]?.body).toMatchObject({ type: 'TXT', content: 'v=DMARC1; p=none' })
	})

	test('every zone path is zone-scoped — none of them is under /accounts', async () => {
		// The whole reason this module exists separately. An account-scoped path would 404, or worse
		// succeed against the wrong resource, and the mistake is invisible in a diff.
		//
		// → GOTCHA: this test makes the calls ITSELF. `beforeEach` empties `seen`, so a version that
		//   merely asserted over whatever the earlier tests left behind would be checking an empty
		//   array — passing whether or not a single path was right, and passing hardest of all if the
		//   module were deleted. A sweep whose passing state is emptiness cannot tell clean from
		//   never-looked, so it has to produce its own evidence.
		// → GOTCHA: and it must cover EVERY exported call, including the two nothing else exercises —
		//   `enableEmailRouting`, which rewrites a zone's MX records, and `updateDnsRecord`, which
		//   overwrites one. They are the highest blast radius in the module and were the least tested.
		//   The expected count is derived from this list rather than written as a number, so a call
		//   added here cannot be forgotten in the assertion.
		respond((url) => (url.includes('/zones?') ? [{ id: 'zone_1', name: 'example.com' }] : []))

		const calls: (() => Promise<unknown>)[] = [
			() => resolveZone('example.com', 'acct_1'),
			() => getEmailRoutingSettings('zone_1'),
			() => enableEmailRouting('zone_1'),
			() => listEmailRoutingRules('zone_1'),
			() => createEmailRoutingRule('zone_1', { matchers: [], actions: [] }),
			() => getEmailRoutingCatchAll('zone_1'),
			() => setEmailRoutingCatchAll('zone_1', { matchers: [{ type: 'all' }], actions: [] }),
			() => listDnsRecords('zone_1', { type: 'TXT', name: '_dmarc.example.com' }),
			() => createDnsRecord('zone_1', { type: 'TXT', name: 'x.example.com', content: 'v' }),
			() => updateDnsRecord('zone_1', 'rec_1', { type: 'TXT', name: 'x.example.com', content: 'v' })
		]

		for (const call of calls) await call()

		expect(seen).toHaveLength(calls.length)
		expect(seen.filter((request) => request.url.includes('/accounts/'))).toEqual([])
		// The positive half: every one of them really is a zone path (the `/zones?` lookup included).
		expect(seen.filter((request) => request.url.includes('/zones'))).toHaveLength(calls.length)
	})

	test('the two highest-blast-radius calls reach the paths they claim', async () => {
		// `enableEmailRouting` rewrites a domain's MX records and `updateDnsRecord` overwrites a live
		// record. Both were previously covered only by the sweep above, which checks the path prefix
		// and not the verb or the rest of the path.
		respond({})

		await enableEmailRouting('zone_1')
		await updateDnsRecord('zone_1', 'rec_1', {
			type: 'TXT',
			name: '_dmarc.example.com',
			content: 'v=DMARC1; p=reject'
		})

		expect(seen[0]?.method).toBe('POST')
		expect(seen[0]?.url).toEndWith('/zones/zone_1/email/routing/enable')
		expect(seen[1]?.method).toBe('PUT')
		expect(seen[1]?.url).toEndWith('/zones/zone_1/dns_records/rec_1')
		expect(seen[1]?.body).toMatchObject({ content: 'v=DMARC1; p=reject' })
	})
})
