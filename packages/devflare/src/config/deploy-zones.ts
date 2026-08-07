/*
	──────────────────────────────────────────────────────────────────────────────
	              Provisioning zone-scoped resources at deploy
	──────────────────────────────────────────────────────────────────────────────
	Reconciles the `zones` namespace against a Cloudflare account, per domain:
	Email Sending onboarding, Email Routing rules, and DNS records — in that
	order, because sending is the precondition for the rest of a domain's mail
	and Cloudflare writes records of its own while onboarding it. Sending is
	OUTBOUND and routing is INBOUND; they are separate products sharing a zone.
	Lives beside `deploy-resources.ts` rather
	than inside it because everything there is account-scoped and shares one
	list/create shape, while these need a zone lookup first and reconcile on
	different identities (an address, a type+name pair).

	→ KEY: every mutation reaches this module through the injected API object, so
	  dry-run works by SUBSTITUTING those functions rather than by a flag read in
	  here. Add a mutation and you must stub it in `deploy-resources.ts`'s
	  describe-only block, or `--dry-run` starts rewriting live zones.
	→ KEY: the caller passes its OWN accumulator in and this module appends to it,
	  rather than returning a fresh one. A returned value is lost on a throw, and
	  the orphan report — the thing that tells an operator their MX records were
	  just rewritten before the deploy died — is only worth having if it survives
	  exactly that.
	→ NOTE: rules are reconciled by ADDRESS and records by TYPE+NAME+CONTENT, so
	  deploying twice is a no-op rather than a pile of duplicates. Nothing is ever
	  DELETED — a zone always carries rules and records this config never mentioned.
*/

import type { DestinationAddress } from '../cloudflare/email-addresses'
import type {
	DnsRecord,
	EmailRoutingAction,
	EmailRoutingRule,
	EmailRoutingSettings,
	ResolvedZone,
	SendingDomain,
	SendingDomainDnsStatus
} from '../cloudflare/zone-resources'
import type { DevflareConfig } from './schema'

/** The Cloudflare calls this module makes, injected so tests and dry-run can replace them. */
export interface ZoneProvisionApi {
	/** Find the zone governing a domain, walking up to its apex. */
	resolveZone: (domain: string, accountId: string) => Promise<ResolvedZone>
	/** Every destination address on the ACCOUNT — where forwarded mail is allowed to go. */
	listDestinationAddresses: (accountId: string) => Promise<DestinationAddress[]>
	/** Add one, which is what sends its owner the verification email. */
	createDestinationAddress: (accountId: string, email: string) => Promise<DestinationAddress>
	/** Read whether Email Routing is on. */
	getEmailRoutingSettings: (zoneId: string) => Promise<EmailRoutingSettings>
	/** Turn Email Routing on. Rewrites the zone's MX records. */
	enableEmailRouting: (zoneId: string) => Promise<EmailRoutingSettings>
	/** List the per-address rules. */
	listEmailRoutingRules: (zoneId: string) => Promise<EmailRoutingRule[]>
	/** Create one per-address rule. */
	createEmailRoutingRule: (zoneId: string, rule: EmailRoutingRule) => Promise<EmailRoutingRule>
	/** Read the current catch-all. */
	getEmailRoutingCatchAll: (zoneId: string) => Promise<EmailRoutingRule>
	/** Replace the catch-all. */
	setEmailRoutingCatchAll: (zoneId: string, rule: EmailRoutingRule) => Promise<EmailRoutingRule>
	/** List the domains this zone may send mail from. */
	listSendingDomains: (zoneId: string) => Promise<SendingDomain[]>
	/** Onboard a domain for sending. Writes and locks DNS records. */
	createSendingDomain: (zoneId: string, name: string) => Promise<SendingDomain>
	/** Read how ready a sending domain's DNS is. */
	getSendingDomainDnsStatus: (zoneId: string, domainTag: string) => Promise<SendingDomainDnsStatus>
	/** List records of one type and fully-qualified name. */
	listDnsRecords: (zoneId: string, query: { type: string; name: string }) => Promise<DnsRecord[]>
	/** Create one record. */
	createDnsRecord: (zoneId: string, record: DnsRecord) => Promise<DnsRecord>
	/** Replace one record's contents. */
	updateDnsRecord: (zoneId: string, recordId: string, record: DnsRecord) => Promise<DnsRecord>
}

/** What a provisioning pass did, in labels a human can act on. */
export interface ZoneProvisionResult {
	/** Things the pass brought into being or changed, each already zone-qualified. */
	created: string[]
	/** Things already correct, so the pass left them alone. */
	existing: string[]
	/**
	 * Things worth saying that are not failures.
	 *
	 * A sending domain whose DNS has not propagated yet is the standing case: it is the expected
	 * state minutes after onboarding, so failing the deploy would fail one that did everything right,
	 * and saying nothing would leave a broken sender looking provisioned.
	 */
	warnings: string[]
}

/** Raised when a zone cannot be provisioned as declared, with the fix in the message. */
export class ZoneProvisionError extends Error {
	override name = 'ZoneProvisionError'
}

/** The note Devflare writes onto records it created, so a later pass can tell which are its own. */
export const DEVFLARE_RECORD_COMMENT = 'Managed by Devflare'

/**
 * @description Turn a config record name into the fully-qualified name Cloudflare stores.
 *
 * @param name - the declared name: relative (`_dmarc`), `@` for the domain itself, or already qualified.
 * @param domain - the domain this record was declared under.
 * @returns the fully-qualified record name, lower-cased and without a trailing dot.
 *
 * → GOTCHA: relative names resolve against the DOMAIN the record was declared under, not the zone
 *   apex. For `mail.example.com` in zone `example.com` those differ, and resolving against the apex
 *   would silently write `_dmarc.example.com` when `_dmarc.mail.example.com` was meant — a record in
 *   the right zone, the wrong place, and passing every check that only looks at the zone.
 */
export function qualifyRecordName(name: string, domain: string): string {
	const trimmed = name.trim().replace(/\.$/, '').toLowerCase()
	const zoneDomain = domain.trim().replace(/\.$/, '').toLowerCase()

	if (trimmed === '@' || trimmed === '') return zoneDomain
	if (trimmed === zoneDomain || trimmed.endsWith(`.${zoneDomain}`)) return trimmed

	return `${trimmed}.${zoneDomain}`
}

/** The declared action of a rule or catch-all, as Cloudflare's action array. */
function toRoutingActions(declared: {
	worker?: string
	forward?: string[]
	drop?: true
}): EmailRoutingAction[] {
	if (declared.worker) return [{ type: 'worker', value: [declared.worker] }]
	if (declared.forward) return [{ type: 'forward', value: declared.forward }]
	return [{ type: 'drop' }]
}

/**
 * Whether two action arrays say the same thing, for deciding if a write is needed.
 *
 * → NOTE: compared element by element rather than by joining on a separator. Any separator has to be
 *   a character that cannot occur in a value, which in practice means a control character — and a
 *   control character written into source is invisible, unreviewable, and turns the file binary to
 *   git. There is no separator worth that.
 */
function sameActions(left: EmailRoutingAction[], right: EmailRoutingAction[]): boolean {
	if (left.length !== right.length) return false

	return left.every((action, index) => {
		const other = right[index]
		if (!other || action.type !== other.type) return false

		const leftValues = action.value ?? []
		const rightValues = other.value ?? []
		return (
			leftValues.length === rightValues.length &&
			leftValues.every((value, at) => value === rightValues[at])
		)
	})
}

/** The address a rule claims, lower-cased, or null for a rule that does not claim one address. */
function ruleAddress(rule: EmailRoutingRule): string | null {
	const literal = rule.matchers.find((matcher) => matcher.type === 'literal')
	return literal?.value?.toLowerCase() ?? null
}

/**
 * @description Make sure every address a rule forwards to exists as a destination on the account.
 *
 * @param accountId - the account destination addresses belong to.
 * @param declared - the domain's `emailRouting` block, whose rules and catch-all name the addresses.
 * @param api - the injected Cloudflare calls.
 * @param result - the caller's accumulator, appended to in place.
 *
 * → KEY: this is the step that SENDS THE VERIFICATION EMAIL, and it has to run before the rules that
 *   need it. Creating a forwarding rule does NOT create the destination — Cloudflare accepts the rule
 *   against an address it has never heard of and then silently drops every message, with no error, no
 *   bounce and no log. Nobody can click a verification link that was never sent, so a deploy that
 *   created only the rule left the operator waiting for mail that could not arrive.
 * → NOTE: an address that exists but is UNVERIFIED is a warning rather than a failure. The click
 *   belongs to whoever owns that mailbox and may reasonably happen minutes or days later; failing the
 *   deploy would make a correct configuration unshippable until somebody read their email.
 */
async function provisionForwardDestinations(
	accountId: string,
	declared: NonNullable<NonNullable<DevflareConfig['zones']>[string]['emailRouting']>,
	api: ZoneProvisionApi,
	result: ZoneProvisionResult
): Promise<void> {
	const wanted = new Set(
		[
			...(declared.rules ?? []).flatMap((rule) => rule.forward ?? []),
			...(declared.catchAll?.forward ?? [])
		].map((address) => address.toLowerCase())
	)
	if (wanted.size === 0) return

	const live = await api.listDestinationAddresses(accountId)
	const byAddress = new Map(live.map((address) => [address.email.toLowerCase(), address]))

	for (const address of wanted) {
		const existing = byAddress.get(address)

		if (!existing) {
			await api.createDestinationAddress(accountId, address)
			result.created.push(`Destination address ${address} — verification email sent`)
			result.warnings.push(
				`${address} was added as a forwarding destination and Cloudflare has emailed it a verification link. ` +
					'Until somebody opens that mailbox and clicks it, every rule forwarding there is accepted and then ' +
					'silently drops the message.'
			)
			continue
		}

		// Absence of a timestamp IS the unverified state — Cloudflare publishes no boolean for it.
		if (!existing.verified) {
			result.warnings.push(
				`${address} is a known forwarding destination but is NOT verified yet, so mail forwarded there is ` +
					'silently dropped. Check that mailbox for Cloudflare verification link, or re-send it from ' +
					'Email → Email Routing → Destination addresses.'
			)
			continue
		}

		result.existing.push(`Destination address ${address}`)
	}
}

/**
 * @description Bring one zone's Email Routing to the declared state.
 *
 * @param zone - the resolved zone, and the domain it was reached through.
 * @param declared - the domain's `emailRouting` block.
 * @param api - the injected Cloudflare calls.
 * @param result - the caller's accumulator, appended to in place so a throw still reports progress.
 * @throws {ZoneProvisionError} when routing is off and `enable` was not given.
 */
async function provisionEmailRouting(
	accountId: string,
	zone: ResolvedZone,
	declared: NonNullable<NonNullable<DevflareConfig['zones']>[string]['emailRouting']>,
	api: ZoneProvisionApi,
	result: ZoneProvisionResult
): Promise<void> {
	const settings = await api.getEmailRoutingSettings(zone.id)

	if (!settings.enabled) {
		// Never inferred from the presence of rules: enabling rewrites the zone's MX records, so every
		// message for the domain starts arriving somewhere else. That is a decision to author, not a
		// side effect of adding a forwarding rule.
		if (!declared.enable) {
			throw new ZoneProvisionError(
				`Email Routing is not enabled on zone "${zone.name}" (reached via "${zone.domain}"), so its rules cannot be created. ` +
					'Enabling it rewrites the zone MX records and changes where all mail for the domain is delivered, ' +
					`so Devflare will not do it unless asked: set \`zones['${zone.domain}'].emailRouting.enable = true\`, ` +
					'or turn it on in the Cloudflare dashboard first.'
			)
		}

		await api.enableEmailRouting(zone.id)
		result.created.push(`Email Routing enabled: ${zone.name}`)
	} else {
		result.existing.push(`Email Routing: ${zone.name}`)
	}

	// BEFORE the rules, because a rule forwarding to an address the account does not know is accepted
	// and then silently drops every message — and creating the address is what sends the verification
	// email somebody has to click.
	await provisionForwardDestinations(accountId, declared, api, result)

	await provisionRoutingRules(zone, declared.rules ?? [], api, result)

	if (declared.catchAll) {
		await provisionCatchAll(zone, declared.catchAll, api, result)
	}
}

/** Create the declared rules that are not already present, matching on address. */
async function provisionRoutingRules(
	zone: ResolvedZone,
	declaredRules: NonNullable<
		NonNullable<NonNullable<DevflareConfig['zones']>[string]['emailRouting']>['rules']
	>,
	api: ZoneProvisionApi,
	result: ZoneProvisionResult
): Promise<void> {
	if (declaredRules.length === 0) return

	const live = await api.listEmailRoutingRules(zone.id)
	const claimed = new Map(
		live.flatMap((rule) => {
			const address = ruleAddress(rule)
			return address ? ([[address, rule]] as [string, EmailRoutingRule][]) : []
		})
	)

	for (const [index, declared] of declaredRules.entries()) {
		const address = declared.to.toLowerCase()
		const existing = claimed.get(address)
		const actions = toRoutingActions(declared)

		if (existing) {
			// Present but pointing somewhere else. Reported rather than rewritten: a rule is a live mail
			// route, and one edited by hand in the dashboard is more likely deliberate than stale.
			if (!sameActions(existing.actions ?? [], actions)) {
				result.existing.push(
					`Email rule ${declared.to} (zone ${zone.name}) — EXISTS but its action differs from the declared one; left as it is`
				)
				continue
			}

			result.existing.push(`Email rule ${declared.to} (zone ${zone.name})`)
			continue
		}

		const created = await api.createEmailRoutingRule(zone.id, {
			name: `devflare: ${address}`,
			enabled: declared.enabled ?? true,
			priority: index + 1,
			matchers: [{ type: 'literal', field: 'to', value: address }],
			actions
		})
		result.created.push(`Email rule ${declared.to} (zone ${zone.name})`)

		// → KEY: the map learns what THIS pass created. Without it, two declarations of one address —
		//   which differing case makes easy to write by accident — each miss the live list and create a
		//   rule, leaving two rules racing for the same mail. Worse, the next deploy sees one entry per
		//   address and reports both as fine, so the duplicate never surfaces again.
		claimed.set(address, created)
	}
}

/** Set the catch-all, but only when it is not already live AND saying the same thing. */
async function provisionCatchAll(
	zone: ResolvedZone,
	declared: NonNullable<
		NonNullable<NonNullable<DevflareConfig['zones']>[string]['emailRouting']>['catchAll']
	>,
	api: ZoneProvisionApi,
	result: ZoneProvisionResult
): Promise<void> {
	const actions = toRoutingActions(declared)
	const live = await api.getEmailRoutingCatchAll(zone.id)

	// → GOTCHA: `enabled` is half the state, and the writer below always sets it — so comparing only
	//   the actions would skip a catch-all that says the right thing while switched OFF, and report it
	//   as correct. Cloudflare's own default on a freshly enabled zone is exactly that (drop, disabled),
	//   so the very first deploy of `catchAll: { drop: true }` hits it.
	if (live.enabled === true && sameActions(live.actions ?? [], actions)) {
		result.existing.push(`Email catch-all (zone ${zone.name})`)
		return
	}

	await api.setEmailRoutingCatchAll(zone.id, {
		name: 'devflare: catch-all',
		enabled: true,
		matchers: [{ type: 'all' }],
		actions
	})
	result.created.push(`Email catch-all (zone ${zone.name}) — set to ${actions[0]?.type}`)
}

/**
 * @description Make sure this domain may send mail, and report how ready its DNS is.
 *
 * @param zone - the resolved zone, and the domain it was reached through.
 * @param declared - the domain's `emailSending` block.
 * @param api - the injected Cloudflare calls.
 * @param result - the caller's accumulator, appended to in place.
 * @throws {ZoneProvisionError} when the domain is not onboarded and `enable` was not given.
 *
 * → NOTE: readiness is REPORTED, never waited on. Cloudflare writes the records at onboarding but
 *   they take minutes to propagate, so a fresh domain is legitimately `unconfigured` for a while —
 *   failing there would fail a deploy that did everything right. Saying nothing would be worse: a
 *   sender whose DKIM never landed looks provisioned and silently fails authentication.
 */
async function provisionEmailSending(
	zone: ResolvedZone,
	declared: NonNullable<NonNullable<DevflareConfig['zones']>[string]['emailSending']>,
	api: ZoneProvisionApi,
	result: ZoneProvisionResult
): Promise<void> {
	const onboarded = await api.listSendingDomains(zone.id)
	const match = onboarded.find((domain) => domain.name.toLowerCase() === zone.domain.toLowerCase())

	let sending = match

	if (!match || !match.enabled) {
		if (!declared.enable) {
			const state = match ? 'onboarded but switched OFF' : 'not onboarded'
			throw new ZoneProvisionError(
				`"${zone.domain}" is ${state} for Email Sending, so a \`send_email\` binding cannot send from it. ` +
					'Onboarding makes Cloudflare write and LOCK DNS records in the zone, so Devflare will not do it ' +
					`unless asked: set \`zones['${zone.domain}'].emailSending.enable = true\`, or run ` +
					`\`wrangler email sending enable ${zone.domain}\` once and re-run this deploy.`
			)
		}

		sending = await api.createSendingDomain(zone.id, zone.domain)
		result.created.push(`Email Sending onboarded: ${zone.domain}`)
	} else {
		result.existing.push(`Email Sending: ${zone.domain}`)
	}

	if (!sending?.tag) return

	const dns = await api.getSendingDomainDnsStatus(zone.id, sending.tag)

	// `unlocked` still means every record exists with the right content — only that one has had its
	// managed lock cleared — so it passes. Treating it as a failure would cry wolf on a working setup.
	if (dns.status === 'ready' || dns.status === 'unlocked') return

	const reasons = (dns.errors ?? [])
		.map((error) => error.code ?? error.message)
		.filter((reason): reason is string => Boolean(reason))

	result.warnings.push(
		`Email Sending DNS for ${zone.domain} is "${dns.status ?? 'unknown'}"` +
			`${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}. ` +
			'Records take a few minutes to propagate after onboarding; if it stays this way, mail from this ' +
			'domain will fail authentication even though the deploy succeeded.'
	)
}

/** Whether a live record already matches every field the config declared. */
function sameRecord(live: DnsRecord, declared: DnsRecord): boolean {
	return (
		live.content === declared.content &&
		(live.ttl ?? 1) === (declared.ttl ?? 1) &&
		live.priority === declared.priority &&
		(live.comment ?? '') === (declared.comment ?? '')
	)
}

/**
 * @description Pick which of a name's live records this config is talking about.
 *
 * @param live - every record Cloudflare returned for this type and name.
 * @param declared - the record as declared.
 * @param label - a human label for the error message.
 * @returns the record to update, or null to create a new one.
 * @throws {ZoneProvisionError} when the set is ambiguous and guessing could destroy an unrelated record.
 *
 * → GOTCHA: a type+name pair is an RRSET, not a unique key. An apex `TXT` routinely holds an SPF
 *   record AND a vendor verification string; `MX` and `A` hold several by design. Taking the first
 *   and rewriting it destroys whichever unrelated record Cloudflare happened to return first — and
 *   for SPF it also leaves the domain with two SPF records, which is a permanent error for the whole
 *   domain under RFC 7208. So the only safe automatic choices are a record Devflare itself wrote, or
 *   one whose content already matches; anything else is reported and left alone.
 */
function chooseRecordToUpdate(
	live: DnsRecord[],
	declared: DnsRecord,
	label: string
): DnsRecord | null {
	if (live.length === 0) return null
	if (live.length === 1) return live[0] ?? null

	const own = live.filter((record) => record.comment === DEVFLARE_RECORD_COMMENT)
	if (own.length === 1) return own[0] ?? null

	const matching = live.filter((record) => record.content === declared.content)
	if (matching.length === 1) return matching[0] ?? null

	throw new ZoneProvisionError(
		`${live.length} records already exist for ${label}, and none of them is unambiguously the one this config declares. ` +
			'A type and name pair is a record SET, not a unique record — rewriting the wrong one would destroy an ' +
			'unrelated record (an apex TXT commonly holds both an SPF record and a vendor verification string). ' +
			`Devflare will not guess: remove the extra records, or give the one it should own the comment "${DEVFLARE_RECORD_COMMENT}".`
	)
}

/** Bring one domain's declared DNS records to their declared values. */
async function provisionDnsRecords(
	zone: ResolvedZone,
	declaredRecords: NonNullable<NonNullable<DevflareConfig['zones']>[string]['dns']>,
	api: ZoneProvisionApi,
	result: ZoneProvisionResult
): Promise<void> {
	for (const declared of declaredRecords) {
		const type = declared.type.toUpperCase()
		const name = qualifyRecordName(declared.name, zone.domain)
		const label = `${type} ${name}`
		const record: DnsRecord = {
			type,
			name,
			content: declared.content,
			ttl: declared.ttl ?? 1,
			...(declared.priority === undefined ? {} : { priority: declared.priority }),
			comment: declared.comment ?? DEVFLARE_RECORD_COMMENT
		}

		const live = await api.listDnsRecords(zone.id, { type, name })
		const target = chooseRecordToUpdate(live, record, label)

		if (!target) {
			await api.createDnsRecord(zone.id, record)
			result.created.push(`DNS ${label} (zone ${zone.name})`)
			continue
		}

		if (sameRecord(target, record)) {
			result.existing.push(`DNS ${label} (zone ${zone.name})`)
			continue
		}

		if (!target.id) {
			throw new ZoneProvisionError(
				`Cloudflare returned a record for ${label} in zone ${zone.name} with no id, so it cannot be updated. ` +
					'This is a Cloudflare response Devflare does not understand; re-run the deploy, and report it if it persists.'
			)
		}

		// Declaring a record means owning it — the config is the source of truth, which is what makes a
		// staged DMARC rollout a config edit rather than a dashboard visit. The old value goes in the
		// label because an overwrite the operator did not expect must be readable after the fact.
		await api.updateDnsRecord(zone.id, target.id, record)
		result.created.push(`DNS ${label} (zone ${zone.name}) — updated from "${target.content}"`)
	}
}

/**
 * @description Reconcile every declared domain's zone-scoped resources against Cloudflare.
 *
 * @param zones - the config's `zones` namespace. An empty or absent one does no work and makes no calls.
 * @param accountId - the account whose zones to search.
 * @param api - the injected Cloudflare calls; dry-run passes stubs for every mutation.
 * @param result - the caller's accumulator, appended to IN PLACE.
 * @throws {ZoneProvisionError} when a domain has no zone, routing is off and unauthorized, or a record set is ambiguous.
 *
 * → KEY: it appends rather than returning, because a returned value is lost on a throw — and a zone
 *   half-provisioned is the one orphan an operator cannot ignore, since it is already routing mail.
 */
export async function provisionZoneResources(
	zones: DevflareConfig['zones'],
	accountId: string,
	api: ZoneProvisionApi,
	result: ZoneProvisionResult
): Promise<void> {
	if (!zones) return

	for (const [domain, declared] of Object.entries(zones)) {
		if (!declared.emailRouting && !declared.emailSending && !declared.dns) continue

		const zone = await api.resolveZone(domain, accountId)

		// FIRST, because it is the precondition for everything else about this domain's mail — a
		// `send_email` binding cannot send from a domain that was never onboarded, and Cloudflare writes
		// its own records during onboarding, so any `dns` declared here should be reconciled after them.
		if (declared.emailSending) {
			await provisionEmailSending(zone, declared.emailSending, api, result)
		}

		if (declared.emailRouting) {
			await provisionEmailRouting(accountId, zone, declared.emailRouting, api, result)
		}

		if (declared.dns) {
			await provisionDnsRecords(zone, declared.dns, api, result)
		}
	}
}
