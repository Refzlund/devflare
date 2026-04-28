const RAW_EMAIL = 'EmailMessage::raw'

type ComposedSendEmailMessage = {
	from: string
	to: string | string[]
	subject?: string
	replyTo?: string | EmailAddress
	cc?: string | string[]
	bcc?: string | string[]
	headers?: Record<string, string>
	text?: string
	html?: string
	raw?: unknown
}

export interface LocalSendEmailBindingConfig {
	destinationAddress?: string
	allowedDestinationAddresses?: string[]
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
		return typeof value.send === 'function'
			&& typeof value.sendBatch !== 'function'
	} catch {
		return false
	}
}

function isComposableSendEmailMessage(message: unknown): message is ComposedSendEmailMessage {
	return isRecord(message)
		&& typeof message.from === 'string'
		&& (typeof message.to === 'string' || Array.isArray(message.to))
}

function formatEmailAddress(value: string | EmailAddress | undefined): string | undefined {
	if (!value) {
		return undefined
	}

	return typeof value === 'string' ? value : String(value)
}

function formatEmailList(value: string | string[] | undefined): string | undefined {
	if (!value) {
		return undefined
	}

	return Array.isArray(value) ? value.join(', ') : value
}

function normalizeBodyText(value: string): string {
	return value.replace(/\r?\n/g, '\r\n')
}

function buildMultipartAlternativeBody(message: ComposedSendEmailMessage, boundary: string): string {
	const parts: string[] = []

	if (message.text) {
		parts.push(
			`--${boundary}`,
			'Content-Type: text/plain; charset=UTF-8',
			'',
			normalizeBodyText(message.text)
		)
	}

	if (message.html) {
		parts.push(
			`--${boundary}`,
			'Content-Type: text/html; charset=UTF-8',
			'',
			normalizeBodyText(message.html)
		)
	}

	parts.push(`--${boundary}--`)
	return parts.join('\r\n')
}

function buildRawEmail(message: ComposedSendEmailMessage): string {
	const lines: string[] = []
	const messageId = `<${Date.now()}-${Math.random().toString(36).slice(2)}@devflare.dev>`

	lines.push(`From: ${message.from}`)
	lines.push(`To: ${formatEmailList(message.to)}`)
	lines.push(`Date: ${new Date().toUTCString()}`)
	lines.push(`Message-ID: ${messageId}`)

	if (message.subject) {
		lines.push(`Subject: ${message.subject}`)
	}

	const replyTo = formatEmailAddress(message.replyTo)
	if (replyTo) {
		lines.push(`Reply-To: ${replyTo}`)
	}

	const cc = formatEmailList(message.cc)
	if (cc) {
		lines.push(`Cc: ${cc}`)
	}

	const bcc = formatEmailList(message.bcc)
	if (bcc) {
		lines.push(`Bcc: ${bcc}`)
	}

	if (message.headers) {
		for (const [key, value] of Object.entries(message.headers)) {
			lines.push(`${key}: ${value}`)
		}
	}

	lines.push('MIME-Version: 1.0')

	if (message.text && message.html) {
		const boundary = `devflare-alt-${crypto.randomUUID()}`
		lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
		lines.push('')
		lines.push(buildMultipartAlternativeBody(message, boundary))
		return lines.join('\r\n')
	}

	lines.push(`Content-Type: ${message.html ? 'text/html' : 'text/plain'}; charset=UTF-8`)
	lines.push('')
	lines.push(normalizeBodyText(message.html ?? message.text ?? ''))

	return lines.join('\r\n')
}

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

export function normalizeSendEmailMessage(
	message: unknown
): Parameters<SendEmail['send']>[0] {
	if (!isComposableSendEmailMessage(message)) {
		return message as Parameters<SendEmail['send']>[0]
	}

	if (hasOwn(message, RAW_EMAIL)) {
		return message as Parameters<SendEmail['send']>[0]
	}

	if (hasOwn(message, 'raw') && message.raw !== undefined) {
		return {
			from: message.from,
			to: message.to,
			[RAW_EMAIL]: createEmailMessageRaw(message.raw)
		} as unknown as Parameters<SendEmail['send']>[0]
	}

	return {
		from: message.from,
		to: message.to,
		[RAW_EMAIL]: createEmailMessageRaw(buildRawEmail(message))
	} as unknown as Parameters<SendEmail['send']>[0]
}

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

export function createLocalSendEmailBinding(
	config: LocalSendEmailBindingConfig = {},
	options: {
		onSend?: (message: Parameters<SendEmail['send']>[0]) => void | Promise<void>
	} = {}
): SendEmail {
	return {
		async send(message: unknown): Promise<EmailSendResult> {
			const normalized = normalizeSendEmailMessage(message)

			if (isRecord(normalized)) {
				const from = typeof normalized.from === 'string' ? normalized.from : undefined
				const recipients = Array.isArray(normalized.to)
					? normalized.to.filter((value): value is string => typeof value === 'string')
					: typeof normalized.to === 'string'
						? [normalized.to]
						: []

				if (
					from
					&& config.allowedSenderAddresses
					&& !config.allowedSenderAddresses.includes(from)
				) {
					throw new Error(`email from ${from} not allowed`)
				}

				for (const recipient of recipients) {
					if (
						config.destinationAddress !== undefined
						&& recipient !== config.destinationAddress
					) {
						throw new Error(`email to ${recipient} not allowed`)
					}

					if (
						config.allowedDestinationAddresses !== undefined
						&& !config.allowedDestinationAddresses.includes(recipient)
					) {
						throw new Error(`email to ${recipient} not allowed`)
					}
				}
			}

			await options.onSend?.(normalized)
			return undefined as unknown as EmailSendResult
		}
	} as SendEmail
}

export function setLocalSendEmailBindings(
	bindings: Record<string, LocalSendEmailBindingConfig>
): void {
	localSendEmailBindings.clear()

	for (const [name, config] of Object.entries(bindings)) {
		localSendEmailBindings.set(name, createLocalSendEmailBinding(config))
	}
}

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
			return Reflect.has(target, prop)
				|| (typeof prop === 'string' && localSendEmailBindings.has(prop))
		},
		ownKeys(target) {
			return Array.from(new Set([
				...Reflect.ownKeys(target),
				...localSendEmailBindings.keys()
			]))
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
