import { type APIClientOptions, apiGetAll, apiPost } from './api'

/*
	──────────────────────────────────────────────────────────────────────────────
	              Email Routing destination addresses
	──────────────────────────────────────────────────────────────────────────────
	Where forwarded mail is allowed to go. ACCOUNT-scoped, unlike the rules that
	point at them, which is why this is a separate module from `zone-resources`.

	→ KEY: a forwarding rule cannot deliver to an address that is not a verified
	  destination on the account, and creating the RULE does not create the
	  ADDRESS. Cloudflare accepts the rule either way and then silently drops
	  every message — the failure has no error, no bounce and no log.
	→ KEY: creating the address is what sends the verification email. Nobody can
	  click a link that was never sent, so this is the step that has to happen
	  before anyone waits for one.
*/

/** A destination address mail may be forwarded to. */
export interface DestinationAddress {
	/** Cloudflare's id for it. */
	tag?: string
	/** The address itself. */
	email: string
	/**
	 * When it was verified, as a timestamp. ABSENT means not verified yet.
	 *
	 * → GOTCHA: absence is the unverified state, so a truthiness check is the right one here and a
	 *   `=== false` would never be true. Cloudflare has no boolean for this.
	 */
	verified?: string
}

/**
 * @description List every destination address on the account.
 *
 * @param accountId - the account.
 * @param options - API client options.
 * @returns every address, verified or not.
 */
export async function listDestinationAddresses(
	accountId: string,
	options?: APIClientOptions
): Promise<DestinationAddress[]> {
	return apiGetAll<DestinationAddress>(`/accounts/${accountId}/email/routing/addresses`, options)
}

/**
 * @description Add a destination address, which sends its owner a verification email.
 *
 * @param accountId - the account.
 * @param email - the address to add.
 * @param options - API client options.
 * @returns the created address, unverified until its owner clicks the link.
 *
 * → NOTE: the verification link goes to the ADDRESS, not to whoever ran the deploy. That is the point —
 *   it proves the mailbox is reachable by someone who controls it — and it is also why a deploy can
 *   only ever report that the click is pending, never wait for it.
 */
export async function createDestinationAddress(
	accountId: string,
	email: string,
	options?: APIClientOptions
): Promise<DestinationAddress> {
	return apiPost<DestinationAddress>(
		`/accounts/${accountId}/email/routing/addresses`,
		{ email },
		options
	)
}
