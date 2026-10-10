// =============================================================================
// Authoring input types — zone-scoped resources
// =============================================================================
// Hand-written mirror of `schema-zones.ts`, kept beside the other authoring
// types so `defineConfig()` shows documentation and completions for the `zones`
// namespace. Re-exported from `schema-types.ts` for import stability.
// =============================================================================

/** One Email Routing rule: which address, and what happens to mail sent to it. */
export interface EmailRoutingRuleInput {
	/**
	 * The full address this rule claims.
	 *
	 * Also the identity the deploy reconciles on — a rule already present for
	 * this address is reused rather than duplicated, so deploying twice is a
	 * no-op rather than two rules racing for the same mail.
	 *
	 * @example
	 * ```ts
	 * to: 'support@example.com'
	 * ```
	 */
	to: string

	/**
	 * Hand the message to this Worker, by script name.
	 *
	 * One of `worker`, `forward` or `drop` — exactly one, never two.
	 *
	 * @example
	 * ```ts
	 * worker: 'example-api'
	 * ```
	 */
	worker?: string

	/**
	 * Forward the message to these addresses.
	 *
	 * Each must be a destination address VERIFIED on the Cloudflare account.
	 * Cloudflare accepts an unverified one here and then silently never delivers
	 * to it, so a forward that "works" in config can still drop every message.
	 *
	 * @example
	 * ```ts
	 * forward: ['someone@example.net']
	 * ```
	 */
	forward?: string[]

	/**
	 * Discard the message.
	 *
	 * @example
	 * ```ts
	 * drop: true
	 * ```
	 */
	drop?: true

	/**
	 * Create the rule but leave it switched off.
	 *
	 * @default `true`
	 *
	 * @example
	 * ```ts
	 * enabled: false
	 * ```
	 */
	enabled?: boolean
}

/**
 * What happens to mail no rule claimed.
 *
 * Exactly one action, as for a rule. A zone has exactly one catch-all which can
 * be changed but never created or deleted, so declaring this SETS it.
 */
export interface EmailRoutingCatchAllInput {
	/**
	 * Hand unclaimed mail to this Worker, by script name.
	 *
	 * @example
	 * ```ts
	 * worker: 'example-api'
	 * ```
	 */
	worker?: string

	/**
	 * Forward unclaimed mail to these verified addresses.
	 *
	 * @example
	 * ```ts
	 * forward: ['someone@example.net']
	 * ```
	 */
	forward?: string[]

	/**
	 * Discard unclaimed mail.
	 *
	 * @example
	 * ```ts
	 * drop: true
	 * ```
	 */
	drop?: true
}

/** Email Routing for one domain. */
export interface EmailRoutingConfigInput {
	/**
	 * Authorize Devflare to turn Email Routing ON for this zone.
	 *
	 * Never inferred from the presence of rules. Enabling rewrites the zone's MX
	 * records, changing where ALL mail for the domain is delivered — too large a
	 * side effect to follow from someone adding a forwarding rule. With routing
	 * off and this unset, the deploy fails and says what to do.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * enable: true
	 * ```
	 */
	enable?: boolean

	/**
	 * The per-address rules, in the order they should be evaluated.
	 *
	 * @example
	 * ```ts
	 * rules: [{ to: 'support@example.com', worker: 'example-api' }]
	 * ```
	 */
	rules?: EmailRoutingRuleInput[]

	/**
	 * What happens to mail no rule claimed. Left exactly as it is when omitted.
	 *
	 * @example
	 * ```ts
	 * catchAll: { drop: true }
	 * ```
	 */
	catchAll?: EmailRoutingCatchAllInput
}

/** One DNS record Devflare keeps at its declared value. */
export interface DnsRecordInput {
	/**
	 * Record type. Upper-cased before use, so `txt` and `TXT` are the same.
	 *
	 * @example
	 * ```ts
	 * type: 'TXT'
	 * ```
	 */
	type: string

	/**
	 * Record name, relative to the domain this sits under or fully qualified.
	 *
	 * `_dmarc` under `example.com` means `_dmarc.example.com`, and so does the
	 * FQDN written out in full. `@` is the domain itself. A relative name
	 * resolves against the DOMAIN KEY rather than the zone apex — which matters
	 * for a subdomain, where the two differ and the apex is the wrong place.
	 *
	 * @example
	 * ```ts
	 * name: '_dmarc'
	 * ```
	 */
	name: string

	/**
	 * The record value.
	 *
	 * @example
	 * ```ts
	 * content: 'v=DMARC1; p=none; rua=mailto:dmarc@example.com'
	 * ```
	 */
	content: string

	/**
	 * Time to live in seconds, or `1` for Cloudflare's automatic TTL.
	 *
	 * @default `1`
	 *
	 * @example
	 * ```ts
	 * ttl: 3600
	 * ```
	 */
	ttl?: number

	/**
	 * MX priority — lower is preferred. Meaningless for every other type.
	 *
	 * @default `undefined`
	 *
	 * @example
	 * ```ts
	 * priority: 10
	 * ```
	 */
	priority?: number

	/**
	 * A note stored alongside the record in Cloudflare's dashboard.
	 *
	 * Devflare writes its own when this is omitted, so someone reading the zone
	 * later can tell which records a deploy owns.
	 *
	 * @default A Devflare-authored marker.
	 *
	 * @example
	 * ```ts
	 * comment: 'DMARC — staged rollout, see docs/email.md'
	 * ```
	 */
	comment?: string
}

/**
 * Whether this domain may SEND mail — a different Cloudflare product from routing.
 *
 * Routing is inbound: what happens to mail arriving for the domain. Sending is outbound: whether a
 * Worker's `send_email` binding may send from an address here. A domain commonly needs both, and
 * they are onboarded separately.
 */
export interface EmailSendingConfigInput {
	/**
	 * Authorize Devflare to onboard this domain for sending.
	 *
	 * Never inferred, for the same reason as `emailRouting.enable`: onboarding makes Cloudflare write
	 * AND LOCK a set of DNS records in the zone — `MX` and SPF on `cf-bounce.<domain>`, a DKIM key,
	 * and a DMARC policy. Without this, a domain that is not onboarded fails the deploy and names the
	 * one command that fixes it, rather than being silently changed.
	 *
	 * @default `false`
	 *
	 * @example
	 * ```ts
	 * enable: true
	 * ```
	 */
	enable?: boolean
}

/** Everything Devflare provisions for one domain. */
export interface ZoneConfigInput {
	/**
	 * Email Routing for this domain — INBOUND, what happens to mail arriving for it.
	 *
	 * @example
	 * ```ts
	 * emailRouting: { rules: [{ to: 'support@example.com', worker: 'example-api' }] }
	 * ```
	 */
	emailRouting?: EmailRoutingConfigInput

	/**
	 * Email Sending for this domain — OUTBOUND, whether a `send_email` binding may send from it.
	 *
	 * A deploy always CHECKS this when declared, and reports the DNS readiness Cloudflare publishes
	 * rather than waiting on it: propagation takes minutes, and a fresh onboarding is legitimately
	 * unready for a while.
	 *
	 * @example
	 * ```ts
	 * emailSending: { enable: true }
	 * ```
	 */
	emailSending?: EmailSendingConfigInput

	/**
	 * DNS records Devflare keeps at their declared values.
	 *
	 * → GOTCHA: declaring a record makes Devflare OWN it. One whose live content
	 * differs is rewritten to match — so never declare a record another system
	 * writes. Cloudflare writes its own MX, SPF and DKIM for Email Routing and
	 * Email Sending; those are not yours to declare.
	 *
	 * @example
	 * ```ts
	 * dns: [{ type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none' }]
	 * ```
	 */
	dns?: DnsRecordInput[]
}

/**
 * Zone-scoped Cloudflare resources, keyed by DOMAIN.
 *
 * A domain rather than a zone id, because a domain is what an author knows.
 * Devflare finds the zone by walking the domain's labels up to its apex, so
 * `mail.example.com` is configured under its own name and its records land in
 * the `example.com` zone.
 */
export type ZonesConfigInput = Record<string, ZoneConfigInput>
