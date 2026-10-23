import type { BindingGuideDefinition } from './shared'

export const bindingGuidesPart6: BindingGuideDefinition[] = [
	{
		slugBase: 'send-email',
		label: 'Send Email',
		categoryDescription:
			'Outbound email bindings with real local support, plus an important distinction from inbound email event handlers.',
		configKey: 'bindings.sendEmail',
		authoringShape:
			'Record<string, { destinationAddress?; allowedDestinationAddresses?; allowedSenderAddresses? }>',
		compileOutput: String.raw`{
	"send_email": [
		{ "name": "TRANSACTIONAL_EMAIL", "allowed_destination_addresses": ["ops@example.com"], "allowed_sender_addresses": ["noreply@example.com"] },
		{ "name": "SUPPORT_EMAIL", "destination_address": "support@example.com" },
		{ "name": "MAILER" }
	]
}`,
		localStory: 'Outbound local support; distinct from inbound email event testing',
		sourcePages: [
			'schema-bindings.ts',
			'compiler.ts',
			'send-email.ts',
			'simple-context.ts',
			'case12/*'
		],
		overview: {
			readTime: '4 min read',
			title:
				'Use Send Email when the worker should send outbound email with explicit address rules',
			summary:
				'Send Email is a real binding surface in Devflare, and it is worth documenting separately from inbound `src/email.ts` handlers so the two flows do not get blurred together.',
			description:
				'That distinction matters because outbound email is a binding you call from worker code, while inbound email handling is a worker event surface with its own test helper story.',
			highlights: [
				'Config can restrict a binding to one destination or to explicit sender and recipient allow-lists.',
				'Compiler emits the Wrangler `send_email` entries.',
				'Local runtime supports outbound send-email bindings directly.',
				'Inbound email testing uses the `email` helper surface, which is related but not the same contract.'
			],
			bestFor: 'Outbound notification email and controlled email-sending paths from worker code',
			authoringParagraphs: [
				'Send Email bindings are easiest to trust when the allowed addresses are visible in config rather than buried in some last-minute secret or helper wrapper.',
				'Devflare validates the main mutual-exclusion rule here too: use either one `destinationAddress` or a list of `allowedDestinationAddresses`, not both.',
				'A binding that names neither is also valid, and is what you want once a sending domain is onboarded: `MAILER: {}` compiles to `{ "name": "MAILER" }` and may address any recipient.'
			],
			authoringSnippet: {
				title: 'Send Email binding authoring',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'email-worker',
	bindings: {
		sendEmail: {
			TRANSACTIONAL_EMAIL: {
				allowedDestinationAddresses: ['ops@example.com'],
				allowedSenderAddresses: ['noreply@example.com']
			},
			SUPPORT_EMAIL: {
				destinationAddress: 'support@example.com'
			},
			MAILER: {}
		}
	}
})`
			},
			fitBullets: [
				'Use Send Email when the worker needs to send notifications or transactional messages outward.',
				'Leave a binding unrestricted (`MAILER: {}`) when the account sends to arbitrary recipients from a verified domain.',
				'Keep address restrictions explicit so the worker cannot quietly send anywhere it pleases.',
				'Do not confuse outbound send-email bindings with inbound email processing handlers.'
			],
			caveatBullets: [
				'`destinationAddress` and `allowedDestinationAddresses` are mutually exclusive in one binding definition.',
				'The local story for outbound email is strong, but it should still be documented separately from inbound email event helpers.',
				'Preview resource lifecycle does not manage email addresses the way it manages storage resources, because the binding compiles the address rules as-is.'
			],
			caveatCallout: {
				tone: 'warning',
				title: 'Outbound is not inbound',
				body: [
					'`env.TRANSACTIONAL_EMAIL.send(...)` and `src/email.ts` handler tests are connected by the domain, but they are different contracts and should be documented that way.'
				]
			},
			extraSections: [
				{
					id: 'local-email-mode',
					title: 'Decide what a local send actually does',
					description:
						'The top-level `email` block answers one question for `devflare dev` and `createTestContext()`: what happens to a message a worker hands to a Send Email binding. It never reaches deployed output.',
					table: {
						headers: ['Mode', 'What happens', 'Reach for it when'],
						rows: [
							[
								'`capture` (default)',
								'The message is recorded in the outbox. Nothing leaves the machine.',
								'Always, unless you have decided otherwise.'
							],
							[
								'`relay`',
								'Recorded, then every recipient is rewritten to `relay.to` and the message is delivered over SMTP from the host process.',
								'You want to look at the real rendered mail in a real inbox.'
							],
							[
								'`live`',
								'Devflare stands aside; the runtime binding performs the send, which is real Cloudflare delivery when the binding is `remote: true`.',
								'You are deliberately exercising the hosted path.'
							]
						]
					},
					paragraphs: [
						'The mode is never inferred from credentials. A populated `relay.url`, or the matching environment variable, leaves the run in `capture` until something explicitly selects `relay` — otherwise a suite that happened to run on a machine with real mail settings would start sending real mail.',
						'`relay` requires `relay.to`, and every address in `to`, `cc`, and `bcc` is rewritten to it at the binding boundary, before transport, on the assembled MIME. Worker code cannot route around it, which is the point: a developer laptop holding a production token still cannot reach a real user.',
						'Every relayed message is stamped with a marker header (`X-Devflare-Dev-Relay: 1` by default, renameable via `relay.header`). The inbound poller skips anything carrying it, so pinning outbound mail at the same mailbox you poll does not feed each message straight back into the worker.'
					],
					snippets: [
						{
							title: 'Relay local mail to one inbox, and poll that inbox back in',
							language: 'ts',
							filename: 'devflare.config.ts',
							code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'email-worker',
	bindings: {
		sendEmail: { MAILER: {} }
	},
	email: {
		// Never inferred: without this line the SMTP settings below are inert.
		mode: 'relay',
		relay: {
			url: 'smtps://apikey:secret@smtp.example.com:465',
			to: 'dev-inbox@example.com',
			header: 'X-Devflare-Dev-Relay'
		},
		inbound: {
			enabled: true,
			url: 'imaps://dev%40example.com:app-password@imap.example.com:993',
			mailbox: 'INBOX',
			intervalMs: 15000,
			to: 'support@example.com'
		}
	}
})`
						}
					],
					callouts: [
						{
							tone: 'warning',
							title: 'Capture is the default on purpose',
							body: [
								'Every knob below `email` is inert until `mode` says otherwise. Set it in the config you keep out of CI, or through `DEVFLARE_EMAIL_MODE`, and leave the default alone everywhere else.'
							]
						}
					]
				},
				{
					id: 'local-email-environment',
					title: 'Environment overrides for local email',
					description:
						'Every `email` field has an environment variable, so a machine can carry mail settings without the repo carrying them. `DEVFLARE_EMAIL_MODE` is the only one that changes what happens.',
					table: {
						headers: ['Variable', 'Overrides'],
						rows: [
							['`DEVFLARE_EMAIL_MODE`', '`email.mode` — `capture`, `relay`, or `live`'],
							['`DEVFLARE_EMAIL_RELAY_URL`', '`email.relay.url`'],
							['`DEVFLARE_EMAIL_RELAY_TO`', '`email.relay.to` (the pinned recipient)'],
							['`DEVFLARE_EMAIL_RELAY_FROM`', '`email.relay.from`'],
							['`DEVFLARE_EMAIL_RELAY_HEADER`', '`email.relay.header`'],
							['`DEVFLARE_EMAIL_RELAY_REJECT_UNAUTHORIZED`', '`email.relay.rejectUnauthorized`'],
							['`DEVFLARE_EMAIL_INBOUND`', '`email.inbound.enabled`'],
							['`DEVFLARE_EMAIL_INBOUND_URL`', '`email.inbound.url`'],
							['`DEVFLARE_EMAIL_INBOUND_MAILBOX`', '`email.inbound.mailbox`'],
							['`DEVFLARE_EMAIL_INBOUND_INTERVAL_MS`', '`email.inbound.intervalMs`'],
							['`DEVFLARE_EMAIL_INBOUND_TO`', '`email.inbound.to`'],
							['`DEVFLARE_EMAIL_INBOUND_MARK_SEEN`', '`email.inbound.markSeen`']
						]
					},
					bullets: [
						'`relay` with no endpoint or no pinned recipient fails at start-up rather than quietly falling back to `capture`.',
						'The inbound poller stays off until `email.inbound.enabled` or `DEVFLARE_EMAIL_INBOUND` says otherwise; it reads, and by default marks, real mail.',
						'Both SMTP and IMAP use implicit TLS only — `smtps://` on 465 and `imaps://` on 993.'
					]
				}
			]
		},
		internals: {
			readTime: '3 min read',
			summary:
				'Send Email compiles into Wrangler output, normalizes message input at runtime, and supports local address restrictions instead of treating email as an unbounded free-for-all.',
			description:
				'That runtime normalization is worth calling out because it lets worker code send higher-level message shapes while Devflare translates them into the lower-level form the email path needs.',
			highlights: [
				'Compiler emits `send_email` entries from the authored binding rules; a binding with no restrictions emits just its name.',
				'Runtime helpers normalize the full message builder into raw MIME, once, and return the id stamped on it.',
				'Local bindings respect sender and destination restrictions.',
				'The relay transmits from the host process, never from inside workerd.',
				'Env wrapping can surface locally created send-email bindings cleanly in tests and dev.'
			],
			normalizationFact:
				'The schema normalizes address restrictions and runtime message helpers normalize composed email input',
			compileTarget: 'Wrangler `send_email`',
			previewNote:
				'Address rules compile as authored; there is no separate preview resource lifecycle for email destinations',
			normalizationParagraphs: [
				'The schema work here is less about ids and more about safety rules: which addresses are permitted and which combinations are invalid.',
				'At runtime, Devflare normalizes the higher-level message builder — `to`, `from`, `subject`, `html`, `text`, `cc`, `bcc`, `replyTo`, `headers`, `attachments` — into a raw MIME document, and hands the binding that. An address may be a bare string, a `{ email, name }` object, or a list mixing both; the document is built exactly once, so the bytes recorded are the bytes that travel. `send()` answers with the `messageId` stamped on it. A caller who supplies `raw` themselves keeps that document untouched.',
				'Where that document goes is decided by `email.mode`, and only ever there: `capture` records it, `relay` pins and transmits it, `live` hands it to the runtime binding. Credentials alone never select a mode.'
			],
			localRuntimeBullets: [
				'Local send-email bindings can be created and enforced in the default runtime/test context.',
				'Address restrictions are part of the local contract, which keeps the binding honest during development.',
				'Under `devflare dev` the binding lives inside workerd, which has no raw sockets, so the composed worker posts each assembled message to a loopback listener the dev server owns on 127.0.0.1. The SMTP client runs in the host process; the endpoint is baked in at dev start and never into a build.',
				'`relay` rewrites `to`, `cc`, and `bcc` on the assembled document, so a worker that hand-rolls its own MIME is pinned exactly like one that used the builder. The originals are kept as `X-Devflare-Original-To`, `-Cc`, and `-Bcc` so the pinned inbox still shows who the message was for.',
				'Caller text that reaches a header — a subject, a display name, a custom header value, an attachment filename — is stripped of CR and LF, and an envelope address carrying one is refused before a socket is opened. Devflare composes headers and SMTP commands by concatenation, so without that a newline in a subject forges a recipient and a newline in `from` smuggles a second `RCPT TO` past the pin.',
				'The inbound poller reads a mailbox over IMAP and posts each new message at the same local endpoint `cf.email.send()` falls back to, so `src/email.ts` sees the Cloudflare-shaped event either way. Messages carrying the relay marker are skipped.',
				'Inbound email helper APIs exist too, but they serve the inbound event story rather than replacing outbound bindings.'
			],
			compileBullets: [
				'Compile turns the authored send-email rules into Wrangler-facing `send_email` entries.',
				'The binding rules are emitted as-is; there is no preview resource provisioning story for destination addresses or sender allow-lists.',
				'The top-level `email` block is local-only and never appears in compiled output — a machine-local SMTP URL in a deployable artifact would be a credential leak.',
				'The runtime normalization step is the subtle part worth documenting because it shapes how friendly outbound code can look.'
			],
			callout: {
				tone: 'info',
				title: 'Safety rules are part of the binding',
				body: [
					'The point of the schema is not only to make email possible. It is also to keep where the worker may send email visible and reviewable.'
				]
			}
		},
		testing: {
			readTime: '4 min read',
			summary:
				'Send Email is stronger locally than many platform-service bindings because outbound email can be exercised in the default harness, while inbound email has its own related helper surface.',
			description:
				'That means the docs should teach both the outbound binding test and the conceptual split from inbound email event tests, so people do not mix the two up.',
			highlights: [
				'Use the local harness for outbound send-email bindings.',
				'`cf.email.outbox` records what the worker sent, as both a structured message and raw MIME.',
				'Use the `email` helper surface when you are testing inbound `src/email.ts` handling instead.',
				'Keep one test around the actual outbound binding contract, not only helper wrappers.',
				'Address allow-lists are worth testing because they are part of the safety contract.'
			],
			bestFor: 'Outbound notification checks and address-restriction behavior',
			defaultHarness: '`createTestContext()` plus `env.TRANSACTIONAL_EMAIL.send(...)`',
			escalation:
				'The system has external email delivery requirements beyond the local binding path',
			paragraphs: [
				'Start with one direct outbound send call through the binding and verify the success or allow-list behavior you actually care about.',
				'If you are testing inbound processing, switch mental models entirely and use the email event helper path instead of forcing everything through the outbound binding.'
			],
			mainSnippet: {
				title: 'Testing an outbound Send Email binding',
				language: 'ts',
				code: String.raw`import { afterAll, beforeAll, expect, test } from 'bun:test'
import { cf, createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('sends an outbound transactional email', async () => {
	const result = await env.TRANSACTIONAL_EMAIL.send({
		from: { email: 'noreply@example.com', name: 'My App' },
		to: 'ops@example.com',
		cc: ['audit@example.com'],
		replyTo: 'support@example.com',
		subject: 'Smoke check',
		html: '<p>Hello from Devflare</p>',
		text: 'Hello from Devflare'
	})

	// send() answers with the id stamped on the message, like the real binding.
	expect(result.messageId).toMatch(/@/)

	// The structured view is where shape assertions read best.
	const [sent] = cf.email.outbox
	expect(sent.binding).toBe('TRANSACTIONAL_EMAIL')
	expect(sent.message.to).toEqual(['ops@example.com'])
	expect(sent.message.cc).toEqual(['audit@example.com'])
	expect(sent.message.replyTo).toBe('support@example.com')

	// Generated headers and total size can only be checked on the raw MIME.
	expect(sent.raw).toContain('From: "My App" <noreply@example.com>')
	expect(sent.size).toBeLessThan(5 * 1024 * 1024)
})`
			},
			helperBullets: [
				'Use the outbound binding directly when the worker is sending mail.',
				'`cf.email.outbox` holds every message dispatched through a Send Email binding, newest last; `cf.email.sent()` returns a mutable copy, `cf.email.clearOutbox()` empties it, and `cf.email.onOutbound(cb)` observes each one as it happens.',
				'Each entry carries both representations: `message` for addresses, subject, bodies, headers and attachment metadata, and `raw` for the full MIME. Total message size (`size`, against Cloudflare 5 MiB cap) and generated headers can only be asserted on `raw`.',
				'Use the inbound `email` helper surface (`cf.email.send(...)` from `devflare/test`) when the worker is handling inbound email in `src/email.ts`.',
				'For pure offline tests, `createMockSendEmail()` (or `createMockEnv({ sendEmail })` / `createOfflineEnv()`) records every dispatched message into `.sentEmails` while still enforcing the configured sender/destination allow-lists; `createLocalSendEmailBinding()` is the underlying non-recording simulator.',
				'Keep address restrictions visible in tests when those restrictions are part of the safety story.'
			],
			caveatBullets: [
				'A suite runs in `capture` unless something explicitly asks for another mode, so nothing a test dispatches can leave the machine.',
				'The outbox is process-wide and is emptied when the context is disposed; call `cf.email.clearOutbox()` between cases that both send.',
				'Do not document inbound email helper tests as if they were proof of the outbound binding path, or vice versa.',
				'If external delivery or provider-side verification matters, add a separate integration lane rather than overfitting the local harness.',
				'The local harness is great for binding behavior, but email product workflows often still need a higher-level end-to-end check.'
			],
			callout: {
				tone: 'accent',
				title: 'Two email stories, one docs rule',
				body: [
					'Keep outbound binding docs and inbound handler docs adjacent in your head, but separate on the page. That is how people avoid testing the wrong thing.'
				]
			}
		},
		example: {
			readTime: '3 min read',
			summary:
				'This example keeps outbound email explicit: one binding, one recipient rule, one worker path that sends one message.',
			description:
				'It is enough to teach the binding accurately without dragging inbound processing or full provider workflows into the very first page.',
			highlights: [
				'One outbound binding already teaches the contract.',
				'The allowed destination is visible in config.',
				'The worker path shows the actual send call.',
				'This remains easy to test in the default harness.'
			],
			configFocus: 'Explicit destination rules',
			runtimeShape: 'Call `send()` from a worker route',
			bestUse: 'Transactional or support notifications',
			configSnippet: {
				title: 'Minimal Send Email config',
				language: 'ts',
				code: String.raw`import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'send-email-example',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		sendEmail: {
			SUPPORT_EMAIL: {
				destinationAddress: 'support@example.com'
			}
		}
	}
})`
			},
			usageSnippet: {
				title: 'Send one email from the worker',
				language: 'ts',
				code: String.raw`import { env } from 'devflare/runtime'

export async function fetch(): Promise<Response> {
	await env.SUPPORT_EMAIL.send({
		from: 'noreply@example.com',
		to: 'support@example.com',
		subject: 'New support request',
		text: 'A customer asked for help.'
	})

	return new Response('sent')
}`
			},
			notes: [
				'Keep the first outbound example narrow so the binding contract stays obvious.',
				'If you also handle inbound email elsewhere in the app, document that on the email-event pages rather than merging the two stories here.'
			],
			callout: {
				tone: 'info',
				title: 'One message is enough to teach the binding',
				body: [
					'You do not need a full notification system on the first page. One send call already proves the important contract.'
				]
			}
		}
	}
]
