import { describe, expect, mock, test } from 'bun:test'
import { prepareMaterializedConfigResourcesForDeploy } from '../../../src/config/deploy-resources'
import {
	DEVFLARE_RECORD_COMMENT,
	type ZoneProvisionApi,
	ZoneProvisionError,
	type ZoneProvisionResult,
	provisionZoneResources,
	qualifyRecordName
} from '../../../src/config/deploy-zones'
import type { DevflareConfig } from '../../../src/config/schema'

/*
	Two layers, and the second matters most.

	The first is the reconciler, driven through injected mocks — what it creates, what it leaves
	alone, and what it refuses to do.

	The second is DRY-RUN and PREVIEW safety, driven through the real
	`prepareMaterializedConfigResourcesForDeploy`, because the guards that make those safe live in
	the deploy path and not in the reconciler. Testing the reconciler alone would prove nothing about
	either: both failure modes are a mutation reaching the live API because a caller did not stop it.
*/

/** A zone lookup that answers for `example.com` and treats anything under it as a subdomain. */
function zoneFor(domain: string) {
	return { id: 'zone_1', name: 'example.com', domain, isSubdomain: domain !== 'example.com' }
}

/** Every zone call as a mock, with read-only defaults a test can override per case. */
function makeZoneApi(overrides: Partial<ZoneProvisionApi> = {}) {
	return {
		resolveZone: mock(async (domain: string) => zoneFor(domain)),
		getEmailRoutingSettings: mock(async () => ({ enabled: true, status: 'ready' })),
		enableEmailRouting: mock(async () => ({ enabled: true })),
		listEmailRoutingRules: mock(async () => []),
		createEmailRoutingRule: mock(async (_zoneId: string, rule) => rule),
		getEmailRoutingCatchAll: mock(async () => ({
			enabled: true,
			matchers: [{ type: 'all' as const }],
			actions: [{ type: 'drop' as const }]
		})),
		setEmailRoutingCatchAll: mock(async (_zoneId: string, rule) => rule),
		listDnsRecords: mock(async () => []),
		createDnsRecord: mock(async (_zoneId: string, record) => record),
		updateDnsRecord: mock(async (_zoneId: string, _recordId: string, record) => record),
		...overrides
	} satisfies ZoneProvisionApi
}

/** Run a pass and hand back the accumulator it filled, so a test reads one value. */
async function provision(
	zones: DevflareConfig['zones'],
	api: ZoneProvisionApi
): Promise<ZoneProvisionResult> {
	const result: ZoneProvisionResult = { created: [], existing: [] }
	await provisionZoneResources(zones, 'acct_1', api, result)
	return result
}

describe('qualifyRecordName — where a declared record actually lands', () => {
	test('a relative name resolves against the domain it was declared under', () => {
		expect(qualifyRecordName('_dmarc', 'example.com')).toBe('_dmarc.example.com')
	})

	test('`@` is the domain itself', () => {
		expect(qualifyRecordName('@', 'example.com')).toBe('example.com')
	})

	test('a name already qualified is left alone, trailing dot and case included', () => {
		expect(qualifyRecordName('_dmarc.example.com.', 'example.com')).toBe('_dmarc.example.com')
		expect(qualifyRecordName('_DMARC.Example.COM', 'example.com')).toBe('_dmarc.example.com')
	})

	test('a SUBDOMAIN resolves against itself, not its zone apex', () => {
		// The footgun this function exists for. `mail.example.com` lives in the `example.com` zone, so
		// resolving against the apex would write `_dmarc.example.com` — a real record, in the right
		// zone, protecting the wrong domain, and passing any check that only asks which zone it is in.
		expect(qualifyRecordName('_dmarc', 'mail.example.com')).toBe('_dmarc.mail.example.com')
	})

	test('a name that merely ENDS with the domain string is still relative', () => {
		// `notexample.com` is not a subdomain of `example.com`, so it must not be treated as qualified.
		expect(qualifyRecordName('notexample.com', 'example.com')).toBe('notexample.com.example.com')
	})
})

describe('provisionZoneResources — Email Routing', () => {
	test('creates a declared rule that is not there, matching Cloudflare shape', async () => {
		const api = makeZoneApi()

		const result = await provision(
			{
				'example.com': { emailRouting: { rules: [{ to: 'support@example.com', worker: 'api' }] } }
			},
			api
		)

		expect(api.createEmailRoutingRule).toHaveBeenCalledTimes(1)
		expect(api.createEmailRoutingRule.mock.calls[0]?.[1]).toEqual({
			name: 'devflare: support@example.com',
			enabled: true,
			priority: 1,
			matchers: [{ type: 'literal', field: 'to', value: 'support@example.com' }],
			actions: [{ type: 'worker', value: ['api'] }]
		})
		expect(result.created).toContain('Email rule support@example.com (zone example.com)')
	})

	test('a rule already present for the address is REUSED, so a second deploy is a no-op', async () => {
		const api = makeZoneApi({
			listEmailRoutingRules: mock(async () => [
				{
					tag: 'r1',
					matchers: [
						{ type: 'literal' as const, field: 'to' as const, value: 'support@example.com' }
					],
					actions: [{ type: 'worker' as const, value: ['api'] }]
				}
			])
		})

		const result = await provision(
			{
				'example.com': { emailRouting: { rules: [{ to: 'support@example.com', worker: 'api' }] } }
			},
			api
		)

		expect(api.createEmailRoutingRule).not.toHaveBeenCalled()
		expect(result.created).toEqual([])
		expect(result.existing).toContain('Email rule support@example.com (zone example.com)')
	})

	test('a rule whose live action DIFFERS is reported and left alone, never rewritten', async () => {
		// A rule is a live mail route. One edited by hand in the dashboard is far more likely to be a
		// deliberate operational change than a stale value, so the deploy says so instead of silently
		// redirecting real mail back.
		const api = makeZoneApi({
			listEmailRoutingRules: mock(async () => [
				{
					tag: 'r1',
					matchers: [
						{ type: 'literal' as const, field: 'to' as const, value: 'support@example.com' }
					],
					actions: [{ type: 'forward' as const, value: ['someone@example.net'] }]
				}
			])
		})

		const result = await provision(
			{
				'example.com': { emailRouting: { rules: [{ to: 'support@example.com', worker: 'api' }] } }
			},
			api
		)

		expect(api.createEmailRoutingRule).not.toHaveBeenCalled()
		expect(result.existing.join('\n')).toContain('its action differs from the declared one')
	})

	test('two spellings of one address in a single pass create ONE rule, not two', async () => {
		// The map has to learn what this pass created. Otherwise both declarations miss the live list
		// and both create, leaving two rules racing for the same mail — and the NEXT deploy sees one
		// entry per address and calls both fine, so the duplicate never surfaces again. (The schema
		// rejects this too; the runtime must not depend on that being the only guard.)
		const api = makeZoneApi()

		await provision(
			{
				'example.com': {
					emailRouting: {
						rules: [
							{ to: 'support@example.com', worker: 'api' },
							{ to: 'SUPPORT@example.com', worker: 'api' }
						]
					}
				}
			},
			api
		)

		expect(api.createEmailRoutingRule).toHaveBeenCalledTimes(1)
	})

	test('routing OFF without `enable` fails, and the message says how to fix it', async () => {
		const api = makeZoneApi({
			getEmailRoutingSettings: mock(async () => ({ enabled: false, status: 'unconfigured' }))
		})

		const failure = provision(
			{ 'example.com': { emailRouting: { rules: [{ to: 'support@example.com', drop: true }] } } },
			api
		)

		await expect(failure).rejects.toThrow(ZoneProvisionError)
		await failure.catch((error: unknown) => {
			expect((error as Error).message).toContain('emailRouting.enable = true')
			expect((error as Error).message).toContain('MX')
		})
		expect(api.enableEmailRouting).not.toHaveBeenCalled()
		expect(api.createEmailRoutingRule).not.toHaveBeenCalled()
	})

	test('routing OFF with `enable: true` is authorization, and it turns it on', async () => {
		const api = makeZoneApi({
			getEmailRoutingSettings: mock(async () => ({ enabled: false, status: 'unconfigured' }))
		})

		const result = await provision(
			{ 'example.com': { emailRouting: { enable: true, rules: [] } } },
			api
		)

		expect(api.enableEmailRouting).toHaveBeenCalledTimes(1)
		expect(result.created).toContain('Email Routing enabled: example.com')
	})

	test('the catch-all is left alone only when it is live AND already says the same thing', async () => {
		const alreadyDropping = makeZoneApi()
		await provision(
			{ 'example.com': { emailRouting: { catchAll: { drop: true } } } },
			alreadyDropping
		)
		expect(alreadyDropping.setEmailRoutingCatchAll).not.toHaveBeenCalled()

		const forwarding = makeZoneApi()
		const result = await provision(
			{ 'example.com': { emailRouting: { catchAll: { forward: ['someone@example.net'] } } } },
			forwarding
		)
		expect(forwarding.setEmailRoutingCatchAll).toHaveBeenCalledTimes(1)
		expect(result.created.join('\n')).toContain('Email catch-all (zone example.com)')
	})

	test('a catch-all that matches but is DISABLED is written, not reported as correct', async () => {
		// Cloudflare's own default on a freshly enabled zone is drop-and-disabled, so this is the very
		// first deploy of `catchAll: { drop: true }`, not an exotic case. Comparing only the actions
		// would report "already correct" for a catch-all that is doing nothing at all.
		const api = makeZoneApi({
			getEmailRoutingCatchAll: mock(async () => ({
				enabled: false,
				matchers: [{ type: 'all' as const }],
				actions: [{ type: 'drop' as const }]
			}))
		})

		await provision({ 'example.com': { emailRouting: { catchAll: { drop: true } } } }, api)

		expect(api.setEmailRoutingCatchAll).toHaveBeenCalledTimes(1)
		expect(api.setEmailRoutingCatchAll.mock.calls[0]?.[1]).toMatchObject({ enabled: true })
	})
})

describe('provisionZoneResources — DNS', () => {
	const dmarc = {
		'example.com': {
			dns: [{ type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none' }]
		}
	}

	test('creates a missing record, qualified and with a Devflare marker', async () => {
		const api = makeZoneApi()

		const result = await provision(dmarc, api)

		expect(api.createDnsRecord.mock.calls[0]?.[1]).toEqual({
			type: 'TXT',
			name: '_dmarc.example.com',
			content: 'v=DMARC1; p=none',
			ttl: 1,
			comment: DEVFLARE_RECORD_COMMENT
		})
		expect(result.created).toContain('DNS TXT _dmarc.example.com (zone example.com)')
	})

	test('leaves an identical record alone', async () => {
		const api = makeZoneApi({
			listDnsRecords: mock(async () => [
				{
					id: 'rec_1',
					type: 'TXT',
					name: '_dmarc.example.com',
					content: 'v=DMARC1; p=none',
					ttl: 1,
					comment: DEVFLARE_RECORD_COMMENT
				}
			])
		})

		const result = await provision(dmarc, api)

		expect(api.createDnsRecord).not.toHaveBeenCalled()
		expect(api.updateDnsRecord).not.toHaveBeenCalled()
		expect(result.existing).toContain('DNS TXT _dmarc.example.com (zone example.com)')
	})

	test('rewrites a record whose content drifted, and names the old value', async () => {
		// Declaring a record means owning it — which is what turns a staged DMARC rollout into a config
		// edit. The previous value goes in the label so an overwrite nobody expected is readable after.
		const api = makeZoneApi({
			listDnsRecords: mock(async () => [
				{
					id: 'rec_1',
					type: 'TXT',
					name: '_dmarc.example.com',
					content: 'v=DMARC1; p=quarantine',
					ttl: 1,
					comment: DEVFLARE_RECORD_COMMENT
				}
			])
		})

		const result = await provision(dmarc, api)

		expect(api.updateDnsRecord).toHaveBeenCalledTimes(1)
		expect(api.updateDnsRecord.mock.calls[0]?.[1]).toBe('rec_1')
		expect(result.created.join('\n')).toContain('updated from "v=DMARC1; p=quarantine"')
	})

	test('a drifted TTL or MX PRIORITY is reconciled too, not silently reported as correct', async () => {
		// MX priority is a live mail-delivery decision, and the documented contract is that a declared
		// record does not stay at a value the config disagrees with. Comparing only `content` would
		// leave a wrong priority in place forever while reporting convergence.
		const api = makeZoneApi({
			listDnsRecords: mock(async () => [
				{
					id: 'rec_mx',
					type: 'MX',
					name: 'example.com',
					content: 'route1.mx.cloudflare.net',
					ttl: 300,
					priority: 99,
					comment: DEVFLARE_RECORD_COMMENT
				}
			])
		})

		await provision(
			{
				'example.com': {
					dns: [
						{
							type: 'MX',
							name: '@',
							content: 'route1.mx.cloudflare.net',
							ttl: 3600,
							priority: 10
						}
					]
				}
			},
			api
		)

		expect(api.updateDnsRecord).toHaveBeenCalledTimes(1)
		expect(api.updateDnsRecord.mock.calls[0]?.[2]).toMatchObject({ ttl: 3600, priority: 10 })
	})

	test('an AMBIGUOUS record set is refused rather than guessed at', async () => {
		// A type and name pair is an RRSET, not a unique key: an apex TXT routinely holds an SPF record
		// AND a vendor verification string. Rewriting whichever Cloudflare returned first would destroy
		// the verification record and leave the domain with two SPF records — a permanent error for the
		// whole domain under RFC 7208, from nothing worse than declaring your own SPF.
		const api = makeZoneApi({
			listDnsRecords: mock(async () => [
				{
					id: 'rec_google',
					type: 'TXT',
					name: 'example.com',
					content: 'google-site-verification=AbCdEf'
				},
				{ id: 'rec_other', type: 'TXT', name: 'example.com', content: 'something-else' }
			])
		})

		const failure = provision(
			{ 'example.com': { dns: [{ type: 'TXT', name: '@', content: 'v=spf1 -all' }] } },
			api
		)

		await expect(failure).rejects.toThrow(ZoneProvisionError)
		await failure.catch((error: unknown) => {
			expect((error as Error).message).toContain('2 records already exist')
		})
		expect(api.updateDnsRecord).not.toHaveBeenCalled()
		expect(api.createDnsRecord).not.toHaveBeenCalled()
	})

	test('in an ambiguous set, the record Devflare itself wrote is the one it updates', async () => {
		const api = makeZoneApi({
			listDnsRecords: mock(async () => [
				{
					id: 'rec_google',
					type: 'TXT',
					name: 'example.com',
					content: 'google-site-verification=AbCdEf'
				},
				{
					id: 'rec_own',
					type: 'TXT',
					name: 'example.com',
					content: 'v=spf1 ~all',
					ttl: 1,
					comment: DEVFLARE_RECORD_COMMENT
				}
			])
		})

		await provision(
			{ 'example.com': { dns: [{ type: 'TXT', name: '@', content: 'v=spf1 -all' }] } },
			api
		)

		expect(api.updateDnsRecord).toHaveBeenCalledTimes(1)
		expect(api.updateDnsRecord.mock.calls[0]?.[1]).toBe('rec_own')
	})
})

describe('provisionZoneResources — shape of the pass itself', () => {
	test('an absent `zones` namespace makes no Cloudflare call at all', async () => {
		const api = makeZoneApi()

		const result = await provision(undefined, api)

		expect(api.resolveZone).not.toHaveBeenCalled()
		expect(result).toEqual({ created: [], existing: [] })
	})

	test('a domain declaring neither routing nor DNS is skipped before the zone lookup', async () => {
		// The lookup costs a request per domain label, so an empty entry must not pay for one.
		const api = makeZoneApi()

		await provision({ 'example.com': {} }, api)

		expect(api.resolveZone).not.toHaveBeenCalled()
	})

	test('partial progress SURVIVES a throw, so the orphan report can name it', async () => {
		// The whole reason the accumulator is passed in. Enabling Email Routing rewrites a domain's MX
		// records; if the next call then fails and the progress is lost with the return value, the
		// operator is told only what Cloudflare said and never learns their mail was just redirected.
		const api = makeZoneApi({
			getEmailRoutingSettings: mock(async () => ({ enabled: false, status: 'unconfigured' })),
			createEmailRoutingRule: mock(async () => {
				throw new Error('Cloudflare 400: destination not verified')
			})
		})

		const result: ZoneProvisionResult = { created: [], existing: [] }
		const failure = provisionZoneResources(
			{
				'example.com': {
					emailRouting: { enable: true, rules: [{ to: 'support@example.com', drop: true }] }
				}
			},
			'acct_1',
			api,
			result
		)

		await expect(failure).rejects.toThrow('destination not verified')
		expect(result.created).toContain('Email Routing enabled: example.com')
	})
})

describe('the deploy path guards zone provisioning', () => {
	const config: DevflareConfig = {
		name: 'zone-worker',
		compatibilityDate: '2026-05-01',
		compatibilityFlags: [],
		zones: {
			'example.com': {
				emailRouting: {
					enable: true,
					rules: [{ to: 'support@example.com', worker: 'api' }],
					catchAll: { forward: ['someone@example.net'] }
				},
				dns: [{ type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=reject' }]
			}
		}
	}

	/** Everything in the WORST state, so any missing guard shows up as a recorded mutation. */
	function worstCaseApi() {
		return makeZoneApi({
			getEmailRoutingSettings: mock(async () => ({ enabled: false, status: 'unconfigured' })),
			getEmailRoutingCatchAll: mock(async () => ({
				enabled: false,
				matchers: [{ type: 'all' as const }],
				actions: [{ type: 'drop' as const }]
			})),
			listDnsRecords: mock(async () => [
				{
					id: 'rec_1',
					type: 'TXT',
					name: '_dmarc.example.com',
					content: 'v=DMARC1; p=none',
					ttl: 1,
					comment: DEVFLARE_RECORD_COMMENT
				}
			])
		})
	}

	/** Assert not one of the five mutations happened. */
	function expectNoMutation(api: ReturnType<typeof makeZoneApi>) {
		expect(api.enableEmailRouting).not.toHaveBeenCalled()
		expect(api.createEmailRoutingRule).not.toHaveBeenCalled()
		expect(api.setEmailRoutingCatchAll).not.toHaveBeenCalled()
		expect(api.createDnsRecord).not.toHaveBeenCalled()
		expect(api.updateDnsRecord).not.toHaveBeenCalled()
	}

	test('describeOnly performs no zone mutation, while still reading the real state', async () => {
		// The single highest-risk thing in zone provisioning. Account resources are only ever CREATED,
		// so the dry-run guard used to stub `create*` and that was enough. A zone is also enabled, its
		// catch-all replaced and its records rewritten — three mutations that are not creations. Left
		// unstubbed they would run for real while the command printed a plan and claimed to be a
		// preview, and enabling Email Routing rewrites the MX records for an entire domain.
		const api = worstCaseApi()

		const result = await prepareMaterializedConfigResourcesForDeploy(config, {
			accountId: 'acct_1',
			describeOnly: true,
			cloudflare: api
		})

		expectNoMutation(api)

		// The positive control. Without it this test would also pass if zone provisioning never ran —
		// which is the failure that reads exactly like success.
		expect(api.resolveZone).toHaveBeenCalledTimes(1)
		expect(api.getEmailRoutingSettings).toHaveBeenCalledTimes(1)
		expect(api.listDnsRecords).toHaveBeenCalledTimes(1)
		expect(result.created.zones.length).toBeGreaterThan(0)
	})

	test('a PREVIEW deploy provisions no zone resources, and does not even look', async () => {
		// A rule or a record belongs to the whole domain and has no branch-scoped form, so a preview
		// that provisioned them would redirect production mail from a feature branch and leave the
		// change behind when the branch was deleted. Unlike dry-run this skips the READS too — there is
		// nothing to plan, because nothing will happen.
		const api = worstCaseApi()

		const result = await prepareMaterializedConfigResourcesForDeploy(config, {
			accountId: 'acct_1',
			environment: 'preview',
			cloudflare: api
		})

		expectNoMutation(api)
		expect(api.resolveZone).not.toHaveBeenCalled()
		expect(result.created.zones).toEqual([])
	})

	test('a real deploy DOES perform them, so both guards above are measuring something', async () => {
		// The control for both. Same config, same mocks, neither guard engaged.
		const api = worstCaseApi()

		await prepareMaterializedConfigResourcesForDeploy(config, {
			accountId: 'acct_1',
			cloudflare: api
		})

		expect(api.enableEmailRouting).toHaveBeenCalledTimes(1)
		expect(api.createEmailRoutingRule).toHaveBeenCalledTimes(1)
		expect(api.setEmailRoutingCatchAll).toHaveBeenCalledTimes(1)
		expect(api.updateDnsRecord).toHaveBeenCalledTimes(1)
	})

	test('a non-preview NAMED environment still provisions', async () => {
		// `preview` is the only environment with the no-zone rule; a `staging` deploy is a real deploy.
		const api = worstCaseApi()

		await prepareMaterializedConfigResourcesForDeploy(config, {
			accountId: 'acct_1',
			environment: 'staging',
			cloudflare: api
		})

		expect(api.resolveZone).toHaveBeenCalledTimes(1)
		expect(api.enableEmailRouting).toHaveBeenCalledTimes(1)
	})
})
