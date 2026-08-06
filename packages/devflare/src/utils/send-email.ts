// =============================================================================
// Local `sendEmail` binding — validation, normalization, and dispatch
// =============================================================================
// Wraps (or stands in for) Cloudflare's `send_email` binding. Message shaping
// lives in `./email-message`; what happens to an accepted message lives behind
// the sink in `./email-delivery`. This file owns the binding surface itself:
// the allow-list rules Cloudflare enforces, and the env proxies that put the
// local binding in front of worker code.
//
// → KEY: worker-safe. Bundled into the composed worker, so no `node:*` here.
// =============================================================================

import { getEmailDeliverySink } from './email-delivery'
import {
	type BuiltEmailMessage,
	type ComposedEmailMessage,
	RAW_EMAIL_KEY,
	buildEmailMessage,
	createMessageId,
	parseEmailMessage,
	toBareAddressList
} from './email-message'

const RAW_EMAIL = RAW_EMAIL_KEY

/** Restrictions Cloudflare enforces on a `send_email` binding, mirrored locally. */
export interface LocalSendEmailBindingConfig {
	/** Only this exact recipient may be addressed. Mutually exclusive with the allow-list. */
	destinationAddress?: string
	/** Only these recipients may be addressed. Mutually exclusive with `destinationAddress`. */
	allowedDestinationAddresses?: string[]
	/** Only these senders may be used as `from`. */
	allowedSenderAddresses?: string[]
}

const wrappedSendEmailBindings = new WeakMap<SendEmail, SendEmail>()
const wrappedEnvBindings = new WeakMap<object, object>()
const localSendEmailBindings = new Map<string, SendEmail>()

function hasOwn<T extends object>(value: T, key: PropertyKey): key is keyof T {
	return Object.prototype.hasOwnProperty.call(value, key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isSendEmailBinding(value: unknown): value is SendEmail {
	if (!isRecord(value)) {
		return false
	}

	try {
		return typeof value.send === 'function' && typeof value.sendBatch !== 'function'
	} catch {
		return false
	}
}

/**
 * Does this look like the higher-level builder shape rather than raw MIME?
 *
 * Accepts every address form Cloudflare's binding does, so a `{ email, name }`
 * sender is composed rather than passed through untouched — passing it through
 * is what previously turned a named address into `[object Object]` on the wire.
 */
function isComposableSendEmailMessage(message: unknown): message is ComposedEmailMessage {
	if (!isRecord(message)) {
		return false
	}

	const isAddressish = (value: unknown): boolean =>
		typeof value === 'string' ||
		Array.isArray(value) ||
		(isRecord(value) && typeof value.email === 'string')

	return isAddressish(message.from) && isAddressish(message.to)
}

/** Normalize whatever the caller passed as `raw` into a payload a binding accepts. */
export function createEmailMessageRaw(raw: unknown): string | ReadableStream<Uint8Array> {
	if (typeof raw === 'string' || raw instanceof ReadableStream) {
		return raw
	}

	if (raw instanceof Uint8Array) {
		const copy = new Uint8Array(raw.byteLength)
		copy.set(raw)
		return new Blob([copy]).stream()
	}

	if (raw instanceof ArrayBuffer) {
		return new Blob([new Uint8Array(raw.slice(0))]).stream()
	}

	throw new Error('Unsupported EmailMessage raw payload')
}

/**
 * Read caller-supplied `raw` into a string.
 *
 * A `ReadableStream` is consumed here and re-created by the caller, because a
 * stream cannot be both recorded and delivered — reading it once and rebuilding
 * it is the only way an outbox entry and the delivered bytes stay identical.
 *
 * @param raw - The `raw` value from a message, in any accepted form.
 * @returns The MIME document as text.
 */
async function readRawEmail(raw: unknown): Promise<string> {
	if (typeof raw === 'string') {
		return raw
	}

	if (raw instanceof ReadableStream) {
		return new Response(raw as ReadableStream<Uint8Array>).text()
	}

	if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
		return new TextDecoder().decode(raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw)
	}

	throw new Error('Unsupported EmailMessage raw payload')
}

/**
 * Shape a builder message into the `{ from, to, raw }` form a binding accepts.
 *
 * Cloudflare's binding takes either shape; everything below this point works in
 * terms of raw MIME, so the builder form is composed exactly once, here.
 *
 * @param message - Anything worker code passed to `send()`.
 * @returns The message a real `SendEmail` binding can be handed. Non-builder
 *   input (a `cloudflare:email` `EmailMessage`) is returned untouched.
 */
export function normalizeSendEmailMessage(message: unknown): Parameters<SendEmail['send']>[0] {
	if (!isComposableSendEmailMessage(message)) {
		return message as Parameters<SendEmail['send']>[0]
	}

	if (hasOwn(message, RAW_EMAIL)) {
		return message as Parameters<SendEmail['send']>[0]
	}

	const to = toBareAddressList(message.to)
	const envelope = {
		from: toBareAddressList(message.from)[0] ?? '',
		to: to.length === 1 ? to[0] : to
	}

	if (hasOwn(message, 'raw') && message.raw !== undefined) {
		return {
			...envelope,
			[RAW_EMAIL]: createEmailMessageRaw(message.raw)
		} as unknown as Parameters<SendEmail['send']>[0]
	}

	return {
		...envelope,
		[RAW_EMAIL]: createEmailMessageRaw(buildEmailMessage(message).raw)
	} as unknown as Parameters<SendEmail['send']>[0]
}

/** Every representation of one accepted message, built exactly once. */
interface SendEmailDispatch {
	/** What a real `SendEmail` binding should be handed. */
	bindingMessage: Parameters<SendEmail['send']>[0]
	/**
	 * The structured + MIME view, or `null` for a message Devflare cannot read
	 * (an opaque `EmailMessage` instance from another runtime).
	 */
	built: BuiltEmailMessage | null
}

/**
 * Compose a message once and derive both representations from that single build.
 *
 * Building twice is not merely wasteful: each build mints a fresh `Message-ID`
 * and fresh MIME boundaries, so the document an outbox recorded would not be
 * the document that travelled.
 *
 * @param message - Anything worker code passed to `send()`.
 * @returns The binding message, plus the structured view when one is derivable.
 */
async function prepareSendEmailDispatch(message: unknown): Promise<SendEmailDispatch> {
	if (!isComposableSendEmailMessage(message)) {
		return { bindingMessage: message as Parameters<SendEmail['send']>[0], built: null }
	}

	const rawSource = hasOwn(message, RAW_EMAIL)
		? (message as unknown as Record<string, unknown>)[RAW_EMAIL]
		: hasOwn(message, 'raw') && message.raw !== undefined
			? message.raw
			: undefined

	const built =
		rawSource === undefined
			? buildEmailMessage(message)
			: await (async (): Promise<BuiltEmailMessage> => {
					const raw = await readRawEmail(rawSource)
					const parsed = parseEmailMessage(raw, {
						from: toBareAddressList(message.from)[0],
						to: toBareAddressList(message.to)
					})
					return {
						message: { ...parsed, messageId: parsed.messageId || createMessageId() },
						raw,
						size: new TextEncoder().encode(raw).length
					}
				})()

	const to = built.message.to
	const bindingMessage = {
		from: built.message.from,
		to: to.length === 1 ? to[0] : to,
		[RAW_EMAIL]: createEmailMessageRaw(built.raw)
	} as unknown as Parameters<SendEmail['send']>[0]

	return { bindingMessage, built }
}

/**
 * Put message normalization in front of a real `SendEmail` binding.
 *
 * The underlying binding still performs the send — this only guarantees it
 * receives raw MIME rather than a builder object it may not understand.
 */
export function wrapSendEmailBinding(binding: SendEmail): SendEmail {
	const cached = wrappedSendEmailBindings.get(binding)
	if (cached) {
		return cached
	}

	const wrapped = new Proxy(binding, {
		get(target, prop, receiver) {
			if (prop === 'send') {
				return async (message: unknown) => target.send(normalizeSendEmailMessage(message))
			}

			const value = Reflect.get(target, prop, receiver)
			return typeof value === 'function' ? value.bind(target) : value
		}
	}) as SendEmail

	wrappedSendEmailBindings.set(binding, wrapped)
	return wrapped
}

/**
 * Read a binding message's `to` as a list of addresses.
 *
 * @param value - `to` as it appears on the binding message: one address, several,
 *   or something the caller never set.
 * @returns The addresses, ignoring any non-string entry.
 */
function toStringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === 'string')
	}
	return typeof value === 'string' ? [value] : []
}

/**
 * Apply the binding's allow-list rules, throwing exactly as Cloudflare would.
 *
 * @param config - The binding's configured restrictions.
 * @param from - Envelope sender, bare address.
 * @param recipients - Every envelope recipient, bare addresses.
 * @throws When the sender or any recipient is outside the configured lists.
 */
function assertAllowed(
	config: LocalSendEmailBindingConfig,
	from: string | undefined,
	recipients: string[]
): void {
	if (from && config.allowedSenderAddresses && !config.allowedSenderAddresses.includes(from)) {
		throw new Error(`email from ${from} not allowed`)
	}

	for (const recipient of recipients) {
		if (config.destinationAddress !== undefined && recipient !== config.destinationAddress) {
			throw new Error(`email to ${recipient} not allowed`)
		}

		if (
			config.allowedDestinationAddresses !== undefined &&
			!config.allowedDestinationAddresses.includes(recipient)
		) {
			throw new Error(`email to ${recipient} not allowed`)
		}
	}
}

/**
 * Create a local stand-in for a Cloudflare `send_email` binding.
 *
 * Validates the message the way Cloudflare does, then hands it to the installed
 * delivery sink (see `./email-delivery`). With no sink installed nothing leaves
 * the process — which is the `capture` default, and why a suite that happens to
 * run on a machine with mail credentials still cannot send anything.
 *
 * @param config - The binding's allow-list restrictions.
 * @param options.onSend - Observe each accepted message in its binding form.
 *   Kept for the recording mocks that predate the delivery sink.
 * @param options.binding - Binding name, recorded on the delivery so a sink can
 *   tell `MAILER` from `NOTIFIER`.
 * @returns A `SendEmail`-compatible binding.
 */
export function createLocalSendEmailBinding(
	config: LocalSendEmailBindingConfig = {},
	options: {
		onSend?: (message: Parameters<SendEmail['send']>[0]) => void | Promise<void>
		binding?: string
	} = {}
): SendEmail {
	return {
		async send(message: unknown): Promise<EmailSendResult> {
			const { bindingMessage, built } = await prepareSendEmailDispatch(message)

			if (isRecord(bindingMessage)) {
				const from = typeof bindingMessage.from === 'string' ? bindingMessage.from : undefined
				assertAllowed(config, from, toStringList(bindingMessage.to))
			}

			await options.onSend?.(bindingMessage)

			const messageId = built?.message.messageId ?? createMessageId()
			const sink = getEmailDeliverySink()

			if (!sink || !built) {
				return { messageId } as EmailSendResult
			}

			const result = await sink({
				binding: options.binding ?? '',
				message: built.message,
				raw: built.raw,
				size: built.size,
				messageId
			})

			return (result ?? { messageId }) as EmailSendResult
		}
	} as SendEmail
}

/**
 * Register the local bindings that shadow `env.<NAME>` for `sendEmail` config.
 *
 * Replaces the whole registry — a config reload must not leave a binding behind
 * that the new config no longer declares.
 *
 * @param bindings - Binding name → its configured restrictions.
 */
export function setLocalSendEmailBindings(
	bindings: Record<string, LocalSendEmailBindingConfig>
): void {
	localSendEmailBindings.clear()

	for (const [name, config] of Object.entries(bindings)) {
		localSendEmailBindings.set(name, createLocalSendEmailBinding(config, { binding: name }))
	}
}

/** Drop every registered local binding, restoring the runtime's own bindings. */
export function clearLocalSendEmailBindings(): void {
	localSendEmailBindings.clear()
}

function needsEnvSendEmailWrapping(env: Record<string, unknown>): boolean {
	if (localSendEmailBindings.size > 0) {
		return true
	}

	for (const key of Reflect.ownKeys(env)) {
		const value = Reflect.get(env, key)
		if (isSendEmailBinding(value)) {
			return true
		}
	}

	return false
}

/**
 * Put local `sendEmail` bindings (and normalization) in front of an env object.
 *
 * A registered local binding shadows the runtime's own; anything else that
 * looks like a `SendEmail` binding is wrapped so it still receives raw MIME.
 */
export function wrapEnvSendEmailBindings<TEnv>(env: TEnv): TEnv {
	if (!isRecord(env)) {
		return env
	}

	if (!needsEnvSendEmailWrapping(env)) {
		return env
	}

	const cached = wrappedEnvBindings.get(env)
	if (cached) {
		return cached as TEnv
	}

	const wrapped = new Proxy(env, {
		get(target, prop, receiver) {
			if (typeof prop === 'string' && localSendEmailBindings.has(prop)) {
				return localSendEmailBindings.get(prop)
			}

			const value = Reflect.get(target, prop, receiver)
			return isSendEmailBinding(value) ? wrapSendEmailBinding(value) : value
		},
		has(target, prop) {
			return (
				Reflect.has(target, prop) || (typeof prop === 'string' && localSendEmailBindings.has(prop))
			)
		},
		ownKeys(target) {
			return Array.from(new Set([...Reflect.ownKeys(target), ...localSendEmailBindings.keys()]))
		},
		getOwnPropertyDescriptor(target, prop) {
			if (typeof prop === 'string' && localSendEmailBindings.has(prop)) {
				return {
					configurable: true,
					enumerable: true,
					writable: false,
					value: localSendEmailBindings.get(prop)
				}
			}

			const descriptor = Reflect.getOwnPropertyDescriptor(target, prop)
			if (descriptor) {
				return descriptor
			}

			return undefined
		}
	})

	wrappedEnvBindings.set(env, wrapped)
	return wrapped as TEnv
}
