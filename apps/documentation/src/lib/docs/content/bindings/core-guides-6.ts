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
		localStory: 'First-class outbound local support; distinct from inbound email event testing',
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
				'Devflare validates the main mutual-exclusion rule here too: use either one `destinationAddress` or a list of `allowedDestinationAddresses`, not both.'
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
			}
		}
	}
})`
			},
			fitBullets: [
				'Use Send Email when the worker needs to send notifications or transactional messages outward.',
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
			}
		},
		internals: {
			readTime: '3 min read',
			summary:
				'Send Email compiles into Wrangler output, normalizes message input at runtime, and supports local address restrictions instead of treating email as an unbounded free-for-all.',
			description:
				'That runtime normalization is worth calling out because it lets worker code send higher-level message shapes while Devflare translates them into the lower-level form the email path needs.',
			highlights: [
				'Compiler emits `send_email` entries from the authored binding rules.',
				'Runtime helpers normalize composed outbound messages into the raw email form when needed.',
				'Local bindings respect sender and destination restrictions.',
				'Env wrapping can surface locally created send-email bindings cleanly in tests and dev.'
			],
			normalizationFact:
				'The schema normalizes address restrictions and runtime message helpers normalize composed email input',
			compileTarget: 'Wrangler `send_email`',
			previewNote:
				'Address rules compile as authored; there is no separate preview resource lifecycle for email destinations',
			normalizationParagraphs: [
				'The schema work here is less about ids and more about safety rules: which addresses are permitted and which combinations are invalid.',
				'At runtime, Devflare can normalize higher-level email message shapes into raw MIME-backed delivery when the outbound path needs it.'
			],
			localRuntimeBullets: [
				'Local send-email bindings can be created and enforced in the default runtime/test context.',
				'Address restrictions are part of the local contract, which keeps the binding honest during development.',
				'Inbound email helper APIs exist too, but they serve the inbound event story rather than replacing outbound bindings.'
			],
			compileBullets: [
				'Compile turns the authored send-email rules into Wrangler-facing `send_email` entries.',
				'The binding rules are emitted as-is; there is no preview resource provisioning story for destination addresses or sender allow-lists.',
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
import { createTestContext, env } from 'devflare/test'

beforeAll(() => createTestContext())
afterAll(() => env.dispose())

test('sends an outbound transactional email', async () => {
	await expect(env.TRANSACTIONAL_EMAIL.send({
		from: 'noreply@example.com',
		to: 'ops@example.com',
		subject: 'Smoke check',
		text: 'Hello from Devflare'
	})).resolves.toBeUndefined()
})`
			},
			helperBullets: [
				'Use the outbound binding directly when the worker is sending mail.',
				'Use the inbound `email` helper surface (`cf.email.send(...)` from `devflare/test`) when the worker is handling inbound email in `src/email.ts`.',
				'Keep address restrictions visible in tests when those restrictions are part of the safety story.'
			],
			caveatBullets: [
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
