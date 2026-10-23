// =============================================================================
// Dev server — email wiring
// =============================================================================
// Settles email behaviour for a `devflare dev` run and keeps the two host-side
// pieces alive: the loopback listener the composed worker posts outbound mail
// to, and the optional IMAP poller that feeds a real mailbox into `src/email.ts`.
//
// Split out of `server.ts` so the start sequence there reads as a list of
// subsystems rather than absorbing the details of each.
// =============================================================================

import type { ConsolaInstance } from 'consola'
import type { DevflareConfig } from '../config'
import { startOutboundEmailService } from '../email/host-service'
import { createHostEmailDeliverySink } from '../email/host-sink'
import { startInboundEmailPoller } from '../email/inbound-poller'
import { resolveEmailRuntime } from '../email/runtime-config'
import { setEmailDeliverySink } from '../utils/email-delivery'
import { setLocalSendEmailBindings } from '../utils/send-email'
import type { DevServerState } from './dev-server-state'

/**
 * Resolve email behaviour and register the local `sendEmail` bindings.
 *
 * Called on start and on every config reload, so editing `email.mode` or a
 * `sendEmail` binding takes effect without restarting the dev server.
 *
 * @param state - Dev server state; `state.emailRuntime` is updated in place.
 * @param config - The freshly loaded config.
 * @param logger - Where the settled mode is announced.
 * @throws When the selected mode is missing settings it cannot run without —
 *   `relay` without an SMTP endpoint or a pinned recipient fails at start,
 *   rather than looking like it is sending and silently doing nothing.
 */
export function applyEmailRuntime(
	state: DevServerState,
	config: DevflareConfig,
	logger?: ConsolaInstance
): void {
	const previousMode = state.emailRuntime?.mode
	const runtime = resolveEmailRuntime(config.email, process.env)
	state.emailRuntime = runtime

	// `live` leaves the runtime's own binding in place: Devflare must not shadow
	// a `remote: true` binding that is doing real Cloudflare delivery.
	setLocalSendEmailBindings(runtime.mode === 'live' ? {} : (config.bindings?.sendEmail ?? {}))

	if (runtime.mode !== previousMode) {
		if (runtime.mode === 'relay' && runtime.relay) {
			logger?.info(
				`Email mode: relay → every recipient is rewritten to ${runtime.relay.to} before transport`
			)
		} else if (runtime.mode === 'live') {
			logger?.warn('Email mode: live → sends go to the runtime binding, not to a local capture')
		} else {
			logger?.info('Email mode: capture → outbound mail is recorded locally and never transmitted')
		}
	}
}

/**
 * Start the loopback listener the composed worker posts outbound mail to.
 *
 * Idempotent: a config reload re-uses the running service so the URL already
 * baked into the generated worker stays valid.
 *
 * @param state - Dev server state; `state.outboundEmailService` is set.
 * @returns The endpoint URL to bake into the composed worker.
 */
export async function ensureOutboundEmailService(state: DevServerState): Promise<string> {
	if (state.outboundEmailService) {
		return state.outboundEmailService.url
	}

	const service = await startOutboundEmailService(() => {
		if (!state.emailRuntime) {
			throw new Error('Devflare email runtime was not resolved before an outbound send arrived')
		}
		return state.emailRuntime
	})

	state.outboundEmailService = service
	return service.url
}

/**
 * Start the IMAP poller when the config asks for it.
 *
 * @param state - Dev server state; `state.inboundEmailPoller` is set.
 * @param runtimeOrigin - Origin of the local runtime, e.g. `http://127.0.0.1:8787`.
 * @param logger - Where poll activity is reported.
 */
export function startInboundEmailIfEnabled(
	state: DevServerState,
	runtimeOrigin: string,
	logger?: ConsolaInstance
): void {
	const inbound = state.emailRuntime?.inbound
	if (!inbound || state.inboundEmailPoller) {
		return
	}

	logger?.info(
		`Email inbound: polling ${inbound.mailbox} every ${inbound.intervalMs}ms → src/email.ts`
	)

	state.inboundEmailPoller = startInboundEmailPoller({
		inbound,
		runtimeOrigin,
		...(logger ? { logger } : {})
	})
}

/**
 * Install the host delivery sink for this dev server.
 *
 * The sink reads `state.emailRuntime` lazily, so a mode change on reload is
 * picked up without re-installing anything.
 *
 * @param state - Dev server state.
 */
export function installEmailDeliverySink(state: DevServerState): void {
	setEmailDeliverySink(
		createHostEmailDeliverySink(() => {
			if (!state.emailRuntime) {
				throw new Error('Devflare email runtime was not resolved before an outbound send arrived')
			}
			return state.emailRuntime
		})
	)
}
