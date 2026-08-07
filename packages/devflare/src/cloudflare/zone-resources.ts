import { type APIClientOptions, apiGet, apiGetAll, apiPost, apiPut } from './api'

/*
	──────────────────────────────────────────────────────────────────────────────
	                    Zone-scoped Cloudflare resources
	──────────────────────────────────────────────────────────────────────────────
	Everything else Devflare provisions is ACCOUNT-scoped — KV, D1, R2, Queues,
	Vectorize all live under `/accounts/{id}/…`. Email Routing and DNS do not:
	they belong to a ZONE, which is a different identifier, reached by a different
	lookup, and gated by a different token permission.

	→ KEY: a zone is found by DOMAIN, and the domain you have is often not the
	  zone. `test-email.example.com` has no zone of its own — mail for it is
	  configured on `example.com` — so every lookup here walks up the labels until
	  a zone matches. Getting this wrong looks like "the domain does not exist",
	  which sends the reader to their DNS provider rather than to their config.
	→ NOTE: shapes verified against wrangler 4.105.0's own implementation rather
	  than from the API reference, which lags. `/zones?name=&account.id=`,
	  `/zones/{id}/email/routing/rules` with `{ actions, matchers, name, enabled,
	  priority }`, and the `catch_all` rule at its own path.
*/

/** A Cloudflare zone, as much of it as anything here reads. */
export interface ZoneInfo {
	/** The zone id, for every `/zones/{id}/…` call. */
	id: string
	/** The zone's apex name, e.g. `example.com`. */
	name: string
}

/** Where a domain's configuration actually lives. */
export interface ResolvedZone extends ZoneInfo {
	/** The domain that was asked about, unchanged. */
	domain: string
	/**
	 * Whether {@link ResolvedZone.domain} is BELOW the zone apex.
	 *
	 * `true` for `send.example.com` on zone `example.com`. Callers that configure
	 * per-domain resources need this: a subdomain's records are written into the
	 * parent zone, and a caller that assumed otherwise writes them nowhere.
	 */
	isSubdomain: boolean
}

/**
 * @description Find the zone that governs a domain, walking up to its parents.
 *
 * @param domain - the domain to configure, apex or subdomain.
 * @param accountId - the account whose zones to search.
 * @param options - API client options.
 * @returns the zone, and whether the domain sits below its apex.
 * @throws when no zone in the account matches the domain or any of its parents.
 *
 * → GOTCHA: the label walk is the load-bearing part. Asking Cloudflare for a zone named
 *   `test-email.example.com` returns NOTHING even when mail for it is fully configured, because the zone
 *   is `example.com`. Without the walk this reports a missing domain for a domain that is present.
 */
export async function resolveZone(
	domain: string,
	accountId: string,
	options?: APIClientOptions
): Promise<ResolvedZone> {
	const labels = domain.split('.')

	// Longest first, so an exact zone match beats its parent — a customer who really does have a zone for
	// `send.example.com` must get that one rather than silently landing on `example.com`.
	for (let start = 0; start <= labels.length - 2; start++) {
		const candidate = labels.slice(start).join('.')
		const zones = await apiGet<ZoneInfo[]>(
			`/zones?name=${encodeURIComponent(candidate)}&account.id=${encodeURIComponent(accountId)}`,
			options
		)
		const zone = zones[0]
		if (zone) {
			return { id: zone.id, name: zone.name, domain, isSubdomain: domain !== zone.name }
		}
	}

	throw new Error(
		`No Cloudflare zone found for "${domain}". Checked it and every parent domain in this ` +
			`account — add the zone to Cloudflare DNS, or correct the domain.`
	)
}

/** How an Email Routing rule decides a message is its own. */
export interface EmailRoutingMatcher {
	/** `literal` for one exact address, `all` for the catch-all rule. */
	type: 'literal' | 'all'
	/** Which envelope field to read. Only `to` is supported by Cloudflare today. */
	field?: 'to'
	/** The address to match, for a `literal` matcher. */
	value?: string
}

/** What Email Routing does with a message that matched. */
export interface EmailRoutingAction {
	/** `forward` to verified destinations, `worker` to a Worker, `drop` to discard. */
	type: 'forward' | 'worker' | 'drop'
	/**
	 * The destinations, or the Worker name.
	 *
	 * Absent for `drop`. Cloudflare requires a `forward` destination to be a VERIFIED address on the
	 * account — an unverified one is accepted by this API and then silently never delivers.
	 */
	value?: string[]
}

/** One Email Routing rule. */
export interface EmailRoutingRule {
	/** Cloudflare's id. Absent when creating. */
	tag?: string
	/** A human label. Devflare writes a deterministic one so its own rules are recognisable. */
	name?: string
	/** Whether the rule is live. */
	enabled?: boolean
	/** What it matches. */
	matchers: EmailRoutingMatcher[]
	/** What it does. */
	actions: EmailRoutingAction[]
	/** Evaluation order; lower runs first. */
	priority?: number
}

/**
 * @description List a zone's Email Routing rules, in evaluation order.
 *
 * @param zoneId - the zone.
 * @param options - API client options.
 * @returns every rule, oldest first. Excludes the catch-all, which has its own endpoint.
 */
export async function listEmailRoutingRules(
	zoneId: string,
	options?: APIClientOptions
): Promise<EmailRoutingRule[]> {
	return apiGetAll<EmailRoutingRule>(
		`/zones/${zoneId}/email/routing/rules?order=created&direction=asc`,
		options
	)
}

/**
 * @description Create one Email Routing rule.
 *
 * @param zoneId - the zone.
 * @param rule - the rule to create.
 * @param options - API client options.
 * @returns the created rule, carrying Cloudflare's `tag`.
 */
export async function createEmailRoutingRule(
	zoneId: string,
	rule: EmailRoutingRule,
	options?: APIClientOptions
): Promise<EmailRoutingRule> {
	return apiPost<EmailRoutingRule>(`/zones/${zoneId}/email/routing/rules`, rule, options)
}

/**
 * @description Read the catch-all rule — what currently happens to unclaimed mail.
 *
 * @param zoneId - the zone.
 * @param options - API client options.
 * @returns the stored catch-all. Always present; a zone cannot be without one.
 *
 * → NOTE: exists so a deploy can tell CHANGED from UNCHANGED. The catch-all has only a PUT, so
 *   without reading first every deploy would either write it unconditionally — reporting a change it
 *   may not have made — or skip it and never converge.
 */
export async function getEmailRoutingCatchAll(
	zoneId: string,
	options?: APIClientOptions
): Promise<EmailRoutingRule> {
	return apiGet<EmailRoutingRule>(`/zones/${zoneId}/email/routing/rules/catch_all`, options)
}

/**
 * @description Set the catch-all rule — what happens to mail no other rule claimed.
 *
 * @param zoneId - the zone.
 * @param rule - matchers must be `[{ type: 'all' }]`; the action is `forward` or `drop`.
 * @param options - API client options.
 * @returns the stored catch-all.
 *
 * → NOTE: a PUT to its own path, not a rule in the list. There is exactly one per zone and it cannot be
 *   created or deleted, only changed — which is why it is a separate function rather than a special case
 *   inside {@link createEmailRoutingRule}.
 */
export async function setEmailRoutingCatchAll(
	zoneId: string,
	rule: EmailRoutingRule,
	options?: APIClientOptions
): Promise<EmailRoutingRule> {
	return apiPut<EmailRoutingRule>(`/zones/${zoneId}/email/routing/rules/catch_all`, rule, options)
}

/** A zone's Email Routing status. */
export interface EmailRoutingSettings {
	/** The zone name Cloudflare reports back. */
	name?: string
	/** Whether routing is on. */
	enabled?: boolean
	/** `ready`, `unconfigured`, and friends. */
	status?: string
}

/**
 * @description Read whether Email Routing is enabled for a zone.
 *
 * @param zoneId - the zone.
 * @param options - API client options.
 * @returns the settings.
 */
export async function getEmailRoutingSettings(
	zoneId: string,
	options?: APIClientOptions
): Promise<EmailRoutingSettings> {
	return apiGet<EmailRoutingSettings>(`/zones/${zoneId}/email/routing`, options)
}

/**
 * @description Turn Email Routing on for a zone.
 *
 * @param zoneId - the zone.
 * @param options - API client options.
 * @returns the settings after enabling.
 *
 * → GOTCHA: this writes MX records into the zone. It is the one call here that changes how mail for the
 *   whole domain is delivered, so callers should treat it as a mutation worth confirming rather than a
 *   step to run because a rule needs it.
 */
export async function enableEmailRouting(
	zoneId: string,
	options?: APIClientOptions
): Promise<EmailRoutingSettings> {
	return apiPost<EmailRoutingSettings>(`/zones/${zoneId}/email/routing/enable`, {}, options)
}

/*
	──────────────────────────────────────────────────────────────────────────────
	                    Email SENDING — a different product
	──────────────────────────────────────────────────────────────────────────────
	Email Routing above is INBOUND: what happens to mail arriving for the domain.
	Email Sending is OUTBOUND: whether a Worker's `send_email` binding may send
	FROM an address at this domain. They share the zone and nothing else.

	→ KEY: onboarding a sending domain makes Cloudflare write AND LOCK a set of
	  DNS records of its own — `MX` and SPF `TXT` on `cf-bounce.<domain>`, the DKIM
	  key at `cf-bounce._domainkey.<domain>`, and a DMARC policy at
	  `_dmarc.<domain>`. Anything declared under `dns` that collides with one of
	  those is fighting Cloudflare for the record.
	→ NOTE: shapes verified against Cloudflare's own OpenAPI schema and the
	  generated `cloudflare` SDK. The SDK LAGS the API — it has no `/dns/status`
	  — so these are hand-written against the paths rather than taken from it.
	→ GOTCHA: the schema declares `api_email`/`api_key` security for these
	  operations and omits `api_token`, unlike the sibling send endpoints. That may
	  be a codegen artefact, but it means a token-authenticated create could 403;
	  {@link createSendingDomain} says what to do if it does.
*/

/** One onboarded sending domain. */
export interface SendingDomain {
	/** Cloudflare's id for the subdomain, used in the `/dns/status` path. */
	tag: string
	/** The domain itself, e.g. `mail.example.com`. */
	name: string
	/** Whether sending is currently on for it. */
	enabled: boolean
	/** The DKIM selector Cloudflare published for it. */
	dkim_selector?: string
	/** The bounce domain Cloudflare routes return-path mail through. */
	return_path_domain?: string
}

/** How ready a sending domain's DNS actually is. */
export interface SendingDomainDnsStatus {
	/**
	 * `ready` and `unlocked` both mean the records exist with correct content —
	 * `unlocked` only that one has had its managed lock cleared. `unconfigured`
	 * and `misconfigured` are the real failures.
	 */
	status?: 'ready' | 'unconfigured' | 'unlocked' | 'misconfigured'
	/** Precisely what is wrong, e.g. `dkim.missing`, `spf.multiple`. */
	errors?: { code?: string; message?: string }[]
}

/**
 * @description List the domains this zone may send mail from.
 *
 * @param zoneId - the zone.
 * @param options - API client options.
 * @returns every onboarded sending domain, including disabled ones.
 */
export async function listSendingDomains(
	zoneId: string,
	options?: APIClientOptions
): Promise<SendingDomain[]> {
	return apiGetAll<SendingDomain>(`/zones/${zoneId}/email/sending/subdomains`, options)
}

/**
 * @description Onboard a domain for sending, or re-enable one that was switched off.
 *
 * @param zoneId - the zone the domain sits in.
 * @param name - the domain to onboard. Must be within the zone.
 * @param options - API client options.
 * @returns the onboarded domain, carrying its `tag` and DKIM selector.
 * @throws when Cloudflare refuses — enriched with the CLI fallback, since token auth may not be accepted.
 *
 * → GOTCHA: this WRITES DNS RECORDS into the zone and locks them, so it is a real mutation and not a
 *   registration formality. It is also idempotent by design: Cloudflare re-enables an existing
 *   disabled domain rather than erroring.
 */
export async function createSendingDomain(
	zoneId: string,
	name: string,
	options?: APIClientOptions
): Promise<SendingDomain> {
	try {
		return await apiPost<SendingDomain>(
			`/zones/${zoneId}/email/sending/subdomains`,
			{ name },
			options
		)
	} catch (error) {
		// PROPAGATE, enriched — not swallowed. Cloudflare's own message for a rejected credential says
		// nothing about there being a working alternative, and this endpoint's declared security omits
		// API tokens, which is exactly the credential a deploy uses.
		throw new Error(
			`Could not onboard "${name}" for Email Sending. If this was an authentication failure, note that ` +
				'Cloudflare does not document API-token auth for this endpoint — onboard it once with ' +
				`\`wrangler email sending enable ${name}\`, then re-run the deploy, which will find it already done.`,
			{ cause: error }
		)
	}
}

/**
 * @description Read whether a sending domain's DNS has actually taken effect.
 *
 * @param zoneId - the zone.
 * @param domainTag - the sending domain's `tag`.
 * @param options - API client options.
 * @returns the aggregated status and, when it is bad, the specific record problems.
 *
 * → NOTE: propagation takes minutes, so a deploy REPORTS this rather than waiting on it. A fresh
 *   onboarding is legitimately `unconfigured` for a while, and blocking there would fail a deploy
 *   that did everything right.
 */
export async function getSendingDomainDnsStatus(
	zoneId: string,
	domainTag: string,
	options?: APIClientOptions
): Promise<SendingDomainDnsStatus> {
	return apiGet<SendingDomainDnsStatus>(
		`/zones/${zoneId}/email/sending/subdomains/${domainTag}/dns/status`,
		options
	)
}

/** One DNS record, as much of it as Devflare reads or writes. */
export interface DnsRecord {
	/** Cloudflare's id. Absent when creating. */
	id?: string
	/** `TXT`, `MX`, `CNAME`, … */
	type: string
	/** The fully-qualified record name. */
	name: string
	/** The record value. */
	content: string
	/** Seconds, or `1` for Cloudflare's automatic TTL. */
	ttl?: number
	/** MX priority. Meaningless for other types. */
	priority?: number
	/** A note Cloudflare stores with the record. */
	comment?: string
}

/**
 * @description Find a zone's DNS records of one type and name.
 *
 * @param zoneId - the zone.
 * @param query - the record `type` and fully-qualified `name` to match.
 * @param options - API client options.
 * @returns the matching records, empty when none.
 */
export async function listDnsRecords(
	zoneId: string,
	query: { type: string; name: string },
	options?: APIClientOptions
): Promise<DnsRecord[]> {
	const search = new URLSearchParams({ type: query.type, name: query.name })
	return apiGetAll<DnsRecord>(`/zones/${zoneId}/dns_records?${search.toString()}`, options)
}

/**
 * @description Create one DNS record.
 *
 * @param zoneId - the zone.
 * @param record - the record.
 * @param options - API client options.
 * @returns the created record.
 */
export async function createDnsRecord(
	zoneId: string,
	record: DnsRecord,
	options?: APIClientOptions
): Promise<DnsRecord> {
	return apiPost<DnsRecord>(`/zones/${zoneId}/dns_records`, record, options)
}

/**
 * @description Replace one DNS record.
 *
 * @param zoneId - the zone.
 * @param recordId - the record to replace.
 * @param record - its new contents.
 * @param options - API client options.
 * @returns the stored record.
 */
export async function updateDnsRecord(
	zoneId: string,
	recordId: string,
	record: DnsRecord,
	options?: APIClientOptions
): Promise<DnsRecord> {
	return apiPut<DnsRecord>(`/zones/${zoneId}/dns_records/${recordId}`, record, options)
}
