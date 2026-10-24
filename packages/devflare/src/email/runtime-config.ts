// =============================================================================
// Email runtime resolution — config + environment → one settled decision
// =============================================================================
// The single place that decides whether a locally sent message leaves the
// machine.
//
// → GOTCHA: the mode is NEVER inferred from credentials. If a populated
//   `DEVFLARE_EMAIL_RELAY_URL` were enough to switch modes, a test suite would
//   start sending real mail the moment it ran on a machine with a real `.env` —
//   and that suite is typically hundreds of unattended round-trips. Only an
//   explicit `email.mode` (or `DEVFLARE_EMAIL_MODE`) selects a mode; credentials
//   present without one are inert.
// =============================================================================

import type {
	EmailConfig,
	EmailInboundConfig,
	EmailMode,
	EmailRelayConfig
} from '../config/schema-email'

/** Header stamped on relayed mail, and skipped by the inbound poller. */
export const DEFAULT_RELAY_HEADER = 'X-Devflare-Dev-Relay'

/** Value of the relay marker header. */
export const RELAY_HEADER_VALUE = '1'

const DEFAULT_INBOUND_INTERVAL_MS = 15_000
const DEFAULT_INBOUND_MAILBOX = 'INBOX'

/** Relay settings with every default filled in. */
export interface ResolvedEmailRelay {
	/** SMTP endpoint, implicit TLS. */
	url: string
	/** The one address every relayed message is delivered to. */
	to: string
	/** Envelope sender for the SMTP transaction, when overridden. */
	from?: string
	/** Marker header name. */
	header: string
	/** Whether the server certificate chain is verified. */
	rejectUnauthorized: boolean
}

/** Inbound-poller settings with every default filled in. */
export interface ResolvedEmailInbound {
	/** IMAP endpoint, implicit TLS. */
	url: string
	/** Mailbox to watch. */
	mailbox: string
	/** Milliseconds between polls. */
	intervalMs: number
	/** Recipient reported to the worker, when overridden. */
	to?: string
	/** Whether a handled message is marked `\Seen`. */
	markSeen: boolean
	/** Header names that mark a message as Devflare's own; those are skipped. */
	skipHeaders: string[]
}

/** Everything the local runtime needs to know about email, settled. */
export interface ResolvedEmailRuntime {
	/** What happens to an outbound message. */
	mode: EmailMode
	/** Relay settings — present only in `relay` mode. */
	relay: ResolvedEmailRelay | null
	/** Inbound-poller settings — present only when the poller is enabled. */
	inbound: ResolvedEmailInbound | null
}

/** Environment variables consulted while resolving email behaviour. */
export interface EmailEnvironment {
	/** `capture` (default), `relay`, or `live`. The ONLY mode selector. */
	DEVFLARE_EMAIL_MODE?: string
	/** SMTP endpoint, overriding `email.relay.url`. */
	DEVFLARE_EMAIL_RELAY_URL?: string
	/** Pinned recipient, overriding `email.relay.to`. */
	DEVFLARE_EMAIL_RELAY_TO?: string
	/** Envelope sender, overriding `email.relay.from`. */
	DEVFLARE_EMAIL_RELAY_FROM?: string
	/** Marker header name, overriding `email.relay.header`. */
	DEVFLARE_EMAIL_RELAY_HEADER?: string
	/** `0`/`false` disables certificate verification. */
	DEVFLARE_EMAIL_RELAY_REJECT_UNAUTHORIZED?: string
	/** `1`/`true` enables the inbound poller, overriding `email.inbound.enabled`. */
	DEVFLARE_EMAIL_INBOUND?: string
	/** IMAP endpoint, overriding `email.inbound.url`. */
	DEVFLARE_EMAIL_INBOUND_URL?: string
	/** Mailbox to watch, overriding `email.inbound.mailbox`. */
	DEVFLARE_EMAIL_INBOUND_MAILBOX?: string
	/** Poll interval, overriding `email.inbound.intervalMs`. */
	DEVFLARE_EMAIL_INBOUND_INTERVAL_MS?: string
	/** Recipient reported to the worker, overriding `email.inbound.to`. */
	DEVFLARE_EMAIL_INBOUND_TO?: string
	/** `0`/`false` leaves handled messages unread. */
	DEVFLARE_EMAIL_INBOUND_MARK_SEEN?: string
	[key: string]: string | undefined
}

/**
 * Read a boolean-ish environment variable.
 *
 * @param value - The raw variable, possibly absent.
 * @returns `true` for `1`/`true`/`yes`/`on`, `false` for `0`/`false`/`no`/`off`,
 *   `undefined` when unset — so an unset variable falls through to config
 *   rather than overriding it with `false`.
 */
function readBoolean(value: string | undefined): boolean | undefined {
	if (value === undefined || value.trim() === '') {
		return undefined
	}

	const normalized = value.trim().toLowerCase()
	if (['1', 'true', 'yes', 'on'].includes(normalized)) {
		return true
	}
	if (['0', 'false', 'no', 'off'].includes(normalized)) {
		return false
	}

	throw new Error(`Expected a boolean value, received "${value}"`)
}

function readTrimmed(value: string | undefined): string | undefined {
	const trimmed = value?.trim()
	return trimmed ? trimmed : undefined
}

/**
 * Resolve the mode, and only the mode.
 *
 * @param config - The `email` block from `devflare.config.ts`.
 * @param env - Process environment.
 * @returns The selected mode, defaulting to `capture`.
 * @throws When `DEVFLARE_EMAIL_MODE` holds something that is not a mode — a
 *   typo there must not silently degrade into "send nothing" or, worse, "send".
 */
export function resolveEmailMode(
	config: EmailConfig | undefined,
	env: EmailEnvironment = {}
): EmailMode {
	const fromEnv = readTrimmed(env.DEVFLARE_EMAIL_MODE)

	if (fromEnv) {
		if (fromEnv !== 'capture' && fromEnv !== 'relay' && fromEnv !== 'live') {
			throw new Error(
				`DEVFLARE_EMAIL_MODE must be 'capture', 'relay', or 'live' — received "${fromEnv}"`
			)
		}
		return fromEnv
	}

	return config?.mode ?? 'capture'
}

/**
 * Resolve relay settings for a run that is actually in relay mode.
 *
 * @param config - The `email.relay` block, if any.
 * @param env - Process environment.
 * @returns Relay settings with defaults applied.
 * @throws When the endpoint or the pinned recipient is missing. Relay mode
 *   without a pin is exactly the configuration that mails a real user from a
 *   laptop, so it fails at startup rather than at the first send.
 */
function resolveRelay(
	config: EmailRelayConfig | undefined,
	env: EmailEnvironment
): ResolvedEmailRelay {
	const url = readTrimmed(env.DEVFLARE_EMAIL_RELAY_URL) ?? config?.url
	const to = readTrimmed(env.DEVFLARE_EMAIL_RELAY_TO) ?? config?.to

	if (!url) {
		throw new Error(
			"Email mode 'relay' needs an SMTP endpoint: set email.relay.url or DEVFLARE_EMAIL_RELAY_URL"
		)
	}

	if (!to) {
		throw new Error(
			"Email mode 'relay' needs a pinned recipient: set email.relay.to or DEVFLARE_EMAIL_RELAY_TO. " +
				'Every recipient is rewritten to it, so relaying without one could reach a real user.'
		)
	}

	const from = readTrimmed(env.DEVFLARE_EMAIL_RELAY_FROM) ?? config?.from

	return {
		url,
		to,
		...(from ? { from } : {}),
		header: readTrimmed(env.DEVFLARE_EMAIL_RELAY_HEADER) ?? config?.header ?? DEFAULT_RELAY_HEADER,
		rejectUnauthorized:
			readBoolean(env.DEVFLARE_EMAIL_RELAY_REJECT_UNAUTHORIZED) ??
			config?.rejectUnauthorized ??
			true
	}
}

/**
 * Resolve inbound-poller settings when the poller is enabled.
 *
 * @param config - The `email.inbound` block, if any.
 * @param env - Process environment.
 * @param relayHeader - Marker header the relay stamps, which the poller skips.
 * @returns Poller settings, or `null` when the poller is not enabled.
 * @throws When the poller is enabled without an IMAP endpoint.
 */
function resolveInbound(
	config: EmailInboundConfig | undefined,
	env: EmailEnvironment,
	relayHeader: string
): ResolvedEmailInbound | null {
	const enabled = readBoolean(env.DEVFLARE_EMAIL_INBOUND) ?? config?.enabled ?? false
	if (!enabled) {
		return null
	}

	const url = readTrimmed(env.DEVFLARE_EMAIL_INBOUND_URL) ?? config?.url
	if (!url) {
		throw new Error(
			'The inbound email poller is enabled but has no IMAP endpoint: set email.inbound.url or DEVFLARE_EMAIL_INBOUND_URL'
		)
	}

	const intervalRaw = readTrimmed(env.DEVFLARE_EMAIL_INBOUND_INTERVAL_MS)
	const intervalMs = intervalRaw ? Number(intervalRaw) : config?.intervalMs
	if (intervalMs !== undefined && (!Number.isFinite(intervalMs) || intervalMs < 1000)) {
		throw new Error(
			`The inbound email poll interval must be a number of milliseconds >= 1000 — received "${intervalRaw ?? intervalMs}"`
		)
	}

	const to = readTrimmed(env.DEVFLARE_EMAIL_INBOUND_TO) ?? config?.to

	// Both header names are skipped so a mailbox that still holds mail relayed
	// under the default marker is not re-ingested after the name is customised.
	const skipHeaders = Array.from(new Set([relayHeader, DEFAULT_RELAY_HEADER]))

	return {
		url,
		mailbox:
			readTrimmed(env.DEVFLARE_EMAIL_INBOUND_MAILBOX) ?? config?.mailbox ?? DEFAULT_INBOUND_MAILBOX,
		intervalMs: intervalMs ?? DEFAULT_INBOUND_INTERVAL_MS,
		...(to ? { to } : {}),
		markSeen: readBoolean(env.DEVFLARE_EMAIL_INBOUND_MARK_SEEN) ?? config?.markSeen ?? true,
		skipHeaders
	}
}

/**
 * Settle every email decision for one local run.
 *
 * @param config - The `email` block from `devflare.config.ts`.
 * @param env - Process environment. Defaults to `{}` so a caller can resolve
 *   config-only behaviour without reaching for `process.env`.
 * @returns The resolved runtime. `relay` is `null` unless the mode is `relay`,
 *   which is what makes an SMTP URL harmless in `capture`.
 * @throws When the selected mode is missing settings it cannot run without.
 */
export function resolveEmailRuntime(
	config: EmailConfig | undefined,
	env: EmailEnvironment = {}
): ResolvedEmailRuntime {
	const mode = resolveEmailMode(config, env)
	const relay = mode === 'relay' ? resolveRelay(config?.relay, env) : null

	return {
		mode,
		relay,
		inbound: resolveInbound(config?.inbound, env, relay?.header ?? DEFAULT_RELAY_HEADER)
	}
}
