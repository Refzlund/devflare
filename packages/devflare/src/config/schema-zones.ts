// =============================================================================
// Zone-scoped resources — Email Routing rules and DNS records
// =============================================================================
// Everything else Devflare provisions is ACCOUNT-scoped. These are not: they
// belong to a ZONE, reached by a different lookup and a different token scope.
// The config is keyed by DOMAIN rather than by zone, because a domain is what
// an author knows — `test-email.example.com` has no zone of its own, and its
// records live on `example.com`.
//
// → GOTCHA: declaring a record here makes Devflare OWN it. A record whose live
//   content differs from the declaration is rewritten to match, because that is
//   what declarative means and because the alternative — warn and skip — turns
//   a staged DMARC rollout into permanent deploy noise over a correct state.
//   Do not declare a record another system writes; Cloudflare writes its own
//   MX/SPF/DKIM for Email Routing and Email Sending.
// → GOTCHA: turning Email Routing ON rewrites the zone's MX records, which
//   changes where ALL mail for that domain is delivered. It is therefore never
//   inferred from the presence of rules — `enable: true` is the authorization,
//   and without it a zone with routing off fails the deploy rather than being
//   silently switched over.
// =============================================================================

import { z } from 'zod'

/**
 * One Email Routing rule: which address, and what happens to it.
 *
 * Exactly one action must be given. Two would be ambiguous and none would be a
 * rule that matches mail and then does nothing with it.
 */
export const emailRoutingRuleConfigSchema = z
	.object({
		/**
		 * The full address this rule claims, e.g. `support@example.com`.
		 *
		 * Also the IDENTITY Devflare reconciles on: a rule already present for
		 * this address is left alone rather than duplicated, so a deploy is
		 * repeatable.
		 */
		to: z.string().min(1),
		/** Hand the message to this Worker, by script name. */
		worker: z.string().min(1).optional(),
		/**
		 * Forward the message to these addresses.
		 *
		 * Each must be a destination address VERIFIED on the Cloudflare account.
		 * Cloudflare accepts an unverified one through this API and then silently
		 * never delivers to it.
		 */
		forward: z.array(z.string().min(1)).min(1).optional(),
		/** Discard the message. */
		drop: z.literal(true).optional(),
		/** Create the rule but leave it switched off. @default true */
		enabled: z.boolean().optional()
	})
	.strict()
	.superRefine((rule, ctx) => {
		const actions = [rule.worker, rule.forward, rule.drop].filter(
			(action) => action !== undefined
		).length

		if (actions !== 1) {
			ctx.addIssue({
				code: 'custom',
				message: `Email routing rule for "${rule.to}" must declare exactly one of \`worker\`, \`forward\` or \`drop\` — found ${actions}.`
			})
		}
	})

/**
 * What happens to mail no rule claimed.
 *
 * Exactly one action, as for a rule. There is exactly one catch-all per zone
 * and it cannot be created or deleted, only changed — so declaring it is an
 * instruction to set it, not to add one.
 */
export const emailRoutingCatchAllConfigSchema = z
	.object({
		/** Hand unclaimed mail to this Worker, by script name. */
		worker: z.string().min(1).optional(),
		/** Forward unclaimed mail to these verified addresses. */
		forward: z.array(z.string().min(1)).min(1).optional(),
		/** Discard unclaimed mail. */
		drop: z.literal(true).optional()
	})
	.strict()
	.superRefine((catchAll, ctx) => {
		const actions = [catchAll.worker, catchAll.forward, catchAll.drop].filter(
			(action) => action !== undefined
		).length

		if (actions !== 1) {
			ctx.addIssue({
				code: 'custom',
				message: `\`emailRouting.catchAll\` must declare exactly one of \`worker\`, \`forward\` or \`drop\` — found ${actions}.`
			})
		}
	})

/** Email Routing for one domain. */
export const emailRoutingConfigSchema = z
	.object({
		/**
		 * Authorize Devflare to turn Email Routing ON for this zone.
		 *
		 * Never inferred from the presence of rules, because enabling rewrites
		 * the zone's MX records and so changes where all mail for the domain is
		 * delivered. With routing off and this unset, the deploy fails and says
		 * so rather than performing that switch on its own.
		 *
		 * @default false
		 */
		enable: z.boolean().optional(),
		/**
		 * The per-address rules, in the order they should be evaluated.
		 *
		 * → GOTCHA: two rules for the same address are rejected, CASE-INSENSITIVELY. Mail addressing
		 *   is case-insensitive in the local part in practice and Cloudflare matches accordingly, so
		 *   `support@` and `SUPPORT@` are one address wearing two spellings — and two rules for it are
		 *   two live routes racing for the same message, with only one of them winning by evaluation
		 *   order that nothing here controls.
		 */
		rules: z
			.array(emailRoutingRuleConfigSchema)
			.optional()
			.superRefine((rules, ctx) => {
				if (!rules) return

				const seen = new Set<string>()
				for (const rule of rules) {
					const address = rule.to.toLowerCase()
					if (seen.has(address)) {
						ctx.addIssue({
							code: 'custom',
							message: `Two email routing rules declare the address "${rule.to}" (addresses are compared case-insensitively). One address can have only one rule.`
						})
					}
					seen.add(address)
				}
			}),
		/** What happens to mail no rule claimed. Left untouched when omitted. */
		catchAll: emailRoutingCatchAllConfigSchema.optional()
	})
	.strict()

/** One DNS record Devflare keeps at the declared value. */
export const dnsRecordConfigSchema = z
	.object({
		/** Record type, e.g. `TXT`, `CNAME`, `MX`. Upper-cased before use. */
		type: z.string().min(1),
		/**
		 * Record name, relative to the domain this sits under or fully qualified.
		 *
		 * `_dmarc` under `example.com` is `_dmarc.example.com`; so is the FQDN
		 * written out. `@` is the domain itself. Relative names resolve against
		 * the DOMAIN KEY, not the zone apex — which matters for a subdomain,
		 * where the two differ and the zone apex would be the wrong place.
		 */
		name: z.string().min(1),
		/** The record value. */
		content: z.string().min(1),
		/** Seconds, or `1` for Cloudflare's automatic TTL. @default 1 */
		ttl: z.number().int().positive().optional(),
		/** MX priority. Ignored for every other type. */
		priority: z.number().int().nonnegative().optional(),
		/** A note stored with the record. Devflare writes its own when omitted. */
		comment: z.string().optional()
	})
	.strict()

/**
 * Whether this domain may SEND mail, which is a different product from routing.
 *
 * Routing is inbound; sending is whether a Worker's `send_email` binding may use an address here.
 */
export const emailSendingConfigSchema = z
	.object({
		/**
		 * Authorize Devflare to onboard this domain for sending.
		 *
		 * Never inferred, for the same reason as `emailRouting.enable`: onboarding makes Cloudflare
		 * write AND LOCK a set of DNS records in the zone. Without it, a domain that is not onboarded
		 * fails the deploy and names the one command that fixes it.
		 *
		 * @default false
		 */
		enable: z.boolean().optional()
	})
	.strict()

/** Everything Devflare provisions for one domain. */
export const zoneConfigSchema = z
	.object({
		/** Email Routing for this domain — inbound. */
		emailRouting: emailRoutingConfigSchema.optional(),

		/** Email Sending for this domain — outbound. */
		emailSending: emailSendingConfigSchema.optional(),
		/** DNS records Devflare keeps at their declared values. */
		dns: z.array(dnsRecordConfigSchema).optional()
	})
	.strict()

/**
 * Zone-scoped resources, keyed by domain.
 *
 * The key is a domain, not a zone id: Devflare finds the zone by walking the
 * domain's labels up to its apex, so a subdomain is configured under its own
 * name and lands in the parent zone.
 */
export const zonesConfigSchema = z.record(z.string().min(1), zoneConfigSchema).optional()
